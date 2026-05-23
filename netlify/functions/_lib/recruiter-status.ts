import { normalizeAddress } from './http'
import { supabaseGet, supabasePatch, supabasePost } from './supabase'
import { awardQuestForUser } from './war-profile'
import { makeReferralCode } from './war-engine'
import type { WarUser } from './war-types'

export type RecruiterQuestState = 'not_started' | 'pending_review' | 'approved' | 'rejected'

export type RecruiterStatusPayload = {
  status: RecruiterQuestState
  reason: string | null
  source: 'wm_users_role' | 'command_center_recruiters' | 'command_center_waitlist' | 'legacy_wm_recruiter_applications'
  checkedAt: string
}

type ReferralLinkRow = {
  id: string
  code: string
  url?: string | null
}

type RecruiterSyncResult = {
  recruiterStatus: RecruiterStatusPayload
  roleSynced: boolean
  questAwarded: boolean
  questAlreadyAwarded: boolean
  referralLink: ReferralLinkRow | null
}

type GenericRecord = Record<string, unknown>

type LegacyApplication = {
  id: string
  user_id: string | null
  wallet_address: string
  status: string | null
  rejection_reason?: string | null
}

const APPROVED_VALUES = new Set(['approved', 'accepted', 'active', 'enabled'])
const PENDING_VALUES = new Set(['pending', 'submitted', 'review', 'in_review', 'waitlisted'])
const REJECTED_VALUES = new Set(['rejected', 'denied', 'declined', 'disabled'])
const ACCEPTED_RECRUITER_SLUG = 'accepted-recruiter-program'

function readString(record: GenericRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function readBoolean(record: GenericRecord, keys: string[]) {
  for (const key of keys) {
    if (typeof record[key] === 'boolean') return record[key] as boolean
  }
  return false
}

function hasTimestamp(record: GenericRecord, keys: string[]) {
  return keys.some((key) => typeof record[key] === 'string' && String(record[key]).trim())
}

function parseRecruiterState(record: GenericRecord): RecruiterQuestState | null {
  const statusValue = readString(record, ['status', 'application_status', 'review_status', 'recruiter_status']).toLowerCase()

  if (readBoolean(record, ['is_approved', 'approved']) || hasTimestamp(record, ['approved_at', 'accepted_at', 'activated_at'])) {
    return 'approved'
  }
  if (readBoolean(record, ['is_rejected']) || hasTimestamp(record, ['rejected_at', 'denied_at'])) {
    return 'rejected'
  }
  if (APPROVED_VALUES.has(statusValue)) return 'approved'
  if (REJECTED_VALUES.has(statusValue)) return 'rejected'
  if (PENDING_VALUES.has(statusValue)) return 'pending_review'
  if (statusValue) return 'pending_review'
  return null
}

function parseReason(record: GenericRecord) {
  return readString(record, ['rejection_reason', 'reason', 'denial_reason', 'review_notes', 'notes']) || null
}

async function safeSupabaseGet<T>(path: string) {
  try {
    return await supabaseGet<T>(path)
  } catch {
    return [] as unknown as T
  }
}

async function findCommandCenterRecruiterRecord(user: WarUser) {
  const wallet = encodeURIComponent(normalizeAddress(user.wallet_address))
  const userId = encodeURIComponent(user.id)
  const paths = [
    `/rest/v1/recruiters?select=*&wallet_address=ilike.${wallet}&order=updated_at.desc&limit=1`,
    `/rest/v1/recruiters?select=*&wallet=ilike.${wallet}&order=updated_at.desc&limit=1`,
    `/rest/v1/recruiters?select=*&user_id=eq.${userId}&order=updated_at.desc&limit=1`,
  ]

  for (const path of paths) {
    const rows = await safeSupabaseGet<GenericRecord[]>(path)
    const record = rows[0]
    if (!record) continue
    const status = parseRecruiterState(record)
    if (!status) continue
    return {
      status,
      reason: parseReason(record),
      source: 'command_center_recruiters' as const,
    }
  }

  return null
}

async function findCommandCenterWaitlistRecord(user: WarUser) {
  const wallet = encodeURIComponent(normalizeAddress(user.wallet_address))
  const userId = encodeURIComponent(user.id)
  const tables = ['recruiter_waitlist', 'recruiter_waitlists', 'waitlist', 'recruiter_applications']
  const filters = [
    `wallet_address=ilike.${wallet}`,
    `wallet=ilike.${wallet}`,
    `user_id=eq.${userId}`,
  ]

  for (const table of tables) {
    for (const filter of filters) {
      const rows = await safeSupabaseGet<GenericRecord[]>(`/rest/v1/${table}?select=*&${filter}&order=created_at.desc&limit=1`)
      const record = rows[0]
      if (!record) continue
      const status = parseRecruiterState(record)
      if (!status) continue
      return {
        status,
        reason: parseReason(record),
        source: 'command_center_waitlist' as const,
      }
    }
  }

  return null
}

async function findLegacyWarMissionsApplication(user: WarUser) {
  const wallet = encodeURIComponent(normalizeAddress(user.wallet_address))
  const userId = encodeURIComponent(user.id)
  const rows = await safeSupabaseGet<LegacyApplication[]>(`/rest/v1/wm_recruiter_applications?select=*&or=(user_id.eq.${userId},wallet_address.ilike.${wallet})&order=created_at.desc&limit=1`)
  const application = rows[0]
  if (!application) return null

  const normalized = String(application.status || '').trim().toLowerCase()
  let status: RecruiterQuestState = 'not_started'
  if (APPROVED_VALUES.has(normalized)) status = 'approved'
  else if (REJECTED_VALUES.has(normalized)) status = 'rejected'
  else if (normalized) status = 'pending_review'

  return {
    status,
    reason: application.rejection_reason || null,
    source: 'legacy_wm_recruiter_applications' as const,
  }
}

export async function getRecruiterStatus(user: WarUser): Promise<RecruiterStatusPayload> {
  const checkedAt = new Date().toISOString()

  if (user.role === 'recruiter' || user.role === 'admin') {
    return {
      status: 'approved',
      reason: null,
      source: 'wm_users_role',
      checkedAt,
    }
  }

  const recruiterRecord = await findCommandCenterRecruiterRecord(user)
  if (recruiterRecord) return { ...recruiterRecord, checkedAt }

  const waitlistRecord = await findCommandCenterWaitlistRecord(user)
  if (waitlistRecord) return { ...waitlistRecord, checkedAt }

  const legacyApplication = await findLegacyWarMissionsApplication(user)
  if (legacyApplication) return { ...legacyApplication, checkedAt }

  return {
    status: 'not_started',
    reason: null,
    source: 'command_center_waitlist',
    checkedAt,
  }
}

async function ensureReferralLink(userId: string, walletAddress: string) {
  const existing = await safeSupabaseGet<ReferralLinkRow[]>(`/rest/v1/wm_referral_links?select=id,code,url&recruiter_user_id=eq.${encodeURIComponent(userId)}&limit=1`)
  if (existing[0]) return existing[0]

  const seed = makeReferralCode(walletAddress)
  const candidates = [seed, `${seed.slice(0, 6)}01`, `${seed.slice(0, 6)}02`, `R${seed.slice(0, 7)}`]
  for (const code of candidates) {
    const taken = await safeSupabaseGet<{ id: string }[]>(`/rest/v1/wm_referral_links?select=id&code=ilike.${encodeURIComponent(code)}&limit=1`)
    if (taken[0]) continue
    const rows = await supabasePost<ReferralLinkRow[]>('/rest/v1/wm_referral_links', {
      recruiter_user_id: userId,
      code,
      url: `/r/${code}`,
      active: true,
    })
    return rows[0] || null
  }

  return null
}

export async function syncApprovedRecruiter(user: WarUser): Promise<RecruiterSyncResult> {
  const recruiterStatus = await getRecruiterStatus(user)
  if (recruiterStatus.status !== 'approved') {
    return {
      recruiterStatus,
      roleSynced: false,
      questAwarded: false,
      questAlreadyAwarded: false,
      referralLink: null,
    }
  }

  let roleSynced = false
  if (user.role !== 'recruiter' && user.role !== 'admin') {
    await supabasePatch(`/rest/v1/wm_users?id=eq.${encodeURIComponent(user.id)}`, {
      role: 'recruiter',
      updated_at: new Date().toISOString(),
    })
    roleSynced = true
  }

  const referralLink = await ensureReferralLink(user.id, user.wallet_address)
  const awardResult = await awardQuestForUser(user.id, ACCEPTED_RECRUITER_SLUG, 'recruiter_status_check', {
    recruiter_status_source: recruiterStatus.source,
    recruiter_status_checked_at: recruiterStatus.checkedAt,
  }).catch(() => ({ awarded: false, reason: 'quest_award_failed' }))

  return {
    recruiterStatus,
    roleSynced,
    questAwarded: Boolean(awardResult.awarded),
    questAlreadyAwarded: awardResult.reason === 'already_awarded',
    referralLink,
  }
}

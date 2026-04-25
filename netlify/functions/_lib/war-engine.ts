import { writeAdminAuditLog } from './admin-audit'
import { normalizeAddress, sha256 } from './http'
import { supabaseGet, supabasePatch, supabasePost } from './supabase'
import { awardQuestForUser, maybeVerifyReferralForUser } from './war-profile'
import { blackMarketQuestSlugs, dailyQuestSlugs, ensureCurrentQuestInstance, getPeriodWindow, utcDateString } from './war-periods'
import type { WarQuestCompletion, WarQuestInstance, WarQuestTemplate, WarUser } from './war-types'

type CompletionContext = {
  completion: WarQuestCompletion
  instance: WarQuestInstance
  template: WarQuestTemplate
}

const manualReviewVerificationTypes = new Set([
  'manual_review',
  'x_bio_link',
  'x_follow',
  'telegram_join',
  'discord_join',
  'telegram_discord_activity',
  'recruiter_application_accepted',
])

const urlSubmissionTypes = new Set([
  'x_unique_post_likes',
  'x_reply_quality',
  'x_quote_impressions',
  'x_post_impressions',
  'x_bio_link',
])

type SubmissionEvaluation = {
  status: WarQuestCompletion['status']
  verificationPayload: Record<string, unknown>
  rejectionReason: string | null
  shouldNotifyAdmin: boolean
  notificationPriority: 'low' | 'normal' | 'high' | 'urgent'
}

type XPostParts = {
  username: string
  postId: string
  url: string
}

function parseXPostUrl(value: string): XPostParts | null {
  const trimmed = String(value || '').trim()
  const match = trimmed.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/i)
  if (!match) return null
  return {
    username: normalizeSocialHandle(match[1]),
    postId: match[2],
    url: trimmed,
  }
}

function normalizeSocialHandle(value: string) {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase()
}

function numberPayload(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return null
}

function stringPayload(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function hasProviderCredentials(verificationType: string) {
  if (verificationType.startsWith('x_')) return Boolean(process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN)
  if (verificationType.startsWith('telegram_')) return Boolean(process.env.TELEGRAM_BOT_TOKEN)
  if (verificationType.startsWith('discord_')) return Boolean(process.env.DISCORD_BOT_TOKEN)
  return true
}

async function writeVerificationLog(input: {
  userId?: string | null
  completionId?: string | null
  provider: string
  verificationType: string
  status: string
  message: string
  metadata?: Record<string, unknown>
}) {
  await supabasePost('/rest/v1/wm_verification_logs', {
    user_id: input.userId || null,
    quest_completion_id: input.completionId || null,
    provider: input.provider,
    verification_type: input.verificationType,
    status: input.status,
    message: input.message,
    metadata: input.metadata || {},
  }).catch(() => undefined)
}

async function getLinkedXAccount(userId: string) {
  const rows = await supabaseGet<{ provider_user_id: string; username: string | null }[]>(`/rest/v1/wm_social_accounts?select=provider_user_id,username&provider=eq.x&user_id=eq.${encodeURIComponent(userId)}&limit=1`)
  return rows[0] || null
}

function getRequiredTerms(template: WarQuestTemplate) {
  const configured = template.metadata?.required_terms
  if (Array.isArray(configured)) return configured.map(String).filter(Boolean)
  return template.verification_type.startsWith('x_') ? ['memewarzone'] : []
}

function countRequiredUrls(payload: Record<string, unknown>, submittedValue: string) {
  const urls = Array.isArray(payload.urls) ? payload.urls.map(String) : [submittedValue].filter(Boolean)
  return urls.filter((url) => /^https?:\/\/(x\.com|twitter\.com)\//i.test(url.trim())).length
}

function metricSnapshotPayload(payload: Record<string, unknown>) {
  return {
    like_count: Math.max(0, Number(numberPayload(payload, ['likeCount', 'likes', 'like_count']) || 0)),
    reply_count: Math.max(0, Number(numberPayload(payload, ['replyCount', 'replies', 'reply_count']) || 0)),
    repost_count: Math.max(0, Number(numberPayload(payload, ['repostCount', 'reposts', 'repost_count']) || 0)),
    quote_count: Math.max(0, Number(numberPayload(payload, ['quoteCount', 'quotes', 'quote_count']) || 0)),
    impression_count: Math.max(0, Number(numberPayload(payload, ['impressionCount', 'impressions', 'impression_count']) || 0)),
  }
}

async function recordMetricSnapshot(completionId: string, template: WarQuestTemplate, submittedValue: string | undefined, payload: Record<string, unknown>) {
  if (!template.verification_type.startsWith('x_')) return
  const post = parseXPostUrl(String(submittedValue || ''))
  const metrics = metricSnapshotPayload(payload)
  const content = stringPayload(payload, ['content', 'text', 'postText', 'caption'])
  await supabasePost('/rest/v1/wm_social_metric_snapshots', {
    quest_completion_id: completionId,
    provider: 'x',
    external_post_id: post?.postId || null,
    ...metrics,
    raw_payload: {
      ...payload,
      post_url: post?.url || submittedValue || null,
      post_username: post?.username || null,
      content_hash: content ? sha256(content.toLowerCase().replace(/\s+/g, ' ').trim()) : null,
      provider_configured: hasProviderCredentials(template.verification_type),
    },
  }).catch(() => undefined)
}

export async function createAdminNotification(input: {
  type: string
  title: string
  message?: string | null
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  relatedUserId?: string | null
  relatedCompletionId?: string | null
  relatedApplicationId?: string | null
}) {
  await supabasePost('/rest/v1/wm_admin_notifications', {
    type: input.type,
    title: input.title,
    message: input.message || null,
    priority: input.priority || 'normal',
    status: 'open',
    related_user_id: input.relatedUserId || null,
    related_completion_id: input.relatedCompletionId || null,
    related_application_id: input.relatedApplicationId || null,
  })
}

export async function getTemplateBySlug(slug: string) {
  const rows = await supabaseGet<WarQuestTemplate[]>(`/rest/v1/wm_quest_templates?select=*&slug=eq.${encodeURIComponent(slug)}&active=eq.true&limit=1`)
  return rows[0] || null
}

async function getActiveInstance(template: WarQuestTemplate) {
  return ensureCurrentQuestInstance(template)
}

async function getCompletionContext(completionId: string): Promise<CompletionContext | null> {
  const completions = await supabaseGet<WarQuestCompletion[]>(`/rest/v1/wm_quest_completions?select=*&id=eq.${encodeURIComponent(completionId)}&limit=1`)
  const completion = completions[0]
  if (!completion) return null

  const instances = await supabaseGet<WarQuestInstance[]>(`/rest/v1/wm_quest_instances?select=*&id=eq.${completion.quest_instance_id}&limit=1`)
  const instance = instances[0]
  if (!instance) return null

  const templates = await supabaseGet<WarQuestTemplate[]>(`/rest/v1/wm_quest_templates?select=*&id=eq.${instance.quest_template_id}&limit=1`)
  const template = templates[0]
  if (!template) return null

  return { completion, instance, template }
}

function getDefaultStatusForSubmission(template: WarQuestTemplate) {
  if (manualReviewVerificationTypes.has(template.verification_type) || template.metadata?.requires_admin_review === true) return 'review' as const
  if (template.verification_type === 'wallet_connect' || template.verification_type === 'internal_event') return 'verified' as const
  return 'pending' as const
}

async function evaluateSubmission(user: WarUser, template: WarQuestTemplate, submittedValue: string | undefined, payload: Record<string, unknown>): Promise<SubmissionEvaluation> {
  const providerConfigured = hasProviderCredentials(template.verification_type)
  const basePayload = {
    ...(payload || {}),
    verification_type: template.verification_type,
    submitted_at: new Date().toISOString(),
    provider_configured: providerConfigured,
  }

  if (template.verification_type === 'wallet_connect' || template.verification_type === 'internal_event') {
    return {
      status: 'verified',
      verificationPayload: { ...basePayload, manual_fallback: false },
      rejectionReason: null,
      shouldNotifyAdmin: false,
      notificationPriority: 'normal',
    }
  }

  if (manualReviewVerificationTypes.has(template.verification_type) || template.verification_type === 'manual_review') {
    const provider = template.verification_type.startsWith('x_') ? 'x' : template.verification_type.startsWith('telegram_') ? 'telegram' : template.verification_type.startsWith('discord_') ? 'discord' : 'manual'
    await writeVerificationLog({
      userId: user.id,
      provider,
      verificationType: template.verification_type,
      status: providerConfigured ? 'queued_manual_review' : 'provider_credentials_missing',
      message: providerConfigured ? 'Submission requires manual review.' : 'Provider credentials are not configured; routed to manual review.',
      metadata: basePayload,
    })
    return {
      status: 'review',
      verificationPayload: { ...basePayload, manual_fallback: true },
      rejectionReason: null,
      shouldNotifyAdmin: true,
      notificationPriority: template.metadata?.requires_admin_review === true || template.verification_type === 'manual_review' ? 'high' : 'normal',
    }
  }

  if (template.verification_type === 'x_reply_quality' || template.verification_type === 'telegram_discord_activity') {
    await writeVerificationLog({
      userId: user.id,
      provider: template.verification_type.startsWith('x_') ? 'x' : 'community',
      verificationType: template.verification_type,
      status: providerConfigured ? 'queued_manual_quality_review' : 'provider_credentials_missing',
      message: providerConfigured ? 'Quality checks require moderator review.' : 'Provider credentials are not configured; routed to manual review.',
      metadata: basePayload,
    })
    return {
      status: 'review',
      verificationPayload: { ...basePayload, manual_fallback: true },
      rejectionReason: null,
      shouldNotifyAdmin: true,
      notificationPriority: 'normal',
    }
  }

  if (template.verification_type.startsWith('x_')) {
    const post = parseXPostUrl(String(submittedValue || ''))
    const linked = await getLinkedXAccount(user.id)
    const linkedHandles = new Set([
      normalizeSocialHandle(linked?.provider_user_id || ''),
      normalizeSocialHandle(linked?.username || ''),
    ].filter(Boolean))
    const content = stringPayload(payload, ['content', 'text', 'postText', 'caption'])
    const requiredTerms = getRequiredTerms(template)
    const metrics = metricSnapshotPayload(payload)
    const minLikes = Number(template.metadata?.min_likes || 0)
    const minImpressions = Number(template.metadata?.min_impressions || 0)
    const minChars = Number(template.metadata?.min_chars || 0)
    const requiredUrls = Number(template.metadata?.required_urls || 0)
    const failures: string[] = []
    const warnings: string[] = []

    if (!post) failures.push('invalid_x_url')
    if (post && linkedHandles.size > 0 && !linkedHandles.has(post.username)) failures.push('x_ownership_mismatch')
    if (post && linkedHandles.size === 0) warnings.push('x_account_not_linked')
    if (requiredTerms.length > 0 && content && !requiredTerms.some((term) => content.toLowerCase().includes(term.toLowerCase()))) failures.push('missing_required_term')
    if (minChars > 0 && content && content.length < minChars) failures.push('content_too_short')
    if (requiredUrls > 0 && countRequiredUrls(payload, String(submittedValue || '')) < requiredUrls) failures.push('missing_required_urls')

    const hasMetricPayload = ['likeCount', 'likes', 'like_count', 'impressionCount', 'impressions', 'impression_count'].some((key) => typeof payload[key] !== 'undefined')
    const meetsLikes = minLikes <= 0 || metrics.like_count >= minLikes
    const meetsImpressions = minImpressions <= 0 || metrics.impression_count >= minImpressions
    const thresholdMet = meetsLikes && meetsImpressions

    let status: WarQuestCompletion['status'] = template.metadata?.requires_admin_review === true ? 'review' : 'pending'
    if (failures.includes('invalid_x_url')) status = 'rejected'
    else if (failures.length > 0) status = 'review'
    else if (hasMetricPayload && thresholdMet && providerConfigured && template.metadata?.requires_admin_review !== true) status = 'verified'
    else if (hasMetricPayload && !thresholdMet) status = 'pending'
    else status = 'review'

    await writeVerificationLog({
      userId: user.id,
      provider: 'x',
      verificationType: template.verification_type,
      status,
      message: providerConfigured ? 'X submission evaluated.' : 'X provider credentials are not configured; routed to manual review.',
      metadata: {
        ...basePayload,
        post,
        metrics,
        required_terms: requiredTerms,
        failures,
        warnings,
      },
    })

    return {
      status,
      verificationPayload: {
        ...basePayload,
        post,
        metrics,
        required_terms: requiredTerms,
        failures,
        warnings,
        manual_fallback: status !== 'verified',
      },
      rejectionReason: status === 'rejected' ? 'Submit a valid X post URL.' : failures[0] || null,
      shouldNotifyAdmin: status !== 'verified',
      notificationPriority: template.metadata?.requires_admin_review === true || blackMarketQuestSlugs.has(template.slug) ? 'high' : 'normal',
    }
  }

  const status = getDefaultStatusForSubmission(template)
  return {
    status,
    verificationPayload: { ...basePayload, manual_fallback: status !== 'verified' },
    rejectionReason: null,
    shouldNotifyAdmin: status !== 'verified',
    notificationPriority: template.metadata?.requires_admin_review === true || template.verification_type === 'manual_review' ? 'high' : 'normal',
  }
}

function validateSubmission(template: WarQuestTemplate, submittedValue: string, payload: Record<string, unknown>) {
  if (urlSubmissionTypes.has(template.verification_type)) {
    const urls = Array.isArray(payload.urls) ? payload.urls.map(String) : [submittedValue]
    const validUrls = urls.filter((url) => /^https?:\/\/(x\.com|twitter\.com)\//i.test(url.trim()))
    if (validUrls.length === 0) return 'Submit a valid X post/reply/quote URL.'
  }

  if (template.verification_type === 'docs_quiz') return 'Use the quiz flow for documentation quests.'
  if (template.verification_type === 'recruiter_application_submitted') return 'Use the recruiter application flow for this quest.'
  return ''
}

async function getTemplateInstances(templateId: string) {
  return supabaseGet<Pick<WarQuestInstance, 'id' | 'period_start' | 'period_end' | 'period_type'>[]>(`/rest/v1/wm_quest_instances?select=id,period_start,period_end,period_type&quest_template_id=eq.${templateId}`)
}

async function getUserCompletionsForInstances(userId: string, instanceIds: string[]) {
  if (instanceIds.length === 0) return []
  return supabaseGet<WarQuestCompletion[]>(`/rest/v1/wm_quest_completions?select=*&user_id=eq.${encodeURIComponent(userId)}&quest_instance_id=in.(${instanceIds.join(',')})&order=created_at.desc`)
}

async function assertSubmissionLimits(input: {
  userId: string
  template: WarQuestTemplate
  activeInstance: WarQuestInstance
  existingCurrent: WarQuestCompletion | null
}) {
  const { userId, template, activeInstance, existingCurrent } = input
  if (existingCurrent && !['rejected', 'revoked', 'expired'].includes(existingCurrent.status)) return

  const instances = await getTemplateInstances(template.id)
  const instanceIds = instances.map((instance) => instance.id)
  const completions = await getUserCompletionsForInstances(userId, instanceIds)
  const activeStatuses = new Set<WarQuestCompletion['status']>(['started', 'pending', 'review', 'verified'])
  const now = new Date()

  if (template.cooldown_seconds && completions.length > 0) {
    const latest = completions.find((completion) => activeStatuses.has(completion.status))
    if (latest) {
      const latestTime = new Date(latest.updated_at || latest.created_at).getTime()
      const nextAllowed = latestTime + Number(template.cooldown_seconds) * 1000
      if (Number.isFinite(nextAllowed) && nextAllowed > now.getTime()) {
        const minutes = Math.ceil((nextAllowed - now.getTime()) / 60000)
        throw new Error(`This quest is cooling down. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`)
      }
    }
  }

  if (template.max_completions_per_day) {
    const { periodStart, periodEnd } = getPeriodWindow('daily', now)
    const dailyCount = completions.filter((completion) => {
      if (!activeStatuses.has(completion.status)) return false
      const created = new Date(completion.created_at)
      return periodStart && periodEnd && created >= new Date(periodStart) && created < new Date(periodEnd)
    }).length
    if (dailyCount >= Number(template.max_completions_per_day)) throw new Error('Daily completion limit reached for this quest.')
  }

  if (template.max_completions_per_week) {
    const { periodStart, periodEnd } = getPeriodWindow('weekly', now)
    const weeklyCount = completions.filter((completion) => {
      if (!activeStatuses.has(completion.status)) return false
      const created = new Date(completion.created_at)
      return periodStart && periodEnd && created >= new Date(periodStart) && created < new Date(periodEnd)
    }).length
    if (weeklyCount >= Number(template.max_completions_per_week)) throw new Error('Weekly completion limit reached for this quest.')
  }

  if (activeInstance.period_type === 'daily' && activeInstance.period_start) {
    const dailyXpRows = await supabaseGet<{ amount: number }[]>(`/rest/v1/wm_xp_ledger?select=amount&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&created_at=gte.${encodeURIComponent(activeInstance.period_start)}${activeInstance.period_end ? `&created_at=lt.${encodeURIComponent(activeInstance.period_end)}` : ''}`)
    const dailyXp = dailyXpRows.reduce((total, row) => total + Number(row.amount || 0), 0)
    const cap = Number(template.metadata?.daily_xp_cap || 850)
    if (dailyQuestSlugs.has(template.slug) && dailyXp >= cap) throw new Error('Daily XP cap reached. New daily quests unlock after the UTC reset.')
  }
}

async function enforceDuplicateGuards(input: {
  userId: string
  submittedValue?: string
  payload: Record<string, unknown>
}) {
  const post = parseXPostUrl(String(input.submittedValue || ''))
  const content = stringPayload(input.payload, ['content', 'text', 'postText', 'caption'])
  const fingerprints: Array<{ fingerprint_type: string; fingerprint: string }> = []

  if (post) fingerprints.push({ fingerprint_type: 'x_post_url', fingerprint: post.url.toLowerCase() })
  if (content) fingerprints.push({ fingerprint_type: 'content_hash', fingerprint: sha256(content.toLowerCase().replace(/\s+/g, ' ').trim()) })
  if (fingerprints.length === 0) return { duplicate: false }

  for (const fingerprint of fingerprints) {
    const rows = await supabaseGet<{ id: string; user_id: string; quest_completion_id: string | null }[]>(
      `/rest/v1/wm_submission_fingerprints?select=id,user_id,quest_completion_id&fingerprint_type=eq.${fingerprint.fingerprint_type}&fingerprint=eq.${encodeURIComponent(fingerprint.fingerprint)}&limit=1`,
    ).catch(() => [])
    const existing = rows[0]
    if (!existing) continue
    if (existing.user_id !== input.userId) {
      await createAdminNotification({
        type: 'duplicate_submission_flag',
        title: 'Duplicate social proof flagged',
        message: `${fingerprint.fingerprint_type}: ${fingerprint.fingerprint}`,
        priority: 'high',
        relatedUserId: input.userId,
      })
      if (fingerprint.fingerprint_type === 'x_post_url') throw new Error('This X post URL has already been submitted by another wallet.')
      return { duplicate: true, fingerprint }
    }
  }

  return { duplicate: false }
}

async function recordSubmissionFingerprints(input: {
  userId: string
  completionId: string
  submittedValue?: string
  payload: Record<string, unknown>
}) {
  const post = parseXPostUrl(String(input.submittedValue || ''))
  const content = stringPayload(input.payload, ['content', 'text', 'postText', 'caption'])
  const rows: Array<Record<string, unknown>> = []
  if (post) rows.push({ user_id: input.userId, quest_completion_id: input.completionId, fingerprint_type: 'x_post_url', fingerprint: post.url.toLowerCase() })
  if (content) rows.push({ user_id: input.userId, quest_completion_id: input.completionId, fingerprint_type: 'content_hash', fingerprint: sha256(content.toLowerCase().replace(/\s+/g, ' ').trim()) })
  for (const row of rows) {
    await supabasePost('/rest/v1/wm_submission_fingerprints', row).catch(() => undefined)
  }
}

export async function submitQuest(input: {
  user: WarUser
  questSlug: string
  submittedValue?: string
  payload?: Record<string, unknown>
}) {
  const template = await getTemplateBySlug(input.questSlug)
  if (!template) throw new Error('Quest was not found.')

  const validationError = validateSubmission(template, String(input.submittedValue || ''), input.payload || {})
  if (validationError) throw new Error(validationError)

  const instance = await getActiveInstance(template)
  if (!instance) throw new Error('Quest instance is not active.')

  const existing = await supabaseGet<WarQuestCompletion[]>(`/rest/v1/wm_quest_completions?select=*&user_id=eq.${input.user.id}&quest_instance_id=eq.${instance.id}&limit=1`)
  const now = new Date().toISOString()
  const evaluation = await evaluateSubmission(input.user, template, input.submittedValue, input.payload || {})
  const nextStatus = evaluation.status
  const verificationPayload = evaluation.verificationPayload

  await assertSubmissionLimits({
    userId: input.user.id,
    template,
    activeInstance: instance,
    existingCurrent: existing[0] || null,
  })
  await enforceDuplicateGuards({
    userId: input.user.id,
    submittedValue: input.submittedValue,
    payload: input.payload || {},
  })

  let completion: WarQuestCompletion
  if (existing[0]) {
    if (existing[0].status === 'verified' && !template.repeatable) {
      return { completion: existing[0], status: existing[0].status, alreadyCompleted: true }
    }
    if (existing[0].status === 'verified' && template.repeatable) {
      return { completion: existing[0], status: existing[0].status, alreadyCompleted: true }
    }

    const rows = await supabasePatch<WarQuestCompletion[]>(`/rest/v1/wm_quest_completions?id=eq.${existing[0].id}`, {
      status: nextStatus,
      submitted_value: input.submittedValue || null,
      verification_payload: verificationPayload,
      rejection_reason: evaluation.rejectionReason,
      verified_at: nextStatus === 'verified' ? now : null,
      updated_at: now,
    })
    completion = rows[0] || existing[0]
  } else {
    const rows = await supabasePost<WarQuestCompletion[]>('/rest/v1/wm_quest_completions', {
      user_id: input.user.id,
      quest_instance_id: instance.id,
      status: nextStatus,
      submitted_value: input.submittedValue || null,
      verification_payload: verificationPayload,
      rejection_reason: evaluation.rejectionReason,
      verified_at: nextStatus === 'verified' ? now : null,
      updated_at: now,
    })
    completion = rows[0]
  }

  if (!completion) throw new Error('Unable to create quest completion.')
  await Promise.all([
    recordMetricSnapshot(completion.id, template, input.submittedValue, input.payload || {}),
    recordSubmissionFingerprints({
      userId: input.user.id,
      completionId: completion.id,
      submittedValue: input.submittedValue,
      payload: input.payload || {},
    }),
  ])

  if (nextStatus === 'verified') {
    await awardQuestForUser(input.user.id, template.slug, `quest_submit:${template.verification_type}`, verificationPayload)
    await maybeVerifyReferralForUser(input.user.id).catch(() => undefined)
  } else {
    await writeVerificationLog({
      userId: input.user.id,
      completionId: completion.id,
      provider: template.verification_type.startsWith('x_') ? 'x' : 'war_missions',
      verificationType: template.verification_type,
      status: nextStatus,
      message: evaluation.rejectionReason || 'Submission is waiting for review or external verification.',
      metadata: verificationPayload,
    })
    await createAdminNotification({
      type: 'quest_review_requested',
      title: `${template.title} needs review`,
      message: evaluation.rejectionReason || input.submittedValue || `Verification type: ${template.verification_type}`,
      priority: evaluation.notificationPriority,
      relatedUserId: input.user.id,
      relatedCompletionId: completion.id,
    })
  }

  return { completion, status: nextStatus, alreadyCompleted: false }
}

export async function reviewCompletion(input: {
  completionId: string
  status: 'verified' | 'rejected' | 'revoked' | 'review'
  reason: string
  adminUserId: string
}) {
  const context = await getCompletionContext(input.completionId)
  if (!context) throw new Error('Quest completion was not found.')

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    status: input.status,
    rejection_reason: input.status === 'rejected' || input.status === 'revoked' ? input.reason : null,
    updated_at: now,
  }
  if (input.status === 'verified') patch.verified_at = now

  const rows = await supabasePatch<WarQuestCompletion[]>(`/rest/v1/wm_quest_completions?id=eq.${context.completion.id}`, patch)
  const completion = rows[0] || context.completion

  if (input.status === 'verified') {
    await awardQuestForUser(completion.user_id, context.template.slug, `admin_review:${input.reason}`, {
      ...(completion.verification_payload || {}),
      reviewed_by: input.adminUserId,
      reviewed_at: now,
    })
    await enforceHighestTierOnly(completion, context.template, input.reason)
    await maybeAwardDailyBonus(completion.user_id)
    await maybeVerifyReferralForUser(completion.user_id).catch(() => undefined)
  }

  if (input.status === 'rejected' || input.status === 'revoked') {
    await supabasePatch(`/rest/v1/wm_xp_ledger?quest_completion_id=eq.${completion.id}&status=eq.active`, {
      status: 'revoked',
      revoked_at: now,
      reason: input.reason,
    })
  }

  await writeAdminAuditLog({
    adminUserId: input.adminUserId,
    action: `completion.${input.status}`,
    targetType: 'wm_quest_completion',
    targetId: completion.id,
    before: { status: context.completion.status },
    after: { status: input.status, reason: input.reason },
  })

  return completion
}

function completionPostKey(completion: Pick<WarQuestCompletion, 'submitted_value' | 'verification_payload'>) {
  const payloadPost = completion.verification_payload?.post
  if (payloadPost && typeof payloadPost === 'object' && 'postId' in payloadPost) return String((payloadPost as { postId?: string }).postId || '')
  return parseXPostUrl(String(completion.submitted_value || ''))?.postId || ''
}

async function enforceHighestTierOnly(completion: WarQuestCompletion, template: WarQuestTemplate, reason: string) {
  const group = typeof template.metadata?.highest_tier_group === 'string' ? template.metadata.highest_tier_group : ''
  if (!group) return

  const postKey = completionPostKey(completion)
  if (!postKey) return

  const allCompletions = await supabaseGet<WarQuestCompletion[]>(`/rest/v1/wm_quest_completions?select=*&user_id=eq.${encodeURIComponent(completion.user_id)}&status=in.(verified,review,pending)`)
  const instanceIds = Array.from(new Set(allCompletions.map((row) => row.quest_instance_id)))
  if (instanceIds.length === 0) return
  const instances = await supabaseGet<Pick<WarQuestInstance, 'id' | 'quest_template_id'>[]>(`/rest/v1/wm_quest_instances?select=id,quest_template_id&id=in.(${instanceIds.join(',')})`)
  const templateIds = Array.from(new Set(instances.map((instance) => instance.quest_template_id)))
  const templates = templateIds.length
    ? await supabaseGet<Pick<WarQuestTemplate, 'id' | 'slug' | 'xp_reward' | 'metadata'>[]>(`/rest/v1/wm_quest_templates?select=id,slug,xp_reward,metadata&id=in.(${templateIds.join(',')})`)
    : []
  const instanceById = new Map(instances.map((instance) => [instance.id, instance]))
  const templateById = new Map(templates.map((row) => [row.id, row]))
  const sameGroup = allCompletions
    .map((row) => {
      const instance = instanceById.get(row.quest_instance_id)
      const rowTemplate = instance ? templateById.get(instance.quest_template_id) : null
      return { completion: row, template: rowTemplate }
    })
    .filter((entry) => entry.template?.metadata?.highest_tier_group === group && completionPostKey(entry.completion) === postKey)

  if (sameGroup.length <= 1) return
  const highest = sameGroup.reduce((best, entry) => {
    const bestXp = Number(best.template?.xp_reward || 0)
    const entryXp = Number(entry.template?.xp_reward || 0)
    return entryXp > bestXp ? entry : best
  }, sameGroup[0])
  const now = new Date().toISOString()

  for (const entry of sameGroup) {
    if (entry.completion.id === highest.completion.id) continue
    if (entry.completion.status === 'verified') {
      await supabasePatch(`/rest/v1/wm_quest_completions?id=eq.${entry.completion.id}`, {
        status: 'revoked',
        rejection_reason: `Highest-tier-only: ${reason}`,
        updated_at: now,
      })
      await supabasePatch(`/rest/v1/wm_xp_ledger?quest_completion_id=eq.${entry.completion.id}&status=eq.active`, {
        status: 'revoked',
        revoked_at: now,
        reason: `Highest-tier-only: ${reason}`,
      })
    }
  }
}

export async function recheckSocialCompletion(input: {
  completionId: string
  adminUserId: string
  metrics?: Record<string, unknown>
  available?: boolean
  expired?: boolean
  reason: string
}) {
  const context = await getCompletionContext(input.completionId)
  if (!context) throw new Error('Quest completion was not found.')

  const metrics = metricSnapshotPayload(input.metrics || {})
  const now = new Date().toISOString()
  const payload = {
    ...(context.completion.verification_payload || {}),
    metrics,
    rechecked_by: input.adminUserId,
    rechecked_at: now,
    recheck_reason: input.reason,
    available: input.available !== false,
  }

  await supabasePatch(`/rest/v1/wm_quest_completions?id=eq.${context.completion.id}`, {
    verification_payload: payload,
    updated_at: now,
  })
  await recordMetricSnapshot(context.completion.id, context.template, context.completion.submitted_value || undefined, {
    ...(input.metrics || {}),
    admin_recheck: true,
    reason: input.reason,
  })

  if (input.available === false) {
    return reviewCompletion({
      completionId: input.completionId,
      status: 'revoked',
      reason: input.reason || 'Post deleted or unavailable.',
      adminUserId: input.adminUserId,
    })
  }

  if (input.expired) {
    const rows = await supabasePatch<WarQuestCompletion[]>(`/rest/v1/wm_quest_completions?id=eq.${context.completion.id}`, {
      status: 'expired',
      rejection_reason: input.reason || 'Submission expired before reaching threshold.',
      verification_payload: payload,
      updated_at: now,
    })
    await writeVerificationLog({
      userId: context.completion.user_id,
      completionId: context.completion.id,
      provider: context.template.verification_type.startsWith('x_') ? 'x' : 'war_missions',
      verificationType: context.template.verification_type,
      status: 'expired',
      message: input.reason || 'Submission expired before reaching threshold.',
      metadata: payload,
    })
    return rows[0] || context.completion
  }

  const minLikes = Number(context.template.metadata?.min_likes || 0)
  const minImpressions = Number(context.template.metadata?.min_impressions || 0)
  const thresholdMet = metrics.like_count >= minLikes && metrics.impression_count >= minImpressions

  if (thresholdMet && context.template.metadata?.requires_admin_review !== true) {
    return reviewCompletion({
      completionId: input.completionId,
      status: 'verified',
      reason: input.reason || 'Social metrics rechecked.',
      adminUserId: input.adminUserId,
    })
  }

  const status: WarQuestCompletion['status'] = thresholdMet ? 'review' : 'pending'
  const rows = await supabasePatch<WarQuestCompletion[]>(`/rest/v1/wm_quest_completions?id=eq.${context.completion.id}`, {
    status,
    rejection_reason: thresholdMet ? null : 'Waiting for threshold.',
    verification_payload: payload,
    updated_at: now,
  })
  await writeVerificationLog({
    userId: context.completion.user_id,
    completionId: context.completion.id,
    provider: context.template.verification_type.startsWith('x_') ? 'x' : 'war_missions',
    verificationType: context.template.verification_type,
    status,
    message: thresholdMet ? 'Threshold met; manual approval required.' : 'Threshold has not been reached yet.',
    metadata: payload,
  })
  return rows[0] || context.completion
}

export async function maybeAwardDailyBonus(userId: string) {
  const requiredSlugs = ['drop-frontline-propaganda', 'provide-covering-fire', 'relay-the-battleplan', 'maintain-radio-discipline']
  const templates = await supabaseGet<WarQuestTemplate[]>(`/rest/v1/wm_quest_templates?select=*&slug=in.(${requiredSlugs.join(',')})&active=eq.true`)
  if (templates.length < requiredSlugs.length) return false
  const instances = await Promise.all(templates.map((template) => ensureCurrentQuestInstance(template)))
  const completionRows = await supabaseGet<Pick<WarQuestCompletion, 'quest_instance_id'>[]>(`/rest/v1/wm_quest_completions?select=quest_instance_id&user_id=eq.${encodeURIComponent(userId)}&quest_instance_id=in.(${instances.map((instance) => instance.id).join(',')})&status=eq.verified`)
  const verifiedInstanceIds = new Set(completionRows.map((completion) => completion.quest_instance_id))
  if (!instances.every((instance) => verifiedInstanceIds.has(instance.id))) return false
  await awardQuestForUser(userId, 'complete-daily-warpath', 'daily_warpath_complete_all', { date_utc: utcDateString() })
  return true
}

async function getVerifiedQuestSlugs(userId: string) {
  const rows = await supabaseGet<Pick<WarQuestCompletion, 'quest_instance_id'>[]>(`/rest/v1/wm_quest_completions?select=quest_instance_id&user_id=eq.${encodeURIComponent(userId)}&status=eq.verified`)
  if (rows.length === 0) return new Set<string>()
  const instanceIds = Array.from(new Set(rows.map((row) => row.quest_instance_id)))
  const instances = await supabaseGet<{ id: string; quest_template_id: string }[]>(`/rest/v1/wm_quest_instances?select=id,quest_template_id&id=in.(${instanceIds.join(',')})`)
  const templateIds = Array.from(new Set(instances.map((instance) => instance.quest_template_id)))
  const templates = templateIds.length > 0
    ? await supabaseGet<Pick<WarQuestTemplate, 'id' | 'slug'>[]>(`/rest/v1/wm_quest_templates?select=id,slug&id=in.(${templateIds.join(',')})`)
    : []
  const slugByTemplateId = new Map(templates.map((template) => [template.id, template.slug]))
  return new Set(instances.map((instance) => slugByTemplateId.get(instance.quest_template_id)).filter((slug): slug is string => Boolean(slug)))
}

export async function getCurrentLeaderboard(periodType: 'all_time' | 'daily' | 'weekly' | 'season' = 'all_time') {
  const users = await supabaseGet<Pick<WarUser, 'id' | 'wallet_address' | 'display_name' | 'avatar_url' | 'is_banned'>[]>('/rest/v1/wm_users?select=id,wallet_address,display_name,avatar_url,is_banned&is_banned=eq.false')
  const userById = new Map(users.map((user) => [user.id, user]))
  const ledgerRows = await supabaseGet<{ user_id: string; amount: number; created_at: string }[]>('/rest/v1/wm_xp_ledger?select=user_id,amount,created_at&status=eq.active')
  const now = new Date()
  const totals = new Map<string, number>()

  for (const row of ledgerRows) {
    if (!userById.has(row.user_id)) continue
    if (!isInPeriod(row.created_at, periodType, now)) continue
    totals.set(row.user_id, (totals.get(row.user_id) || 0) + Number(row.amount || 0))
  }

  return Array.from(totals.entries())
    .map(([userId, xpTotal]) => ({ user: userById.get(userId)!, xpTotal }))
    .sort((a, b) => b.xpTotal - a.xpTotal || a.user.wallet_address.localeCompare(b.user.wallet_address))
    .map((entry, index) => ({
      rank: index + 1,
      userId: entry.user.id,
      walletAddress: entry.user.wallet_address,
      displayName: entry.user.display_name,
      avatarUrl: entry.user.avatar_url,
      xpTotal: entry.xpTotal,
      periodType,
    }))
}

function isInPeriod(value: string, periodType: string, now: Date) {
  if (periodType === 'all_time') return true
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (periodType === 'daily') return date >= start
  if (periodType === 'weekly') {
    const day = start.getUTCDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    start.setUTCDate(start.getUTCDate() + mondayOffset)
    return date >= start
  }
  if (periodType === 'season') {
    const seasonStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    return date >= seasonStart
  }
  return true
}

export function makeReferralCode(address: string) {
  return normalizeAddress(address).replace(/^0x/, '').slice(0, 8).toUpperCase()
}

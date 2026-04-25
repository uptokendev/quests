import { normalizeAddress } from './http'
import { supabaseGet, supabasePatch, supabasePost } from './supabase'
import { getBadgesForUser } from './war-badges'
import { dailyQuestSlugs, ensureCurrentQuestInstance, utcDateString } from './war-periods'
import type { WarProfile, WarQuestCompletion, WarQuestInstance, WarQuestTemplate, WarUser } from './war-types'

export async function getUserByWallet(address: string) {
  const rows = await supabaseGet<WarUser[]>(`/rest/v1/wm_users?select=*&wallet_address=ilike.${encodeURIComponent(normalizeAddress(address))}&limit=1`)
  return rows[0] || null
}

export async function getUserById(userId: string) {
  const rows = await supabaseGet<WarUser[]>(`/rest/v1/wm_users?select=*&id=eq.${encodeURIComponent(userId)}&limit=1`)
  return rows[0] || null
}

export async function ensureUser(address: string) {
  const walletAddress = normalizeAddress(address)
  const existing = await getUserByWallet(walletAddress)
  if (existing) return existing

  const rows = await supabasePost<WarUser[]>('/rest/v1/wm_users', {
    wallet_address: walletAddress,
    role: 'user',
  })
  if (!rows[0]) throw new Error('Unable to create War Missions profile.')
  return rows[0]
}

export async function updateUserProfile(userId: string, body: { displayName?: string | null; avatarUrl?: string | null }) {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.displayName !== 'undefined') payload.display_name = body.displayName ? String(body.displayName).trim().slice(0, 80) : null
  if (typeof body.avatarUrl !== 'undefined') payload.avatar_url = body.avatarUrl ? String(body.avatarUrl).trim().slice(0, 500) : null

  const rows = await supabasePatch<WarUser[]>(`/rest/v1/wm_users?id=eq.${encodeURIComponent(userId)}`, payload)
  if (!rows[0]) throw new Error('Unable to update War Missions profile.')
  return rows[0]
}

async function getXpTotal(userId: string) {
  const rows = await supabaseGet<{ amount: number }[]>(`/rest/v1/wm_xp_ledger?select=amount&user_id=eq.${encodeURIComponent(userId)}&status=eq.active`)
  return rows.reduce((total, row) => total + Number(row.amount || 0), 0)
}

function utcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

async function updateDailyProgressForAward(userId: string, questSlug: string, amount: number) {
  if (!dailyQuestSlugs.has(questSlug)) return

  const dateUtc = utcDateString()
  const existing = await supabaseGet<{
    id: string
    quests_completed: number
    daily_xp_earned: number
    completed_all: boolean
    streak_count: number
  }[]>(`/rest/v1/wm_daily_progress?select=id,quests_completed,daily_xp_earned,completed_all,streak_count&user_id=eq.${encodeURIComponent(userId)}&date_utc=eq.${dateUtc}&limit=1`)

  const completedAll = questSlug === 'complete-daily-warpath'
  let streakCount = existing[0]?.streak_count || 0
  if (completedAll && !existing[0]?.completed_all) {
    const yesterday = new Date()
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    const yesterdayRows = await supabaseGet<{ streak_count: number; completed_all: boolean }[]>(`/rest/v1/wm_daily_progress?select=streak_count,completed_all&user_id=eq.${encodeURIComponent(userId)}&date_utc=eq.${utcDateString(yesterday)}&limit=1`)
    streakCount = (yesterdayRows[0]?.completed_all ? Number(yesterdayRows[0].streak_count || 0) : 0) + 1
  }

  if (existing[0]) {
    await supabasePatch(`/rest/v1/wm_daily_progress?id=eq.${existing[0].id}`, {
      quests_completed: Number(existing[0].quests_completed || 0) + 1,
      daily_xp_earned: Number(existing[0].daily_xp_earned || 0) + amount,
      completed_all: existing[0].completed_all || completedAll,
      streak_count: Math.max(Number(existing[0].streak_count || 0), streakCount),
      updated_at: new Date().toISOString(),
    })
    return
  }

  await supabasePost('/rest/v1/wm_daily_progress', {
    user_id: userId,
    date_utc: dateUtc,
    quests_completed: 1,
    daily_xp_earned: amount,
    completed_all: completedAll,
    streak_count: completedAll ? streakCount : 0,
  })
}

async function getDailyProgress(userId: string) {
  const rows = await supabaseGet<{
    date_utc: string
    quests_completed: number
    daily_xp_earned: number
    completed_all: boolean
    streak_count: number
    raffle_tickets_earned: number
    updated_at: string
  }[]>(`/rest/v1/wm_daily_progress?select=date_utc,quests_completed,daily_xp_earned,completed_all,streak_count,raffle_tickets_earned,updated_at&user_id=eq.${encodeURIComponent(userId)}&date_utc=eq.${utcDateString()}&limit=1`)

  const current = rows[0]
  return {
    dateUtc: current?.date_utc || utcDateString(),
    questsCompleted: Number(current?.quests_completed || 0),
    dailyXpEarned: Number(current?.daily_xp_earned || 0),
    completedAll: Boolean(current?.completed_all),
    streakCount: Number(current?.streak_count || 0),
    raffleTicketsEarned: Number(current?.raffle_tickets_earned || 0),
    resetAt: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1)).toISOString(),
    updatedAt: current?.updated_at || null,
  }
}

async function getCompletedQuestSlugs(userId: string) {
  const completions = await supabaseGet<Pick<WarQuestCompletion, 'quest_instance_id'>[]>(`/rest/v1/wm_quest_completions?select=quest_instance_id&user_id=eq.${encodeURIComponent(userId)}&status=eq.verified`)
  if (completions.length === 0) return []

  const instanceIds = Array.from(new Set(completions.map((completion) => completion.quest_instance_id)))
  const instances = await supabaseGet<Pick<WarQuestInstance, 'id' | 'quest_template_id'>[]>(`/rest/v1/wm_quest_instances?select=id,quest_template_id&id=in.(${instanceIds.join(',')})`)
  if (instances.length === 0) return []

  const templateIds = Array.from(new Set(instances.map((instance) => instance.quest_template_id)))
  const templates = await supabaseGet<Pick<WarQuestTemplate, 'id' | 'slug'>[]>(`/rest/v1/wm_quest_templates?select=id,slug&id=in.(${templateIds.join(',')})`)
  const slugByTemplateId = new Map(templates.map((template) => [template.id, template.slug]))
  return instances.map((instance) => slugByTemplateId.get(instance.quest_template_id)).filter((slug): slug is string => Boolean(slug))
}

export async function buildWarProfile(user: WarUser): Promise<WarProfile> {
  const [xpTotal, completedQuestSlugs, dailyProgress, badgeState] = await Promise.all([
    getXpTotal(user.id),
    getCompletedQuestSlugs(user.id),
    getDailyProgress(user.id),
    getBadgesForUser(user.id, true),
  ])

  return {
    id: user.id,
    walletAddress: user.wallet_address,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    role: user.role,
    riskScore: user.risk_score,
    isBanned: user.is_banned,
    xpTotal,
    completedQuestSlugs,
    dailyProgress,
    badges: badgeState.badges,
    badgeSummary: badgeState.badgeSummary,
  }
}

export async function awardQuestForUser(userId: string, slug: string, reason: string, verificationPayload: Record<string, unknown> = {}) {
  const templates = await supabaseGet<WarQuestTemplate[]>(`/rest/v1/wm_quest_templates?select=*&slug=eq.${encodeURIComponent(slug)}&active=eq.true&limit=1`)
  const template = templates[0]
  if (!template) return { awarded: false, completionId: null, reason: 'quest_template_missing' }

  const instance = await ensureCurrentQuestInstance(template)

  const existing = await supabaseGet<Pick<WarQuestCompletion, 'id' | 'status'>[]>(`/rest/v1/wm_quest_completions?select=id,status&user_id=eq.${encodeURIComponent(userId)}&quest_instance_id=eq.${instance.id}&limit=1`)
  const now = new Date().toISOString()
  let completionId = existing[0]?.id || null

  if (existing[0]?.status === 'verified') {
    completionId = existing[0].id
  } else if (existing[0]) {
    const rows = await supabasePatch<WarQuestCompletion[]>(`/rest/v1/wm_quest_completions?id=eq.${existing[0].id}`, {
      status: 'verified',
      verification_payload: verificationPayload,
      rejection_reason: null,
      verified_at: now,
      updated_at: now,
    })
    completionId = rows[0]?.id || existing[0].id
  } else {
    const rows = await supabasePost<WarQuestCompletion[]>('/rest/v1/wm_quest_completions', {
      user_id: userId,
      quest_instance_id: instance.id,
      status: 'verified',
      submitted_value: reason,
      verification_payload: verificationPayload,
      verified_at: now,
      updated_at: now,
    })
    completionId = rows[0]?.id || null
  }

  if (!completionId) throw new Error('Unable to create quest completion.')

  const ledgerRows = await supabaseGet<{ id: string }[]>(`/rest/v1/wm_xp_ledger?select=id&quest_completion_id=eq.${completionId}&status=eq.active&limit=1`)
  if (!ledgerRows[0]) {
    const amount = Number(instance.xp_reward || template.xp_reward || 0)
    if (dailyQuestSlugs.has(template.slug)) {
      const progressRows = await supabaseGet<{ daily_xp_earned: number }[]>(`/rest/v1/wm_daily_progress?select=daily_xp_earned&user_id=eq.${encodeURIComponent(userId)}&date_utc=eq.${utcDateString()}&limit=1`)
      const currentDailyXp = Number(progressRows[0]?.daily_xp_earned || 0)
      const cap = Number(template.metadata?.daily_xp_cap || 850)
      if (currentDailyXp >= cap || currentDailyXp + amount > cap) return { awarded: false, completionId, reason: 'daily_xp_cap_reached' }
    }
    await supabasePost('/rest/v1/wm_xp_ledger', {
      user_id: userId,
      quest_completion_id: completionId,
      amount,
      status: 'active',
      reason,
    })
    await updateDailyProgressForAward(userId, template.slug, amount)
    return { awarded: true, completionId, reason: 'awarded' }
  }

  return { awarded: false, completionId, reason: 'already_awarded' }
}

export async function syncReferralMilestones(recruiterUserId: string) {
  const rows = await supabaseGet<{ referred_user_id: string | null; status: string }[]>(`/rest/v1/wm_referral_attributions?select=referred_user_id,status&recruiter_user_id=eq.${encodeURIComponent(recruiterUserId)}&status=in.(verified,locked)`)
  const referredUserIds = Array.from(new Set(rows.map((row) => row.referred_user_id).filter((id): id is string => Boolean(id))))
  const verifiedCount = referredUserIds.length
  const milestones = [
    { count: 2, slug: 'assemble-fireteam' },
    { count: 4, slug: 'form-full-squad' },
    { count: 6, slug: 'expand-vanguard' },
    { count: 8, slug: 'build-platoon' },
    { count: 10, slug: 'deploy-strike-force' },
    { count: 20, slug: 'lead-battalion' },
    { count: 30, slug: 'mobilize-brigade' },
  ]

  const awarded: string[] = []
  for (const milestone of milestones) {
    if (verifiedCount < milestone.count) continue
    const result = await awardQuestForUser(recruiterUserId, milestone.slug, 'referral_milestone_sync', {
      verified_recruits: verifiedCount,
      milestone: milestone.count,
    })
    if (result.awarded) awarded.push(milestone.slug)
  }

  let startHereCount = 0
  for (const referredUserId of referredUserIds) {
    if (await hasCompletedStartHere(referredUserId)) startHereCount += 1
  }
  if (startHereCount >= 5) {
    const result = await awardQuestForUser(recruiterUserId, 'activate-warband', 'referral_start_here_milestone_sync', {
      verified_recruits_completed_start_here: startHereCount,
    })
    if (result.awarded) awarded.push('activate-warband')
  }

  return { verifiedCount, startHereCount, awarded }
}

async function hasCompletedStartHere(userId: string) {
  const required = ['intercept-global-comms', 'access-underground-comms', 'report-to-base-camp', 'take-the-oath']
  const completed = new Set(await getCompletedQuestSlugs(userId))
  return required.every((slug) => completed.has(slug))
}

export async function maybeVerifyReferralForUser(userId: string) {
  if (!(await hasCompletedStartHere(userId))) return { verified: false, recruitersSynced: 0 }

  await supabasePatch(`/rest/v1/wm_referral_attributions?referred_user_id=eq.${encodeURIComponent(userId)}&status=in.(pending,linked)`, {
    status: 'verified',
    verified_at: new Date().toISOString(),
  })

  const rows = await supabaseGet<{ recruiter_user_id: string }[]>(`/rest/v1/wm_referral_attributions?select=recruiter_user_id&referred_user_id=eq.${encodeURIComponent(userId)}&status=eq.verified`)
  const recruiterIds = Array.from(new Set(rows.map((row) => row.recruiter_user_id)))
  for (const recruiterUserId of recruiterIds) {
    await syncReferralMilestones(recruiterUserId)
  }
  return { verified: recruiterIds.length > 0, recruitersSynced: recruiterIds.length }
}

import { insertRow, selectOne, selectRows, updateOne, updateRows } from './supabase.mjs'

export const PROVIDER_QUEST_SLUG = {
  x: 'intercept-global-comms',
  telegram: 'access-underground-comms',
  discord: 'report-to-base-camp',
}

const dailyQuestSlugs = new Set([
  'drop-frontline-propaganda',
  'provide-covering-fire',
  'relay-the-battleplan',
  'maintain-radio-discipline',
  'complete-daily-warpath',
])

const blackMarketQuestSlugs = new Set([
  'signal-leak',
  'broadcasting-static',
  'viral-contagion',
  'total-info-dominance',
])

function getTemplatePeriodType(template) {
  const configured = typeof template?.metadata?.period_type === 'string' ? template.metadata.period_type : ''
  if (['daily', 'weekly', 'season', 'once'].includes(configured)) return configured
  if (!template.repeatable) return 'once'
  if (dailyQuestSlugs.has(template.slug) || template.max_completions_per_day) return 'daily'
  if (blackMarketQuestSlugs.has(template.slug) || template.max_completions_per_week) return 'weekly'
  return 'daily'
}

function getPeriodWindow(periodType, now = new Date()) {
  if (periodType === 'once') return { periodStart: null, periodEnd: null }

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (periodType === 'weekly') {
    const day = start.getUTCDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    start.setUTCDate(start.getUTCDate() + mondayOffset)
  }
  if (periodType === 'season') start.setUTCDate(1)

  const end = new Date(start)
  if (periodType === 'daily') end.setUTCDate(end.getUTCDate() + 1)
  if (periodType === 'weekly') end.setUTCDate(end.getUTCDate() + 7)
  if (periodType === 'season') end.setUTCMonth(end.getUTCMonth() + 1)

  return { periodStart: start.toISOString(), periodEnd: end.toISOString() }
}

async function ensureCurrentQuestInstance(template, now = new Date()) {
  const periodType = getTemplatePeriodType(template)
  const { periodStart, periodEnd } = getPeriodWindow(periodType, now)

  if (periodType === 'once') {
    const existing = await selectOne('wm_quest_instances', {
      select: '*',
      quest_template_id: `eq.${template.id}`,
      period_type: 'eq.once',
      active: 'eq.true',
      order: 'created_at.asc',
      limit: '1',
    })
    if (existing) return existing
  } else if (periodStart && periodEnd) {
    const existing = await selectOne('wm_quest_instances', {
      select: '*',
      quest_template_id: `eq.${template.id}`,
      period_type: `eq.${periodType}`,
      period_start: `gte.${periodStart}`,
      period_end: `lte.${periodEnd}`,
      order: 'created_at.asc',
      limit: '1',
    })
    if (existing) return existing
  }

  const metadata = {
    ...(template.metadata || {}),
    generated_by: 'telegram_connector',
    generated_at: now.toISOString(),
  }

  return insertRow('wm_quest_instances', {
    quest_template_id: template.id,
    period_type: periodType,
    period_start: periodStart,
    period_end: periodEnd,
    xp_reward: Number(template.xp_reward || 0),
    active: true,
    metadata,
  })
}

export async function createAdminNotification(input) {
  await insertRow('wm_admin_notifications', {
    type: input.type,
    title: input.title,
    message: input.message || null,
    priority: input.priority || 'normal',
    status: 'open',
    related_user_id: input.relatedUserId || null,
    related_completion_id: input.relatedCompletionId || null,
    related_application_id: input.relatedApplicationId || null,
  }).catch(() => undefined)
}

export async function writeVerificationLog(input) {
  await insertRow('wm_verification_logs', {
    user_id: input.userId || null,
    quest_completion_id: input.completionId || null,
    provider: input.provider,
    verification_type: input.verificationType,
    status: input.status,
    message: input.message,
    metadata: input.metadata || {},
  }).catch(() => undefined)
}

export async function submitSocialStartHereQuest({
  user,
  provider,
  username,
  providerUserId,
  verified = true,
  source = 'telegram_bot_webhook',
  note = 'Social identity linked through bot/API connector.',
  metadata = {},
}) {
  const questSlug = PROVIDER_QUEST_SLUG[provider]
  const template = await selectOne('wm_quest_templates', {
    select: '*',
    slug: `eq.${questSlug}`,
    active: 'eq.true',
    limit: '1',
  })
  if (!template) throw new Error('Quest was not found.')

  const instance = await ensureCurrentQuestInstance(template)
  const existing = await selectOne('wm_quest_completions', {
    select: '*',
    user_id: `eq.${user.id}`,
    quest_instance_id: `eq.${instance.id}`,
    limit: '1',
  })

  if (existing?.status === 'verified') {
    return { completion: existing, status: existing.status, alreadyCompleted: true }
  }

  const nextStatus = verified ? 'verified' : 'review'
  const now = new Date().toISOString()
  const payload = {
    provider,
    username,
    providerUserId,
    source,
    note,
    manual_fallback: false,
    provider_configured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME),
    submitted_at: now,
    ...metadata,
  }

  let completion
  if (existing) {
    completion = await updateOne(
      'wm_quest_completions',
      { id: `eq.${existing.id}` },
      {
        status: nextStatus,
        submitted_value: username,
        verification_payload: payload,
        rejection_reason: null,
        verified_at: verified ? now : null,
        updated_at: now,
      },
    )
  } else {
    completion = await insertRow('wm_quest_completions', {
      user_id: user.id,
      quest_instance_id: instance.id,
      status: nextStatus,
      submitted_value: username,
      verification_payload: payload,
      rejection_reason: null,
      verified_at: verified ? now : null,
      updated_at: now,
    })
  }

  if (!completion) throw new Error('Unable to create social verification completion.')

  await writeVerificationLog({
    userId: user.id,
    completionId: completion.id,
    provider,
    verificationType: template.verification_type,
    status: nextStatus,
    message: verified ? 'Social identity verified through Telegram bot connector.' : 'Social identity linked for review.',
    metadata: payload,
  })

  return { completion, status: nextStatus, alreadyCompleted: false }
}

export async function consumeTelegramChallenge(token) {
  const now = new Date().toISOString()
  const rows = await updateRows(
    'wm_social_link_challenges',
    {
      provider: 'eq.telegram',
      token: `eq.${token}`,
      consumed_at: 'is.null',
      expires_at: `gt.${now}`,
    },
    { consumed_at: now },
  )
  return Array.isArray(rows) ? rows[0] || null : null
}

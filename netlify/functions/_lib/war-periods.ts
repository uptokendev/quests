import { supabaseGet, supabasePatch, supabasePost } from './supabase'
import type { WarQuestInstance, WarQuestTemplate } from './war-types'

export type QuestPeriodType = WarQuestInstance['period_type']

export const dailyQuestSlugs = new Set([
  'drop-frontline-propaganda',
  'provide-covering-fire',
  'relay-the-battleplan',
  'maintain-radio-discipline',
  'complete-daily-warpath',
])

export const blackMarketQuestSlugs = new Set([
  'signal-leak',
  'broadcasting-static',
  'viral-contagion',
  'total-info-dominance',
])

export function utcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

export function getTemplatePeriodType(template: Pick<WarQuestTemplate, 'slug' | 'repeatable' | 'max_completions_per_day' | 'max_completions_per_week' | 'metadata'>): QuestPeriodType {
  const configured = typeof template.metadata?.period_type === 'string' ? template.metadata.period_type : ''
  if (configured === 'daily' || configured === 'weekly' || configured === 'season' || configured === 'once') return configured
  if (!template.repeatable) return 'once'
  if (dailyQuestSlugs.has(template.slug) || template.max_completions_per_day) return 'daily'
  if (blackMarketQuestSlugs.has(template.slug) || template.max_completions_per_week) return 'weekly'
  return 'daily'
}

export function getPeriodWindow(periodType: QuestPeriodType, now = new Date()) {
  if (periodType === 'once') return { periodStart: null, periodEnd: null }

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (periodType === 'weekly') {
    const day = start.getUTCDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    start.setUTCDate(start.getUTCDate() + mondayOffset)
  }
  if (periodType === 'season') {
    start.setUTCDate(1)
  }

  const end = new Date(start)
  if (periodType === 'daily') end.setUTCDate(end.getUTCDate() + 1)
  if (periodType === 'weekly') end.setUTCDate(end.getUTCDate() + 7)
  if (periodType === 'season') end.setUTCMonth(end.getUTCMonth() + 1)

  return {
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
  }
}

async function getExistingCurrentInstance(template: WarQuestTemplate, periodType: QuestPeriodType, periodStart: string | null, periodEnd: string | null) {
  if (periodType === 'once') {
    const rows = await supabaseGet<WarQuestInstance[]>(`/rest/v1/wm_quest_instances?select=*&quest_template_id=eq.${template.id}&period_type=eq.once&active=eq.true&order=created_at.asc&limit=1`)
    return rows[0] || null
  }

  if (!periodStart || !periodEnd) return null
  const rows = await supabaseGet<WarQuestInstance[]>(
    `/rest/v1/wm_quest_instances?select=*&quest_template_id=eq.${template.id}&period_type=eq.${periodType}&period_start=gte.${encodeURIComponent(periodStart)}&period_start=lt.${encodeURIComponent(periodEnd)}&limit=1`,
  )
  return rows[0] || null
}

async function deactivateStaleInstances(template: WarQuestTemplate, periodType: QuestPeriodType, periodStart: string | null) {
  if (periodType === 'once') return
  await supabasePatch(`/rest/v1/wm_quest_instances?quest_template_id=eq.${template.id}&period_type=eq.${periodType}&active=eq.true&period_start=is.null`, {
    active: false,
  }).catch(() => undefined)
  if (periodStart) {
    await supabasePatch(`/rest/v1/wm_quest_instances?quest_template_id=eq.${template.id}&period_type=eq.${periodType}&active=eq.true&period_start=lt.${encodeURIComponent(periodStart)}`, {
      active: false,
    }).catch(() => undefined)
  }
}

export async function ensureCurrentQuestInstance(template: WarQuestTemplate, now = new Date()) {
  const periodType = getTemplatePeriodType(template)
  const { periodStart, periodEnd } = getPeriodWindow(periodType, now)
  const existing = await getExistingCurrentInstance(template, periodType, periodStart, periodEnd)
  await deactivateStaleInstances(template, periodType, periodStart)
  if (existing) return existing

  const payload = {
    quest_template_id: template.id,
    period_type: periodType,
    period_start: periodStart,
    period_end: periodEnd,
    xp_reward: template.xp_reward,
    active: true,
    metadata: {
      ...(template.metadata || {}),
      generated_by: 'war_periods',
      generated_at: now.toISOString(),
    },
  }

  try {
    const rows = await supabasePost<WarQuestInstance[]>('/rest/v1/wm_quest_instances', payload)
    if (rows[0]) return rows[0]
  } catch {
    const retry = await getExistingCurrentInstance(template, periodType, periodStart, periodEnd)
    if (retry) return retry
    throw new Error('Unable to generate current quest instance.')
  }

  throw new Error('Unable to generate current quest instance.')
}

export async function ensureCurrentQuestInstances(templates: WarQuestTemplate[], now = new Date()) {
  const entries: Array<[string, WarQuestInstance]> = []
  for (const template of templates) {
    const instance = await ensureCurrentQuestInstance(template, now)
    entries.push([template.id, instance])
  }
  return new Map(entries)
}

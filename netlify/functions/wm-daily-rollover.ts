import { json } from './_lib/http'
import { supabaseGet, supabasePatch } from './_lib/supabase'
import { ensureCurrentQuestInstances } from './_lib/war-periods'
import type { WarQuestCompletion, WarQuestInstance, WarQuestTemplate } from './_lib/war-types'

export const config = {
  schedule: '0 0 * * *',
}

function isScheduledInvocation(event: any) {
  return Boolean(
    event.headers?.['x-netlify-scheduled'] ||
    event.headers?.['X-Netlify-Scheduled'] ||
    event.headers?.['x-nf-event'] ||
    event.headers?.['X-Nf-Event'],
  )
}

function isAuthorizedManualRun(event: any) {
  const secret = process.env.WM_MAINTENANCE_SECRET
  if (!secret) return false
  const authorization = String(event.headers?.authorization || event.headers?.Authorization || '')
  return authorization === `Bearer ${secret}`
}

export const handler = async (event: any) => {
  if (!isScheduledInvocation(event) && !isAuthorizedManualRun(event)) {
    return json(401, { error: 'Maintenance secret is required.' })
  }

  try {
    const now = new Date().toISOString()
    const templates = await supabaseGet<WarQuestTemplate[]>('/rest/v1/wm_quest_templates?select=*&active=eq.true')
    const instances = await ensureCurrentQuestInstances(templates)
    const staleDailyInstances = await supabaseGet<Pick<WarQuestInstance, 'id'>[]>(`/rest/v1/wm_quest_instances?select=id&period_type=eq.daily&period_end=lt.${encodeURIComponent(now)}&active=eq.false`)

    let expiredCompletions = 0
    for (const instance of staleDailyInstances) {
      const rows = await supabaseGet<WarQuestCompletion[]>(`/rest/v1/wm_quest_completions?select=*&quest_instance_id=eq.${instance.id}&status=in.(started,pending,review)`)
      if (rows.length === 0) continue
      await supabasePatch(`/rest/v1/wm_quest_completions?quest_instance_id=eq.${instance.id}&status=in.(started,pending,review)`, {
        status: 'expired',
        rejection_reason: 'Daily reset expired this submission.',
        updated_at: now,
      })
      expiredCompletions += rows.length
    }

    return json(200, {
      ok: true,
      generatedInstances: instances.size,
      expiredCompletions,
      rolledOverAt: now,
    })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

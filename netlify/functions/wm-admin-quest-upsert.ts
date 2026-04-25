import { requireAdmin } from './_lib/war-admin'
import { writeAdminAuditLog } from './_lib/admin-audit'
import { json, readBody } from './_lib/http'
import { supabaseGet, supabasePatch, supabasePost } from './_lib/supabase'

type QuestUpsertBody = {
  entity?: 'category' | 'template' | 'instance'
  id?: string
  slug?: string
  categorySlug?: string
  title?: string
  description?: string
  displayOrder?: number
  xpReward?: number
  verificationType?: string
  repeatable?: boolean
  maxCompletionsPerDay?: number | null
  maxCompletionsPerWeek?: number | null
  cooldownSeconds?: number | null
  periodType?: 'once' | 'daily' | 'weekly' | 'season'
  active?: boolean
  metadata?: Record<string, unknown>
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  try {
    const { response, admin } = await requireAdmin(event)
    if (response || !admin) return response

    const body = readBody<QuestUpsertBody>(event) || {}
    const entity = body.entity || 'template'
    if (!['category', 'template', 'instance'].includes(entity)) return json(400, { error: 'Unsupported entity.' })

    const result = entity === 'category'
      ? await upsertCategory(body)
      : entity === 'template'
        ? await upsertTemplate(body)
        : await upsertInstance(body)

    await writeAdminAuditLog({
      adminUserId: admin.id,
      action: `${entity}.upsert`,
      targetType: `wm_quest_${entity}`,
      targetId: result.id || null,
      after: result,
    })

    return json(200, { ok: true, entity, row: result })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

async function upsertCategory(body: QuestUpsertBody) {
  const payload = {
    slug: String(body.slug || '').trim(),
    title: String(body.title || '').trim(),
    description: body.description || null,
    display_order: Number(body.displayOrder || 0),
    active: body.active !== false,
  }
  if (!payload.slug || !payload.title) throw new Error('Category slug and title are required.')
  if (body.id) {
    const rows = await supabasePatch<any[]>(`/rest/v1/wm_quest_categories?id=eq.${encodeURIComponent(body.id)}`, payload)
    return rows[0]
  }
  const existing = await supabaseGet<any[]>(`/rest/v1/wm_quest_categories?select=*&slug=eq.${encodeURIComponent(payload.slug)}&limit=1`)
  if (existing[0]) {
    const rows = await supabasePatch<any[]>(`/rest/v1/wm_quest_categories?id=eq.${existing[0].id}`, payload)
    return rows[0]
  }
  const rows = await supabasePost<any[]>('/rest/v1/wm_quest_categories', payload)
  return rows[0]
}

async function upsertTemplate(body: QuestUpsertBody) {
  const categorySlug = String(body.categorySlug || '').trim()
  const categories = await supabaseGet<{ id: string }[]>(`/rest/v1/wm_quest_categories?select=id&slug=eq.${encodeURIComponent(categorySlug)}&limit=1`)
  const category = categories[0]
  if (!category) throw new Error('Category was not found.')

  const payload = {
    category_id: category.id,
    slug: String(body.slug || '').trim(),
    title: String(body.title || '').trim(),
    description: body.description || null,
    xp_reward: Number(body.xpReward || 0),
    verification_type: String(body.verificationType || '').trim(),
    repeatable: Boolean(body.repeatable),
    max_completions_per_day: body.maxCompletionsPerDay ?? null,
    max_completions_per_week: body.maxCompletionsPerWeek ?? null,
    cooldown_seconds: body.cooldownSeconds ?? null,
    active: body.active !== false,
    metadata: body.metadata || {},
  }
  if (!payload.slug || !payload.title || !payload.verification_type) throw new Error('Template slug, title, and verificationType are required.')

  if (body.id) {
    const rows = await supabasePatch<any[]>(`/rest/v1/wm_quest_templates?id=eq.${encodeURIComponent(body.id)}`, payload)
    return rows[0]
  }
  const existing = await supabaseGet<any[]>(`/rest/v1/wm_quest_templates?select=*&slug=eq.${encodeURIComponent(payload.slug)}&limit=1`)
  if (existing[0]) {
    const rows = await supabasePatch<any[]>(`/rest/v1/wm_quest_templates?id=eq.${existing[0].id}`, payload)
    return rows[0]
  }
  const rows = await supabasePost<any[]>('/rest/v1/wm_quest_templates', payload)
  return rows[0]
}

async function upsertInstance(body: QuestUpsertBody) {
  const templateSlug = String(body.slug || '').trim()
  const templates = await supabaseGet<{ id: string; xp_reward: number; metadata: Record<string, unknown> }[]>(`/rest/v1/wm_quest_templates?select=id,xp_reward,metadata&slug=eq.${encodeURIComponent(templateSlug)}&limit=1`)
  const template = templates[0]
  if (!template) throw new Error('Template was not found.')

  const payload = {
    quest_template_id: template.id,
    period_type: body.periodType || 'once',
    xp_reward: Number(body.xpReward || template.xp_reward || 0),
    active: body.active !== false,
    metadata: body.metadata || template.metadata || {},
  }

  if (body.id) {
    const rows = await supabasePatch<any[]>(`/rest/v1/wm_quest_instances?id=eq.${encodeURIComponent(body.id)}`, payload)
    return rows[0]
  }
  const rows = await supabasePost<any[]>('/rest/v1/wm_quest_instances', payload)
  return rows[0]
}

import { json } from './_lib/http'
import { readWarAuth } from './_lib/war-auth'
import { buildWarProfile, getUserById } from './_lib/war-profile'
import { supabaseGet } from './_lib/supabase'
import { ensureCurrentQuestInstances } from './_lib/war-periods'
import type { WarProfile, WarQuestCompletion, WarQuestInstance, WarQuestTemplate } from './_lib/war-types'

type QuestCategoryRow = {
  id: string
  slug: string
  title: string
  description: string | null
  display_order: number
  active: boolean
}

type QuestResponse = {
  instanceId: string | null
  templateId: string
  slug: string
  title: string
  description: string | null
  xpReward: number
  verificationType: string
  repeatable: boolean
  periodType: WarQuestInstance['period_type'] | null
  metadata: Record<string, unknown>
  status: WarQuestCompletion['status'] | null
  rejectionReason: string | null
}

async function getOptionalProfile(event: any): Promise<WarProfile | null> {
  const auth = readWarAuth(event)
  if (!auth) return null
  const user = await getUserById(auth.userId)
  if (!user || user.wallet_address !== auth.address || user.is_banned) return null
  return buildWarProfile(user)
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' })

  try {
    const [categories, templates, profile] = await Promise.all([
      supabaseGet<QuestCategoryRow[]>('/rest/v1/wm_quest_categories?select=*&active=eq.true&order=display_order.asc'),
      supabaseGet<WarQuestTemplate[]>('/rest/v1/wm_quest_templates?select=*&active=eq.true&order=created_at.asc'),
      getOptionalProfile(event),
    ])
    const instanceByTemplateId = await ensureCurrentQuestInstances(templates)

    const completions = profile
      ? await supabaseGet<WarQuestCompletion[]>(`/rest/v1/wm_quest_completions?select=*&user_id=eq.${encodeURIComponent(profile.id)}&order=updated_at.desc`)
      : []

    const completionByInstanceId = new Map(completions.map((completion) => [completion.quest_instance_id, completion]))

    const questsByCategoryId = templates.reduce<Record<string, QuestResponse[]>>((acc, template) => {
      const instance = instanceByTemplateId.get(template.id) || null
      const completion = instance ? completionByInstanceId.get(instance.id) || null : null
      const quest: QuestResponse = {
        instanceId: instance?.id || null,
        templateId: template.id,
        slug: template.slug,
        title: template.title,
        description: template.description,
        xpReward: instance?.xp_reward || template.xp_reward,
        verificationType: template.verification_type,
        repeatable: template.repeatable,
        periodType: instance?.period_type || null,
        metadata: { ...(template.metadata || {}), ...(instance?.metadata || {}) },
        status: completion?.status || null,
        rejectionReason: completion?.rejection_reason || null,
      }

      acc[template.category_id] = [...(acc[template.category_id] || []), quest]
      return acc
    }, {})

    return json(200, {
      ok: true,
      profile,
      categories: categories.map((category) => ({
        slug: category.slug,
        title: category.title,
        description: category.description,
        displayOrder: category.display_order,
        quests: questsByCategoryId[category.id] || [],
      })),
    })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

import { requireAdmin } from './_lib/war-admin'
import { writeAdminAuditLog } from './_lib/admin-audit'
import { json, readBody } from './_lib/http'
import { recheckSocialCompletion, reviewCompletion } from './_lib/war-engine'
import { verifySocialMembership } from './_lib/war-social-checks'
import { supabaseGet, supabasePatch, supabasePost } from './_lib/supabase'

type SocialRecheckBody = {
  completionId?: string
  metrics?: Record<string, unknown>
  available?: boolean
  expired?: boolean
  reason?: string
}

type CompletionRow = {
  id: string
  user_id: string
  quest_instance_id: string
  status: string
  submitted_value: string | null
  verification_payload: Record<string, unknown>
  rejection_reason: string | null
}

type InstanceRow = {
  id: string
  quest_template_id: string
}

type TemplateRow = {
  id: string
  slug: string
  title: string
  verification_type: string
}

async function loadCompletionContext(completionId: string) {
  const completions = await supabaseGet<CompletionRow[]>(`/rest/v1/wm_quest_completions?select=id,user_id,quest_instance_id,status,submitted_value,verification_payload,rejection_reason&id=eq.${encodeURIComponent(completionId)}&limit=1`)
  const completion = completions[0]
  if (!completion) return null

  const instances = await supabaseGet<InstanceRow[]>(`/rest/v1/wm_quest_instances?select=id,quest_template_id&id=eq.${encodeURIComponent(completion.quest_instance_id)}&limit=1`)
  const instance = instances[0]
  if (!instance) return null

  const templates = await supabaseGet<TemplateRow[]>(`/rest/v1/wm_quest_templates?select=id,slug,title,verification_type&id=eq.${encodeURIComponent(instance.quest_template_id)}&limit=1`)
  const template = templates[0]
  if (!template) return null

  return { completion, template }
}

async function writeVerificationLog(input: {
  userId: string
  completionId: string
  provider: string
  verificationType: string
  status: string
  message: string
  metadata?: Record<string, unknown>
}) {
  await supabasePost('/rest/v1/wm_verification_logs', {
    user_id: input.userId,
    quest_completion_id: input.completionId,
    provider: input.provider,
    verification_type: input.verificationType,
    status: input.status,
    message: input.message,
    metadata: input.metadata || {},
  }).catch(() => undefined)
}

function needsManualReview(message: string, metadata: Record<string, unknown>) {
  if (metadata.configured === false) return true
  return /failed/i.test(message)
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  try {
    const { response, admin } = await requireAdmin(event)
    if (response || !admin) return response

    const body = readBody<SocialRecheckBody>(event) || {}
    const completionId = String(body.completionId || '').trim()
    const reason = String(body.reason || '').trim() || 'Social metrics recheck.'
    if (!completionId) return json(400, { error: 'Provide completionId.' })

    const context = await loadCompletionContext(completionId)
    if (!context) return json(404, { error: 'Quest completion was not found.' })

    if (context.template.verification_type === 'telegram_join' || context.template.verification_type === 'discord_join') {
      const check = await verifySocialMembership(context.completion.user_id, context.template.verification_type)
      if (!check) return json(400, { error: 'Unsupported social verification type.' })

      const now = new Date().toISOString()
      const payload = {
        ...(context.completion.verification_payload || {}),
        social_check: check.metadata,
        social_check_message: check.message,
        rechecked_by: admin.id,
        rechecked_at: now,
        recheck_reason: reason,
      }

      await supabasePatch(`/rest/v1/wm_quest_completions?id=eq.${encodeURIComponent(completionId)}`, {
        verification_payload: payload,
        updated_at: now,
      })

      let completion: unknown
      if (check.verified) {
        await writeVerificationLog({
          userId: context.completion.user_id,
          completionId,
          provider: check.provider,
          verificationType: context.template.verification_type,
          status: 'verified',
          message: check.message,
          metadata: payload,
        })
        completion = await reviewCompletion({
          completionId,
          status: 'verified',
          reason: reason || `${check.provider} membership verified.`,
          adminUserId: admin.id,
        })
      } else {
        const status = needsManualReview(check.message, check.metadata) ? 'review' : 'pending'
        const rows = await supabasePatch<CompletionRow[]>(`/rest/v1/wm_quest_completions?id=eq.${encodeURIComponent(completionId)}`, {
          status,
          rejection_reason: status === 'review' ? check.message : null,
          verification_payload: payload,
          updated_at: now,
        })
        await writeVerificationLog({
          userId: context.completion.user_id,
          completionId,
          provider: check.provider,
          verificationType: context.template.verification_type,
          status,
          message: check.message,
          metadata: payload,
        })
        completion = rows[0] || context.completion
      }

      await writeAdminAuditLog({
        adminUserId: admin.id,
        action: 'social.recheck.identity',
        targetType: 'wm_quest_completion',
        targetId: completionId,
        after: { provider: check.provider, verified: check.verified, reason, metadata: check.metadata },
      })

      return json(200, { ok: true, completion })
    }

    const completion = await recheckSocialCompletion({
      completionId,
      adminUserId: admin.id,
      metrics: body.metrics || {},
      available: body.available,
      expired: body.expired,
      reason,
    })

    await writeAdminAuditLog({
      adminUserId: admin.id,
      action: 'social.recheck',
      targetType: 'wm_quest_completion',
      targetId: completionId,
      after: { metrics: body.metrics || {}, available: body.available, expired: body.expired, reason },
    })

    return json(200, { ok: true, completion })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

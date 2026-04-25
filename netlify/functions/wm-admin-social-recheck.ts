import { requireAdmin } from './_lib/war-admin'
import { writeAdminAuditLog } from './_lib/admin-audit'
import { json, readBody } from './_lib/http'
import { recheckSocialCompletion } from './_lib/war-engine'

type SocialRecheckBody = {
  completionId?: string
  metrics?: Record<string, unknown>
  available?: boolean
  expired?: boolean
  reason?: string
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

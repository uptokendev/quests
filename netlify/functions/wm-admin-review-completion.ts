import { requireAdmin } from './_lib/war-admin'
import { json, readBody } from './_lib/http'
import { reviewCompletion } from './_lib/war-engine'

type ReviewBody = {
  completionId?: string
  status?: 'verified' | 'rejected' | 'revoked' | 'review'
  reason?: string
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  try {
    const { response, admin } = await requireAdmin(event)
    if (response || !admin) return response

    const body = readBody<ReviewBody>(event) || {}
    const completionId = String(body.completionId || '').trim()
    const status = body.status || 'verified'
    const reason = String(body.reason || '').trim()
    if (!completionId) return json(400, { error: 'Provide completionId.' })
    if (!['verified', 'rejected', 'revoked', 'review'].includes(status)) return json(400, { error: 'Unsupported review status.' })
    if (!reason) return json(400, { error: 'Provide a reason.' })

    const completion = await reviewCompletion({
      completionId,
      status,
      reason,
      adminUserId: admin.id,
    })

    return json(200, { ok: true, completion })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

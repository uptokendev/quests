import { requireAdmin } from './_lib/war-admin'
import { json, readBody } from './_lib/http'
import { supabaseGet, supabasePatch } from './_lib/supabase'
import { writeAdminAuditLog } from './_lib/admin-audit'

type NotificationBody = {
  id?: string
  status?: 'open' | 'assigned' | 'resolved' | 'dismissed'
}

export const handler = async (event: any) => {
  try {
    const { response, admin } = await requireAdmin(event)
    if (response || !admin) return response

    if (event.httpMethod === 'GET') {
      const status = String(event.queryStringParameters?.status || '')
      const statusFilter = status ? `&status=eq.${encodeURIComponent(status)}` : ''
      const rows = await supabaseGet(`/rest/v1/wm_admin_notifications?select=*&order=created_at.desc${statusFilter}`)
      return json(200, { ok: true, rows })
    }

    if (event.httpMethod === 'PATCH') {
      const body = readBody<NotificationBody>(event) || {}
      const id = String(body.id || '').trim()
      const status = body.status || 'resolved'
      if (!id) return json(400, { error: 'Provide id.' })
      if (!['open', 'assigned', 'resolved', 'dismissed'].includes(status)) return json(400, { error: 'Unsupported status.' })

      const rows = await supabasePatch(`/rest/v1/wm_admin_notifications?id=eq.${encodeURIComponent(id)}`, {
        status,
        resolved_at: status === 'resolved' || status === 'dismissed' ? new Date().toISOString() : null,
        assigned_to: status === 'assigned' ? admin.id : null,
      })

      await writeAdminAuditLog({
        adminUserId: admin.id,
        action: `notification.${status}`,
        targetType: 'wm_admin_notification',
        targetId: id,
        after: { status },
      })

      return json(200, { ok: true, rows })
    }

    return json(405, { error: 'Method not allowed.' })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

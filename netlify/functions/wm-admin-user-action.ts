import { requireAdmin } from './_lib/war-admin'
import { writeAdminAuditLog } from './_lib/admin-audit'
import { json, normalizeAddress, readBody } from './_lib/http'
import { supabaseGet, supabasePatch } from './_lib/supabase'
import type { WarUser } from './_lib/war-types'

type UserActionBody = {
  userId?: string
  walletAddress?: string
  action?: 'ban' | 'unban'
  reason?: string
}

async function findUser(body: UserActionBody) {
  if (body.userId) {
    const rows = await supabaseGet<WarUser[]>(`/rest/v1/wm_users?select=*&id=eq.${encodeURIComponent(body.userId)}&limit=1`)
    return rows[0] || null
  }
  const walletAddress = normalizeAddress(body.walletAddress || '')
  if (!walletAddress) return null
  const rows = await supabaseGet<WarUser[]>(`/rest/v1/wm_users?select=*&wallet_address=ilike.${encodeURIComponent(walletAddress)}&limit=1`)
  return rows[0] || null
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  try {
    const { response, admin } = await requireAdmin(event)
    if (response || !admin) return response

    const body = readBody<UserActionBody>(event) || {}
    const action = body.action || 'ban'
    const reason = String(body.reason || '').trim()
    if (!['ban', 'unban'].includes(action)) return json(400, { error: 'Unsupported action.' })
    if (!reason) return json(400, { error: 'Provide a reason.' })

    const user = await findUser(body)
    if (!user) return json(404, { error: 'User was not found.' })

    const rows = await supabasePatch<WarUser[]>(`/rest/v1/wm_users?id=eq.${user.id}`, {
      is_banned: action === 'ban',
      updated_at: new Date().toISOString(),
    })

    await writeAdminAuditLog({
      adminUserId: admin.id,
      action: `user.${action}`,
      targetType: 'wm_user',
      targetId: user.id,
      before: { is_banned: user.is_banned },
      after: { is_banned: action === 'ban', reason },
    })

    return json(200, { ok: true, user: rows[0] || user })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

import { isAdminWallet } from './admin-auth'
import { json } from './http'
import { readWarAuth } from './war-auth'
import { getUserById } from './war-profile'

export async function requireAdmin(event: any) {
  const auth = readWarAuth(event)
  if (!auth) return { response: json(401, { error: 'Connect an admin wallet.' }), admin: null }

  const admin = await getUserById(auth.userId)
  const allowed = admin?.role === 'admin' || isAdminWallet(auth.address)
  if (!admin || admin.wallet_address !== auth.address || admin.is_banned || !allowed) {
    return { response: json(403, { error: 'This wallet is not allowed to manage War Missions.' }), admin: null }
  }

  return { response: null, admin }
}

import { json, readBody } from './_lib/http'
import { readWarAuth, unauthorized } from './_lib/war-auth'
import { buildWarProfile, getUserById, updateUserProfile } from './_lib/war-profile'

type ProfileBody = {
  displayName?: string | null
  avatarUrl?: string | null
}

export const handler = async (event: any) => {
  const auth = readWarAuth(event)
  if (!auth) return unauthorized()
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'PATCH') return json(405, { error: 'Method not allowed.' })

  try {
    let user = await getUserById(auth.userId)
    if (!user || user.wallet_address !== auth.address) return unauthorized('War Missions session is no longer valid.')
    if (user.is_banned) return json(403, { error: 'This wallet is excluded from War Missions.' })

    if (event.httpMethod === 'PATCH') {
      const body = readBody<ProfileBody>(event) || {}
      user = await updateUserProfile(user.id, body)
    }

    const profile = await buildWarProfile(user)
    return json(200, { ok: true, profile })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

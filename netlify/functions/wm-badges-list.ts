import { json } from './_lib/http'
import { readWarAuth } from './_lib/war-auth'
import { getBadgesForUser } from './_lib/war-badges'
import { getUserById } from './_lib/war-profile'

export const handler = async (event: any) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' })

  try {
    const auth = readWarAuth(event)
    if (!auth) {
      const badgeState = await getBadgesForUser(null, false)
      return json(200, { ok: true, authenticated: false, ...badgeState })
    }

    const user = await getUserById(auth.userId)
    if (!user || user.wallet_address !== auth.address || user.is_banned) {
      const badgeState = await getBadgesForUser(null, false)
      return json(200, { ok: true, authenticated: false, ...badgeState })
    }

    const badgeState = await getBadgesForUser(user.id, true)
    return json(200, { ok: true, authenticated: true, ...badgeState })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

import { json } from './_lib/http'
import { readWarAuth, unauthorized } from './_lib/war-auth'
import { getUserById } from './_lib/war-profile'
import { getRecruiterStatus } from './_lib/recruiter-status'

export const handler = async (event: any) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' })

  const auth = readWarAuth(event)
  if (!auth) return unauthorized()

  try {
    const user = await getUserById(auth.userId)
    if (!user || user.wallet_address !== auth.address) return unauthorized('War Missions session is no longer valid.')
    if (user.is_banned) return json(403, { error: 'This wallet is excluded from War Missions.' })

    const recruiterStatus = await getRecruiterStatus(user)
    return json(200, { ok: true, recruiterStatus })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

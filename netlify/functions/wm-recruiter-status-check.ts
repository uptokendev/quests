import { json } from './_lib/http'
import { readWarAuth, unauthorized } from './_lib/war-auth'
import { buildWarProfile, getUserById } from './_lib/war-profile'
import { enforceRateLimit } from './_lib/rate-limit'
import { syncApprovedRecruiter } from './_lib/recruiter-status'

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  const auth = readWarAuth(event)
  if (!auth) return unauthorized()

  try {
    let user = await getUserById(auth.userId)
    if (!user || user.wallet_address !== auth.address) return unauthorized('War Missions session is no longer valid.')
    if (user.is_banned) return json(403, { error: 'This wallet is excluded from War Missions.' })

    await enforceRateLimit({
      action: 'recruiter_status_check',
      key: user.id,
      limit: 12,
      windowSeconds: 60,
    })

    const sync = await syncApprovedRecruiter(user)
    if (sync.roleSynced) {
      user = (await getUserById(user.id)) || user
    }
    const profile = await buildWarProfile(user)

    return json(200, {
      ok: true,
      recruiterStatus: sync.recruiterStatus,
      roleSynced: sync.roleSynced,
      questAwarded: sync.questAwarded,
      questAlreadyAwarded: sync.questAlreadyAwarded,
      referralLink: sync.referralLink,
      profile,
    })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

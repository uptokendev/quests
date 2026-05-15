import { json } from './_lib/http'
import { readWarAuth, unauthorized } from './_lib/war-auth'
import { getUserById } from './_lib/war-profile'

const DEFAULT_COMMAND_CENTER_URL = 'https://memewarzonefrontend-production.up.railway.app/command/recruiter'

function getCommandCenterUrl() {
  return String(
    process.env.COMMAND_CENTER_RECRUITER_URL ||
      process.env.VITE_COMMAND_CENTER_RECRUITER_URL ||
      DEFAULT_COMMAND_CENTER_URL,
  ).trim()
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  const auth = readWarAuth(event)
  if (!auth) return unauthorized()

  try {
    const user = await getUserById(auth.userId)
    if (!user || user.wallet_address !== auth.address) return unauthorized('War Missions session is no longer valid.')
    if (user.is_banned) return json(403, { error: 'This wallet is excluded from War Missions.' })

    return json(409, {
      ok: false,
      code: 'RECRUITER_SIGNUP_MOVED',
      error: 'Recruiter signup and management now live inside the MemeWarzone Command Center.',
      commandCenterUrl: getCommandCenterUrl(),
    })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

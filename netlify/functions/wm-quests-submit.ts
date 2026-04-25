import { json, readBody } from './_lib/http'
import { readWarAuth, unauthorized } from './_lib/war-auth'
import { submitQuest } from './_lib/war-engine'
import { buildWarProfile, getUserById } from './_lib/war-profile'
import { enforceRateLimit } from './_lib/rate-limit'

type SubmitBody = {
  questSlug?: string
  submittedValue?: string
  payload?: Record<string, unknown>
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  const auth = readWarAuth(event)
  if (!auth) return unauthorized()

  try {
    const user = await getUserById(auth.userId)
    if (!user || user.wallet_address !== auth.address) return unauthorized('War Missions session is no longer valid.')
    if (user.is_banned) return json(403, { error: 'This wallet is excluded from War Missions.' })

    const body = readBody<SubmitBody>(event) || {}
    const questSlug = String(body.questSlug || '').trim()
    if (!questSlug) return json(400, { error: 'Provide questSlug.' })
    await enforceRateLimit({
      action: 'quest_submit',
      key: `${user.id}:${questSlug}`,
      limit: 10,
      windowSeconds: 60,
    })

    const result = await submitQuest({
      user,
      questSlug,
      submittedValue: body.submittedValue,
      payload: body.payload || {},
    })
    const profile = await buildWarProfile(user)

    return json(200, { ok: true, ...result, profile })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

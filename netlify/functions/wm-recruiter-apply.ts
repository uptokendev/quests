import { json, readBody } from './_lib/http'
import { readWarAuth, unauthorized } from './_lib/war-auth'
import { createAdminNotification } from './_lib/war-engine'
import { awardQuestForUser, buildWarProfile, getUserById } from './_lib/war-profile'
import { supabasePost } from './_lib/supabase'
import { enforceRateLimit } from './_lib/rate-limit'

type RecruiterApplyBody = {
  xUsername?: string
  telegramUsername?: string
  discordUsername?: string
  motivation?: string
  expectedRecruits?: number
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  const auth = readWarAuth(event)
  if (!auth) return unauthorized()

  try {
    const user = await getUserById(auth.userId)
    if (!user || user.wallet_address !== auth.address) return unauthorized('War Missions session is no longer valid.')
    if (user.is_banned) return json(403, { error: 'This wallet is excluded from War Missions.' })
    await enforceRateLimit({
      action: 'recruiter_apply',
      key: user.id,
      limit: 3,
      windowSeconds: 86400,
    })

    const body = readBody<RecruiterApplyBody>(event) || {}
    const rows = await supabasePost<{ id: string }[]>('/rest/v1/wm_recruiter_applications', {
      user_id: user.id,
      wallet_address: user.wallet_address,
      x_username: String(body.xUsername || '').trim() || null,
      telegram_username: String(body.telegramUsername || '').trim() || null,
      discord_username: String(body.discordUsername || '').trim() || null,
      motivation: String(body.motivation || '').trim() || null,
      expected_recruits: Number(body.expectedRecruits || 0) || null,
      status: 'submitted',
    })
    const applicationId = rows[0]?.id || null

    await awardQuestForUser(user.id, 'apply-recruiter-program', 'recruiter_application_submitted', { application_id: applicationId })
    await createAdminNotification({
      type: 'recruiter_application_submitted',
      title: 'Recruiter application submitted',
      message: user.wallet_address,
      priority: 'normal',
      relatedUserId: user.id,
      relatedApplicationId: applicationId,
    })

    const profile = await buildWarProfile(user)
    return json(200, { ok: true, applicationId, profile })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

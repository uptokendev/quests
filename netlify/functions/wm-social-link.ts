import { json, readBody } from './_lib/http'
import { supabaseGet, supabasePatch, supabasePost } from './_lib/supabase'
import { readWarAuth, unauthorized } from './_lib/war-auth'
import { createAdminNotification, submitQuest } from './_lib/war-engine'
import { buildWarProfile, getUserById } from './_lib/war-profile'
import { enforceRateLimit } from './_lib/rate-limit'

type SocialLinkBody = {
  provider?: 'x' | 'discord' | 'telegram'
  providerUserId?: string
  username?: string
}

const providerQuestSlug: Record<string, string> = {
  x: 'intercept-global-comms',
  telegram: 'access-underground-comms',
  discord: 'report-to-base-camp',
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  const auth = readWarAuth(event)
  if (!auth) return unauthorized()

  try {
    const user = await getUserById(auth.userId)
    if (!user || user.wallet_address !== auth.address) return unauthorized('War Missions session is no longer valid.')
    if (user.is_banned) return json(403, { error: 'This wallet is excluded from War Missions.' })

    const body = readBody<SocialLinkBody>(event) || {}
    const provider = String(body.provider || '').trim().toLowerCase()
    const providerUserId = String(body.providerUserId || body.username || '').trim().replace(/^@+/, '')
    const username = String(body.username || providerUserId).trim().replace(/^@+/, '')
    if (!['x', 'discord', 'telegram'].includes(provider)) return json(400, { error: 'Unsupported social provider.' })
    if (!providerUserId) return json(400, { error: 'Provide providerUserId or username.' })
    await enforceRateLimit({
      action: 'social_link',
      key: `${user.id}:${provider}`,
      limit: 8,
      windowSeconds: 600,
    })

    const reused = await supabaseGet<{ id: string; user_id: string }[]>(`/rest/v1/wm_social_accounts?select=id,user_id&provider=eq.${provider}&provider_user_id=eq.${encodeURIComponent(providerUserId)}&limit=1`)
    if (reused[0] && reused[0].user_id !== user.id) return json(409, { error: 'This social account is already linked to another wallet.' })

    const current = await supabaseGet<{ id: string }[]>(`/rest/v1/wm_social_accounts?select=id&provider=eq.${provider}&user_id=eq.${user.id}&limit=1`)
    if (current[0]) {
      await supabasePatch(`/rest/v1/wm_social_accounts?id=eq.${current[0].id}`, {
        provider_user_id: providerUserId,
        username,
        last_verified_at: null,
      })
    } else {
      await supabasePost('/rest/v1/wm_social_accounts', {
        user_id: user.id,
        provider,
        provider_user_id: providerUserId,
        username,
      })
    }

    const questSlug = providerQuestSlug[provider]
    let questStatus = 'review'
    let questAlreadyCompleted = false

    try {
      const questResult = await submitQuest({
        user,
        questSlug,
        submittedValue: username,
        payload: {
          provider,
          username,
          providerUserId,
          source: 'social_identity_link',
          note: 'Social identity linked; bot/API verification may approve later.',
        },
      })
      questStatus = questResult.status
      questAlreadyCompleted = Boolean(questResult.alreadyCompleted)
    } catch (questError) {
      await createAdminNotification({
        type: 'social_start_here_submission_failed',
        title: `${provider.toUpperCase()} linked but Start Here quest was not submitted`,
        message: questError instanceof Error ? questError.message : 'Unknown quest submission error.',
        priority: 'high',
        relatedUserId: user.id,
      })
    }

    const profile = await buildWarProfile(user)
    return json(200, {
      ok: true,
      provider,
      username,
      questSlug,
      status: questStatus,
      alreadyCompleted: questAlreadyCompleted,
      profile,
    })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

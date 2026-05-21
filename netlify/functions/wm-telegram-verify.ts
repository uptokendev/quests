import { json, readBody } from './_lib/http'
import { supabaseGet, supabasePatch, supabasePost } from './_lib/supabase'
import { createAdminNotification, submitQuest } from './_lib/war-engine'
import { getUserById } from './_lib/war-profile'

type TelegramVerifyBody = {
  token?: string
  start?: string
  secret?: string
  telegramUserId?: string | number
  chatId?: string | number
  username?: string
  firstName?: string
  lastName?: string
}

type ChallengeRow = {
  id: string
  user_id: string
  token: string
  expires_at: string
  consumed_at: string | null
}

function getMaintenanceSecret() {
  const secret = process.env.WM_MAINTENANCE_SECRET || ''
  if (!secret) throw new Error('WM_MAINTENANCE_SECRET is not configured yet.')
  return secret
}

function readProvidedSecret(event: any, body: TelegramVerifyBody) {
  const authHeader = String(event.headers?.authorization || event.headers?.Authorization || '')
  if (authHeader.toLowerCase().startsWith('bearer ')) return authHeader.slice(7).trim()
  return String(event.headers?.['x-wm-secret'] || event.headers?.['X-WM-Secret'] || body.secret || '').trim()
}

function normalizeToken(value: string) {
  return String(value || '').trim().replace(/^wm[_-]/i, '')
}

function normalizeUsername(body: TelegramVerifyBody, providerUserId: string) {
  const username = String(body.username || '').trim().replace(/^@+/, '')
  if (username) return username

  const fallback = [body.firstName, body.lastName].map((part) => String(part || '').trim()).filter(Boolean).join(' ')
  if (fallback) return fallback

  return `telegram_${providerUserId}`
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  try {
    const body = readBody<TelegramVerifyBody>(event) || {}
    const providedSecret = readProvidedSecret(event, body)
    if (!providedSecret || providedSecret !== getMaintenanceSecret()) {
      return json(401, { error: 'Unauthorized Telegram verification request.' })
    }

    const token = normalizeToken(String(body.token || body.start || ''))
    if (!token) return json(400, { error: 'Missing Telegram link token.' })

    const providerUserId = String(body.telegramUserId || body.chatId || '').trim()
    if (!providerUserId) return json(400, { error: 'Missing Telegram user identifier.' })

    const challenges = await supabaseGet<ChallengeRow[]>(`/rest/v1/wm_social_link_challenges?select=id,user_id,token,expires_at,consumed_at&provider=eq.telegram&token=eq.${encodeURIComponent(token)}&consumed_at=is.null&limit=1`)
    const challenge = challenges[0]
    if (!challenge) return json(404, { error: 'Telegram link challenge was not found or is already used.' })
    if (new Date(challenge.expires_at).getTime() < Date.now()) return json(410, { error: 'Telegram link challenge expired.' })

    const user = await getUserById(challenge.user_id)
    if (!user) return json(404, { error: 'War Missions user was not found.' })
    if (user.is_banned) return json(403, { error: 'This wallet is excluded from War Missions.' })

    const reused = await supabaseGet<{ id: string; user_id: string }[]>(`/rest/v1/wm_social_accounts?select=id,user_id&provider=eq.telegram&provider_user_id=eq.${encodeURIComponent(providerUserId)}&limit=1`)
    if (reused[0] && reused[0].user_id !== user.id) {
      return json(409, { error: 'This Telegram account is already linked to another wallet.' })
    }

    const username = normalizeUsername(body, providerUserId)
    const now = new Date().toISOString()
    const current = await supabaseGet<{ id: string }[]>(`/rest/v1/wm_social_accounts?select=id&provider=eq.telegram&user_id=eq.${encodeURIComponent(user.id)}&limit=1`)

    if (current[0]) {
      await supabasePatch(`/rest/v1/wm_social_accounts?id=eq.${current[0].id}`, {
        provider_user_id: providerUserId,
        username,
        last_verified_at: now,
      })
    } else {
      await supabasePost('/rest/v1/wm_social_accounts', {
        user_id: user.id,
        provider: 'telegram',
        provider_user_id: providerUserId,
        username,
        last_verified_at: now,
      })
    }

    await supabasePatch(`/rest/v1/wm_social_link_challenges?id=eq.${challenge.id}`, {
      consumed_at: now,
    })

    let questStatus = 'review'
    let alreadyCompleted = false

    try {
      const questResult = await submitQuest({
        user,
        questSlug: 'access-underground-comms',
        submittedValue: username,
        payload: {
          provider: 'telegram',
          username,
          providerUserId,
          source: 'telegram_bot',
          challengeToken: token,
        },
      })
      questStatus = questResult.status
      alreadyCompleted = Boolean(questResult.alreadyCompleted)
    } catch (questError) {
      await createAdminNotification({
        type: 'social_start_here_submission_failed',
        title: 'Telegram connected but Start Here quest was not submitted',
        message: questError instanceof Error ? questError.message : 'Unknown quest submission error.',
        priority: 'high',
        relatedUserId: user.id,
      })
    }

    return json(200, {
      ok: true,
      linked: true,
      provider: 'telegram',
      username,
      questSlug: 'access-underground-comms',
      status: questStatus,
      alreadyCompleted,
    })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Telegram verification failed.' })
  }
}

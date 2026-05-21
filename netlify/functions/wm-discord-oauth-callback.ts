import { buildCookie, getSecureCookieFlag, json, parseCookies } from './_lib/http'
import { readWarAuth, unauthorized } from './_lib/war-auth'
import { supabaseGet, supabasePatch, supabasePost } from './_lib/supabase'
import { createAdminNotification, submitQuest } from './_lib/war-engine'
import { getUserById } from './_lib/war-profile'

const DISCORD_OAUTH_COOKIE = 'mwz_discord_oauth'

type DiscordUser = {
  id?: string
  username?: string
  global_name?: string | null
  discriminator?: string
}

function getBaseUrl(event: any) {
  const configured = process.env.APP_BASE_URL || process.env.VITE_APP_BASE_URL || ''
  if (configured) return configured.replace(/\/$/, '')
  const proto = String(event.headers?.['x-forwarded-proto'] || event.headers?.['X-Forwarded-Proto'] || 'https')
  const host = String(event.headers?.host || event.headers?.Host || '')
  return `${proto}://${host}`
}

function safeReturnTo(value: string) {
  const fallback = '/missions'
  const raw = String(value || fallback).trim()
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('://')) return fallback
  return raw.slice(0, 300)
}

function readOAuthState(event: any) {
  const cookies = parseCookies(event.headers?.cookie || event.headers?.Cookie)
  const raw = cookies[DISCORD_OAUTH_COOKIE]
  if (!raw) return null
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      state: string
      returnTo: string
      userId: string
    }
  } catch {
    return null
  }
}

function clearOAuthCookie(event: any) {
  return buildCookie(DISCORD_OAUTH_COOKIE, '', {
    maxAge: 0,
    httpOnly: true,
    secure: getSecureCookieFlag(event),
    sameSite: 'Lax',
    path: '/',
  })
}

function getDiscordConfig() {
  const clientId = process.env.DISCORD_CLIENT_ID || ''
  const clientSecret = process.env.DISCORD_CLIENT_SECRET || ''
  const redirectUri = process.env.DISCORD_REDIRECT_URI || ''
  if (!clientId || !clientSecret || !redirectUri) throw new Error('Discord OAuth is not configured yet.')
  return { clientId, clientSecret, redirectUri }
}

async function exchangeCode(code: string) {
  const { clientId, clientSecret, redirectUri } = getDiscordConfig()
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })

  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const data = await response.json().catch(() => ({})) as { access_token?: string; error?: string; error_description?: string }
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || 'Discord token exchange failed.')
  return data.access_token
}

async function fetchDiscordUser(accessToken: string) {
  const response = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const data = await response.json().catch(() => ({})) as DiscordUser & { message?: string }
  if (!response.ok || !data.id) throw new Error(data.message || 'Unable to load Discord user.')
  return data
}

function formatDiscordUsername(user: DiscordUser) {
  const globalName = String(user.global_name || '').trim()
  if (globalName) return globalName

  const username = String(user.username || user.id || '').trim()
  const discriminator = String(user.discriminator || '').trim()
  if (username && discriminator && discriminator !== '0') return `${username}#${discriminator}`
  return username
}

async function upsertDiscordAccount(userId: string, providerUserId: string, username: string) {
  const reused = await supabaseGet<{ id: string; user_id: string }[]>(`/rest/v1/wm_social_accounts?select=id,user_id&provider=eq.discord&provider_user_id=eq.${encodeURIComponent(providerUserId)}&limit=1`)
  if (reused[0] && reused[0].user_id !== userId) throw new Error('This Discord account is already linked to another wallet.')

  const current = await supabaseGet<{ id: string }[]>(`/rest/v1/wm_social_accounts?select=id&provider=eq.discord&user_id=eq.${encodeURIComponent(userId)}&limit=1`)
  if (current[0]) {
    await supabasePatch(`/rest/v1/wm_social_accounts?id=eq.${current[0].id}`, {
      provider_user_id: providerUserId,
      username,
      last_verified_at: new Date().toISOString(),
    })
  } else {
    await supabasePost('/rest/v1/wm_social_accounts', {
      user_id: userId,
      provider: 'discord',
      provider_user_id: providerUserId,
      username,
      last_verified_at: new Date().toISOString(),
    })
  }
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' })

  const baseUrl = getBaseUrl(event)
  const clearCookie = clearOAuthCookie(event)
  const auth = readWarAuth(event)
  if (!auth) return unauthorized()

  const oauthState = readOAuthState(event)
  const code = String(event.queryStringParameters?.code || '')
  const state = String(event.queryStringParameters?.state || '')
  const errorParam = String(event.queryStringParameters?.error || '')
  const returnTo = safeReturnTo(oauthState?.returnTo || '/missions')

  const redirect = (params: Record<string, string>) => {
    const url = new URL(`${baseUrl}${returnTo}`)
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
    return {
      statusCode: 302,
      headers: {
        Location: url.toString(),
        'Set-Cookie': clearCookie,
        'Cache-Control': 'no-store',
      },
      body: '',
    }
  }

  try {
    if (errorParam) throw new Error(errorParam)
    if (!oauthState || oauthState.userId !== auth.userId || oauthState.state !== state) throw new Error('Invalid Discord OAuth state. Try again.')
    if (!code) throw new Error('Missing Discord OAuth code.')

    const user = await getUserById(auth.userId)
    if (!user || user.wallet_address !== auth.address) throw new Error('War Missions session is no longer valid.')
    if (user.is_banned) throw new Error('This wallet is excluded from War Missions.')

    const accessToken = await exchangeCode(code)
    const discordUser = await fetchDiscordUser(accessToken)
    const username = formatDiscordUsername(discordUser)
    await upsertDiscordAccount(user.id, String(discordUser.id), username)

    try {
      await submitQuest({
        user,
        questSlug: 'report-to-base-camp',
        submittedValue: username,
        payload: {
          provider: 'discord',
          username,
          providerUserId: String(discordUser.id),
          source: 'discord_oauth',
          note: 'Discord OAuth connected; guild membership verification can approve this quest when configured.',
        },
      })
    } catch (questError) {
      await createAdminNotification({
        type: 'social_start_here_submission_failed',
        title: 'Discord connected but Start Here quest was not submitted',
        message: questError instanceof Error ? questError.message : 'Unknown quest submission error.',
        priority: 'high',
        relatedUserId: user.id,
      })
    }

    return redirect({ social: 'discord-connected' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Discord OAuth failed.'
    return redirect({ social_error: message })
  }
}

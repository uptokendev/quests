import crypto from 'node:crypto'
import { buildCookie, getSecureCookieFlag, json, parseCookies } from './_lib/http'
import { readWarAuth, unauthorized } from './_lib/war-auth'
import { supabaseGet, supabasePatch, supabasePost } from './_lib/supabase'
import { createAdminNotification, submitQuest } from './_lib/war-engine'
import { getUserById } from './_lib/war-profile'

const X_OAUTH_COOKIE = 'mwz_x_oauth'

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
  const raw = cookies[X_OAUTH_COOKIE]
  if (!raw) return null
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      state: string
      codeVerifier: string
      returnTo: string
      userId: string
    }
  } catch {
    return null
  }
}

function clearOAuthCookie(event: any) {
  return buildCookie(X_OAUTH_COOKIE, '', {
    maxAge: 0,
    httpOnly: true,
    secure: getSecureCookieFlag(event),
    sameSite: 'Lax',
    path: '/',
  })
}

function getXConfig() {
  const clientId = process.env.X_CLIENT_ID || ''
  const clientSecret = process.env.X_CLIENT_SECRET || ''
  const redirectUri = process.env.X_REDIRECT_URI || ''
  if (!clientId || !clientSecret || !redirectUri) throw new Error('X OAuth is not configured yet.')
  return { clientId, clientSecret, redirectUri }
}

async function exchangeCode(code: string, codeVerifier: string) {
  const { clientId, clientSecret, redirectUri } = getXConfig()
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const body = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  })

  const response = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const data = await response.json().catch(() => ({})) as { access_token?: string; error?: string; error_description?: string }
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || 'X token exchange failed.')
  return data.access_token
}

async function fetchXUser(accessToken: string) {
  const response = await fetch('https://api.twitter.com/2/users/me?user.fields=username,name,profile_image_url', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const data = await response.json().catch(() => ({})) as {
    data?: { id?: string; username?: string; name?: string; profile_image_url?: string }
    detail?: string
    title?: string
  }
  if (!response.ok || !data.data?.id) throw new Error(data.detail || data.title || 'Unable to load X user.')
  return data.data
}

async function upsertXAccount(userId: string, providerUserId: string, username: string) {
  const reused = await supabaseGet<{ id: string; user_id: string }[]>(`/rest/v1/wm_social_accounts?select=id,user_id&provider=eq.x&provider_user_id=eq.${encodeURIComponent(providerUserId)}&limit=1`)
  if (reused[0] && reused[0].user_id !== userId) throw new Error('This X account is already linked to another wallet.')

  const current = await supabaseGet<{ id: string }[]>(`/rest/v1/wm_social_accounts?select=id&provider=eq.x&user_id=eq.${encodeURIComponent(userId)}&limit=1`)
  if (current[0]) {
    await supabasePatch(`/rest/v1/wm_social_accounts?id=eq.${current[0].id}`, {
      provider_user_id: providerUserId,
      username,
      last_verified_at: new Date().toISOString(),
    })
  } else {
    await supabasePost('/rest/v1/wm_social_accounts', {
      user_id: userId,
      provider: 'x',
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
    if (!oauthState || oauthState.userId !== auth.userId || oauthState.state !== state) throw new Error('Invalid X OAuth state. Try again.')
    if (!code) throw new Error('Missing X OAuth code.')

    const user = await getUserById(auth.userId)
    if (!user || user.wallet_address !== auth.address) throw new Error('War Missions session is no longer valid.')
    if (user.is_banned) throw new Error('This wallet is excluded from War Missions.')

    const accessToken = await exchangeCode(code, oauthState.codeVerifier)
    const xUser = await fetchXUser(accessToken)
    const username = String(xUser.username || xUser.id).replace(/^@+/, '')
    await upsertXAccount(user.id, String(xUser.id), username)

    try {
      await submitQuest({
        user,
        questSlug: 'intercept-global-comms',
        submittedValue: username,
        payload: {
          provider: 'x',
          username,
          providerUserId: String(xUser.id),
          source: 'x_oauth',
          note: 'X OAuth connected; follow verification can approve this quest when configured.',
        },
      })
    } catch (questError) {
      await createAdminNotification({
        type: 'social_start_here_submission_failed',
        title: 'X connected but Start Here quest was not submitted',
        message: questError instanceof Error ? questError.message : 'Unknown quest submission error.',
        priority: 'high',
        relatedUserId: user.id,
      })
    }

    return redirect({ social: 'x-connected' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'X OAuth failed.'
    return redirect({ social_error: message })
  }
}

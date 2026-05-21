import crypto from 'node:crypto'
import { buildCookie, getSecureCookieFlag, json } from './_lib/http'
import { readWarAuth, unauthorized } from './_lib/war-auth'

const DISCORD_OAUTH_COOKIE = 'mwz_discord_oauth'
const DISCORD_OAUTH_TTL_SECONDS = 10 * 60

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

function getDiscordConfig() {
  const clientId = process.env.DISCORD_CLIENT_ID || ''
  const redirectUri = process.env.DISCORD_REDIRECT_URI || ''
  if (!clientId || !redirectUri) throw new Error('Discord OAuth is not configured yet.')
  return { clientId, redirectUri }
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  const auth = readWarAuth(event)
  if (!auth) return unauthorized()

  try {
    const { clientId, redirectUri } = getDiscordConfig()
    const state = crypto.randomBytes(24).toString('base64url')
    const returnTo = safeReturnTo(event.queryStringParameters?.returnTo || '/missions')
    const payload = Buffer.from(JSON.stringify({ state, returnTo, userId: auth.userId })).toString('base64url')

    const cookie = buildCookie(DISCORD_OAUTH_COOKIE, payload, {
      maxAge: DISCORD_OAUTH_TTL_SECONDS,
      httpOnly: true,
      secure: getSecureCookieFlag(event),
      sameSite: 'Lax',
      path: '/',
    })

    const url = new URL('https://discord.com/oauth2/authorize')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('scope', 'identify')
    url.searchParams.set('state', state)
    url.searchParams.set('prompt', 'consent')

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie,
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({ ok: true, authorizeUrl: url.toString() }),
    }
  } catch (error) {
    const baseUrl = getBaseUrl(event)
    const message = encodeURIComponent(error instanceof Error ? error.message : 'Discord OAuth start failed.')
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({ ok: false, error: `${baseUrl}/missions?social_error=${message}` }),
    }
  }
}

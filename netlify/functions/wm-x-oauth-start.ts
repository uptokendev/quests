import crypto from 'node:crypto'
import { buildCookie, getSecureCookieFlag, json } from './_lib/http'
import { readWarAuth, unauthorized } from './_lib/war-auth'

const X_OAUTH_COOKIE = 'mwz_x_oauth'
const X_OAUTH_TTL_SECONDS = 10 * 60

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

function base64Url(buffer: Buffer) {
  return buffer.toString('base64url')
}

function sha256(value: string) {
  return base64Url(crypto.createHash('sha256').update(value).digest())
}

function getXConfig() {
  const clientId = process.env.X_CLIENT_ID || ''
  const redirectUri = process.env.X_REDIRECT_URI || ''
  if (!clientId || !redirectUri) throw new Error('X OAuth is not configured yet.')
  return { clientId, redirectUri }
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' })

  const auth = readWarAuth(event)
  if (!auth) return unauthorized()

  try {
    const { clientId, redirectUri } = getXConfig()
    const state = base64Url(crypto.randomBytes(24))
    const codeVerifier = base64Url(crypto.randomBytes(32))
    const returnTo = safeReturnTo(event.queryStringParameters?.returnTo || '/missions')
    const payload = Buffer.from(JSON.stringify({ state, codeVerifier, returnTo, userId: auth.userId })).toString('base64url')

    const cookie = buildCookie(X_OAUTH_COOKIE, payload, {
      maxAge: X_OAUTH_TTL_SECONDS,
      httpOnly: true,
      secure: getSecureCookieFlag(event),
      sameSite: 'Lax',
      path: '/',
    })

    const url = new URL('https://twitter.com/i/oauth2/authorize')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('scope', 'users.read tweet.read follows.read offline.access')
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', sha256(codeVerifier))
    url.searchParams.set('code_challenge_method', 'S256')

    return {
      statusCode: 302,
      headers: {
        Location: url.toString(),
        'Set-Cookie': cookie,
        'Cache-Control': 'no-store',
      },
      body: '',
    }
  } catch (error) {
    const baseUrl = getBaseUrl(event)
    const message = encodeURIComponent(error instanceof Error ? error.message : 'X OAuth start failed.')
    return {
      statusCode: 302,
      headers: {
        Location: `${baseUrl}/missions?social_error=${message}`,
        'Cache-Control': 'no-store',
      },
      body: '',
    }
  }
}

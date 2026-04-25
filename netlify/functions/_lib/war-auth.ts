import crypto from 'node:crypto'
import { ethers } from 'ethers'
import { buildCookie, getSecureCookieFlag, json, normalizeAddress, parseCookies } from './http'

const AUTH_COOKIE = 'mwz_wm_auth'
const AUTH_TTL_SECONDS = 60 * 60 * 24 * 14

function getSecret() {
  const secret = process.env.WAR_MISSIONS_AUTH_SECRET || process.env.RECRUITER_AUTH_SECRET || process.env.RECRUITER_DASHBOARD_TOKEN || ''
  if (!secret) throw new Error('War Missions auth secret is not configured yet.')
  return secret
}

function signPayload(payload: string) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url')
}

export function warLoginMessage(address: string, nonce: string) {
  return `MemeWarzone War Missions login\naddress: ${normalizeAddress(address)}\nnonce: ${nonce}`
}

export async function verifyWalletSignature(message: string, signature: string, address: string) {
  const recovered = ethers.verifyMessage(message, signature)
  return normalizeAddress(recovered) === normalizeAddress(address)
}

export function createWarAuthCookie(event: any, data: { userId: string; address: string }) {
  const exp = Math.floor(Date.now() / 1000) + AUTH_TTL_SECONDS
  const payload = Buffer.from(JSON.stringify({ uid: data.userId, addr: normalizeAddress(data.address), exp })).toString('base64url')
  const signature = signPayload(payload)
  return buildCookie(AUTH_COOKIE, `${payload}.${signature}`, {
    maxAge: AUTH_TTL_SECONDS,
    httpOnly: true,
    secure: getSecureCookieFlag(event),
    sameSite: 'Lax',
    path: '/',
  })
}

export function readWarAuth(event: any) {
  const cookies = parseCookies(event.headers?.cookie || event.headers?.Cookie)
  const raw = cookies[AUTH_COOKIE]
  if (!raw) return null
  const [payload, signature] = raw.split('.')
  if (!payload || !signature) return null
  if (signPayload(payload) !== signature) return null

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { uid: string; addr: string; exp: number }
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) return null
    return { userId: decoded.uid, address: normalizeAddress(decoded.addr) }
  } catch {
    return null
  }
}

export function unauthorized(message = 'Connect wallet to access War Missions.') {
  return json(401, { error: message })
}

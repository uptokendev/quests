import crypto from 'node:crypto'

export type JsonResponse = {
  statusCode: number
  headers: Record<string, string | string[]>
  body: string
}

export function json(statusCode: number, body: Record<string, unknown>, headers: Record<string, string | string[]> = {}): JsonResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
    body: JSON.stringify(body),
  }
}

export function normalizeAddress(address: string) {
  return String(address || '').trim().toLowerCase()
}

export function isWalletAddress(address: string) {
  return /^0x[a-f0-9]{40}$/.test(normalizeAddress(address))
}

export function parseCookies(raw: string | undefined) {
  const source = String(raw || '')
  return source.split(';').reduce<Record<string, string>>((acc, pair) => {
    const index = pair.indexOf('=')
    if (index === -1) return acc
    const key = pair.slice(0, index).trim()
    const value = pair.slice(index + 1).trim()
    if (!key) return acc
    acc[key] = decodeURIComponent(value)
    return acc
  }, {})
}

export function buildCookie(name: string, value: string, options: {
  maxAge?: number
  httpOnly?: boolean
  sameSite?: 'Lax' | 'Strict' | 'None'
  secure?: boolean
  path?: string
}) {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  parts.push(`Path=${options.path || '/'}`)
  if (typeof options.maxAge === 'number') parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
  if (options.httpOnly !== false) parts.push('HttpOnly')
  parts.push(`SameSite=${options.sameSite || 'Lax'}`)
  if (options.secure !== false) parts.push('Secure')
  return parts.join('; ')
}

export function getSecureCookieFlag(event: any) {
  const proto = String(event.headers?.['x-forwarded-proto'] || event.headers?.['X-Forwarded-Proto'] || '')
  const host = String(event.headers?.host || event.headers?.Host || '')
  if (/localhost|127\.0\.0\.1/i.test(host)) return false
  return proto ? proto === 'https' : process.env.NODE_ENV === 'production'
}

export function readBody<T = Record<string, unknown>>(event: any): T | null {
  const raw = String(event.body || '')
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

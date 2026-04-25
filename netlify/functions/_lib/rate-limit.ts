import { sha256 } from './http'
import { supabaseGet, supabasePost } from './supabase'

export async function enforceRateLimit(input: {
  action: string
  key: string
  limit: number
  windowSeconds: number
}) {
  const keyHash = sha256(`${input.action}:${input.key}`)
  const windowStart = new Date(Date.now() - input.windowSeconds * 1000).toISOString()
  const recent = await supabaseGet<{ id: string }[]>(`/rest/v1/wm_rate_limit_events?select=id&action=eq.${encodeURIComponent(input.action)}&key_hash=eq.${keyHash}&created_at=gte.${encodeURIComponent(windowStart)}&limit=${input.limit}`)
    .catch(() => [])
  if (recent.length >= input.limit) throw new Error('Too many attempts. Wait a moment and try again.')

  await supabasePost('/rest/v1/wm_rate_limit_events', {
    action: input.action,
    key_hash: keyHash,
    created_at: new Date().toISOString(),
  }).catch(() => undefined)
}

export function clientRateLimitKey(event: any, fallback: string) {
  return String(
    event.headers?.['x-nf-client-connection-ip'] ||
    event.headers?.['client-ip'] ||
    event.headers?.['x-forwarded-for'] ||
    fallback,
  ).split(',')[0].trim()
}

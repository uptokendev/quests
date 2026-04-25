import { randomBytes } from 'node:crypto'
import { isWalletAddress, json, normalizeAddress, readBody } from './_lib/http'
import { supabasePost } from './_lib/supabase'
import { warLoginMessage } from './_lib/war-auth'
import { clientRateLimitKey, enforceRateLimit } from './_lib/rate-limit'

type NonceBody = {
  address?: string
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  const body = event.httpMethod === 'POST' ? readBody<NonceBody>(event) : null
  const address = normalizeAddress(String(body?.address || event.queryStringParameters?.address || ''))
  if (!isWalletAddress(address)) return json(400, { error: 'Enter a valid wallet address.' })

  const nonce = randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  try {
    await enforceRateLimit({
      action: 'auth_nonce',
      key: `${address}:${clientRateLimitKey(event, address)}`,
      limit: 5,
      windowSeconds: 60,
    })
    await supabasePost('/rest/v1/wm_wallet_auth_nonces', {
      wallet_address: address,
      nonce,
      expires_at: expiresAt,
    })

    return json(200, {
      ok: true,
      nonce,
      message: warLoginMessage(address, nonce),
      expiresAt,
    })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

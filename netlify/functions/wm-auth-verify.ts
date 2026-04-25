import { createWarAuthCookie, verifyWalletSignature, warLoginMessage } from './_lib/war-auth'
import { isWalletAddress, json, normalizeAddress, readBody } from './_lib/http'
import { supabaseGet, supabasePatch } from './_lib/supabase'
import { awardQuestForUser, buildWarProfile, ensureUser, maybeVerifyReferralForUser } from './_lib/war-profile'

type VerifyBody = {
  address?: string
  signature?: string
}

type NonceRow = {
  id: string
  wallet_address: string
  nonce: string
  expires_at: string
  used_at: string | null
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  const body = readBody<VerifyBody>(event)
  const address = normalizeAddress(body?.address || '')
  const signature = String(body?.signature || '').trim()
  if (!isWalletAddress(address)) return json(400, { error: 'Enter a valid wallet address.' })
  if (!signature) return json(400, { error: 'Missing signature.' })

  try {
    const nonceRows = await supabaseGet<NonceRow[]>(`/rest/v1/wm_wallet_auth_nonces?select=id,wallet_address,nonce,expires_at,used_at&wallet_address=ilike.${encodeURIComponent(address)}&used_at=is.null&order=created_at.desc&limit=1`)
    const nonceRow = nonceRows[0]
    if (!nonceRow) return json(400, { error: 'No login challenge found. Request a new nonce.' })
    if (new Date(nonceRow.expires_at).getTime() < Date.now()) return json(400, { error: 'This login challenge expired. Request a new nonce.' })

    const isValid = await verifyWalletSignature(warLoginMessage(address, nonceRow.nonce), signature, address)
    if (!isValid) return json(401, { error: 'Signature verification failed.' })

    const user = await ensureUser(address)
    if (user.is_banned) return json(403, { error: 'This wallet is excluded from War Missions.' })

    await Promise.all([
      supabasePatch(`/rest/v1/wm_wallet_auth_nonces?id=eq.${nonceRow.id}`, { used_at: new Date().toISOString() }),
      awardQuestForUser(user.id, 'take-the-oath', 'wallet_signature', { address }),
    ])
    await maybeVerifyReferralForUser(user.id).catch(() => undefined)

    const profile = await buildWarProfile(user)
    return json(200, {
      ok: true,
      profile,
    }, {
      'Set-Cookie': createWarAuthCookie(event, { userId: user.id, address }),
    })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

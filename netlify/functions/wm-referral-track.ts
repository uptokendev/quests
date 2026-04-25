import { json, normalizeAddress, readBody } from './_lib/http'
import { readWarAuth } from './_lib/war-auth'
import { getUserById, maybeVerifyReferralForUser } from './_lib/war-profile'
import { supabaseGet, supabasePost, supabasePatch } from './_lib/supabase'

type ReferralTrackBody = {
  code?: string
}

type ReferralLink = {
  recruiter_user_id: string
  code: string
  active: boolean
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  try {
    const body = readBody<ReferralTrackBody>(event) || {}
    const code = String(body.code || event.queryStringParameters?.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)
    if (!code) return json(400, { error: 'Provide referral code.' })

    const links = await supabaseGet<ReferralLink[]>(`/rest/v1/wm_referral_links?select=recruiter_user_id,code,active&code=ilike.${encodeURIComponent(code)}&active=eq.true&limit=1`)
    const link = links[0]
    if (!link) return json(404, { error: 'Referral code was not found.' })

    const auth = readWarAuth(event)
    if (!auth) return json(200, { ok: true, code: link.code, linked: false })

    const user = await getUserById(auth.userId)
    if (!user || user.wallet_address !== normalizeAddress(auth.address) || user.is_banned) return json(200, { ok: true, code: link.code, linked: false })
    if (user.id === link.recruiter_user_id) return json(400, { error: 'Self-referrals are not allowed.' })

    const existing = await supabaseGet<{ id: string; status: string }[]>(`/rest/v1/wm_referral_attributions?select=id,status&referred_user_id=eq.${user.id}&limit=1`)
    let attributionId = existing[0]?.id || null
    if (existing[0]) {
      await supabasePatch(`/rest/v1/wm_referral_attributions?id=eq.${existing[0].id}`, {
        status: existing[0].status === 'locked' ? 'locked' : 'linked',
        wallet_connected_at: new Date().toISOString(),
      })
    } else {
      const rows = await supabasePost<{ id: string }[]>('/rest/v1/wm_referral_attributions', {
        recruiter_user_id: link.recruiter_user_id,
        referred_user_id: user.id,
        referral_code: link.code,
        status: 'linked',
        wallet_connected_at: new Date().toISOString(),
      })
      attributionId = rows[0]?.id || null
    }

    await maybeVerifyReferralForUser(user.id)
    return json(200, { ok: true, code: link.code, linked: true, attributionId })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

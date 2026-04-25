import { requireAdmin } from './_lib/war-admin'
import { writeAdminAuditLog } from './_lib/admin-audit'
import { json, readBody } from './_lib/http'
import { makeReferralCode } from './_lib/war-engine'
import { awardQuestForUser } from './_lib/war-profile'
import { supabaseGet, supabasePatch, supabasePost } from './_lib/supabase'

type RecruiterReviewBody = {
  applicationId?: string
  status?: 'accepted' | 'rejected' | 'review'
  reason?: string
}

type RecruiterApplication = {
  id: string
  user_id: string | null
  wallet_address: string
  status: string
}

async function ensureReferralLink(userId: string, walletAddress: string) {
  const existing = await supabaseGet<{ id: string; code: string }[]>(`/rest/v1/wm_referral_links?select=id,code&recruiter_user_id=eq.${userId}&limit=1`)
  if (existing[0]) return existing[0]

  const seed = makeReferralCode(walletAddress)
  const candidates = [seed, `${seed.slice(0, 6)}01`, `${seed.slice(0, 6)}02`, `R${seed.slice(0, 7)}`]
  for (const code of candidates) {
    const taken = await supabaseGet<{ id: string }[]>(`/rest/v1/wm_referral_links?select=id&code=ilike.${encodeURIComponent(code)}&limit=1`)
    if (taken[0]) continue
    const rows = await supabasePost<{ id: string; code: string }[]>('/rest/v1/wm_referral_links', {
      recruiter_user_id: userId,
      code,
      url: `/r/${code}`,
      active: true,
    })
    return rows[0]
  }
  throw new Error('Unable to generate referral code.')
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  try {
    const { response, admin } = await requireAdmin(event)
    if (response || !admin) return response

    const body = readBody<RecruiterReviewBody>(event) || {}
    const applicationId = String(body.applicationId || '').trim()
    const status = body.status || 'accepted'
    const reason = String(body.reason || '').trim()
    if (!applicationId) return json(400, { error: 'Provide applicationId.' })
    if (!['accepted', 'rejected', 'review'].includes(status)) return json(400, { error: 'Unsupported status.' })
    if (!reason) return json(400, { error: 'Provide a reason.' })

    const applications = await supabaseGet<RecruiterApplication[]>(`/rest/v1/wm_recruiter_applications?select=*&id=eq.${encodeURIComponent(applicationId)}&limit=1`)
    const application = applications[0]
    if (!application) return json(404, { error: 'Application was not found.' })
    if (!application.user_id) return json(400, { error: 'Application is not linked to a War Missions user.' })

    const rows = await supabasePatch(`/rest/v1/wm_recruiter_applications?id=eq.${application.id}`, {
      status,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    })

    let referralLink = null
    if (status === 'accepted') {
      await supabasePatch(`/rest/v1/wm_users?id=eq.${application.user_id}`, {
        role: 'recruiter',
        updated_at: new Date().toISOString(),
      })
      referralLink = await ensureReferralLink(application.user_id, application.wallet_address)
      await awardQuestForUser(application.user_id, 'accepted-recruiter-program', 'recruiter_application_accepted', { application_id: application.id })
    }

    await writeAdminAuditLog({
      adminUserId: admin.id,
      action: `recruiter_application.${status}`,
      targetType: 'wm_recruiter_application',
      targetId: application.id,
      before: { status: application.status },
      after: { status, reason, referral_link: referralLink },
    })

    return json(200, { ok: true, application: rows[0] || application, referralLink })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

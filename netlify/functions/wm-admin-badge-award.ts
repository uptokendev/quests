import { writeAdminAuditLog } from './_lib/admin-audit'
import { json, readBody } from './_lib/http'
import { awardBadgeManually, revokeBadgeManually } from './_lib/war-badges'
import { requireAdmin } from './_lib/war-admin'

type BadgeAwardBody = {
  action?: 'award' | 'revoke'
  userId?: string
  walletAddress?: string
  badgeSlug?: string
  reason?: string
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  try {
    const { response, admin } = await requireAdmin(event)
    if (response || !admin) return response

    const body = readBody<BadgeAwardBody>(event) || {}
    const action = body.action || 'award'
    const badgeSlug = String(body.badgeSlug || '').trim()
    const reason = String(body.reason || '').trim()

    if (!body.userId && !body.walletAddress) return json(400, { error: 'Provide userId or walletAddress.' })
    if (!badgeSlug) return json(400, { error: 'Provide badgeSlug.' })
    if (!reason) return json(400, { error: 'Provide a reason.' })
    if (action !== 'award' && action !== 'revoke') return json(400, { error: 'Unsupported badge action.' })

    const result = action === 'revoke'
      ? await revokeBadgeManually({
        userId: body.userId,
        walletAddress: body.walletAddress,
        badgeSlug,
        reason,
        adminUserId: admin.id,
      })
      : await awardBadgeManually({
        userId: body.userId,
        walletAddress: body.walletAddress,
        badgeSlug,
        reason,
        adminUserId: admin.id,
      })

    await writeAdminAuditLog({
      adminUserId: admin.id,
      action: action === 'revoke' ? 'badge.revoke' : 'badge.award',
      targetType: 'wm_user_badge',
      targetId: result.userBadge?.id || null,
      after: {
        user_id: result.user.id,
        wallet_address: result.user.wallet_address,
        badge_slug: result.badge.slug,
        reason,
      },
    })

    return json(200, {
      ok: true,
      action,
      user: {
        id: result.user.id,
        walletAddress: result.user.wallet_address,
      },
      badge: {
        slug: result.badge.slug,
        title: result.badge.title,
      },
      userBadge: result.userBadge,
    })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

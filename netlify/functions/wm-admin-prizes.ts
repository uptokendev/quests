import { requireAdmin } from './_lib/war-admin'
import { writeAdminAuditLog } from './_lib/admin-audit'
import { json, readBody } from './_lib/http'
import { supabaseGet, supabasePatch, supabasePost } from './_lib/supabase'
import { getCurrentLeaderboard } from './_lib/war-engine'

type PrizeBody = {
  action?: 'create_pool' | 'add_winner' | 'update_pool' | 'update_winner' | 'draw_winners'
  prizePoolId?: string
  winnerId?: string
  userId?: string
  walletAddress?: string
  periodType?: string
  rewardAsset?: string
  rewardAmount?: number
  rank?: number
  status?: string
  txHash?: string
  reason?: string
  winnerCount?: number
  metadata?: Record<string, unknown>
}

export const handler = async (event: any) => {
  try {
    const { response, admin } = await requireAdmin(event)
    if (response || !admin) return response

    if (event.httpMethod === 'GET') {
      const [pools, winners] = await Promise.all([
        supabaseGet('/rest/v1/wm_prize_pools?select=*&order=created_at.desc'),
        supabaseGet('/rest/v1/wm_prize_winners?select=*&order=created_at.desc'),
      ])
      return json(200, { ok: true, pools, winners })
    }

    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })
    const body = readBody<PrizeBody>(event) || {}
    const action = body.action || 'create_pool'
    let result: unknown

    if (action === 'create_pool') {
      const rows = await supabasePost('/rest/v1/wm_prize_pools', {
        period_type: body.periodType || 'weekly',
        reward_asset: body.rewardAsset || 'manual',
        reward_amount: Number(body.rewardAmount || 0) || null,
        status: body.status || 'draft',
        metadata: body.metadata || {},
      })
      result = rows
    } else if (action === 'add_winner') {
      if (!body.prizePoolId || !body.userId) return json(400, { error: 'prizePoolId and userId are required.' })
      const rows = await supabasePost('/rest/v1/wm_prize_winners', {
        prize_pool_id: body.prizePoolId,
        user_id: body.userId,
        wallet_address: body.walletAddress || null,
        rank: body.rank || null,
        reward_amount: Number(body.rewardAmount || 0) || null,
        status: body.status || 'pending',
        reason: body.reason || null,
      })
      result = rows
    } else if (action === 'update_pool') {
      if (!body.prizePoolId) return json(400, { error: 'prizePoolId is required.' })
      const rows = await supabasePatch(`/rest/v1/wm_prize_pools?id=eq.${encodeURIComponent(body.prizePoolId)}`, {
        status: body.status || 'published',
        metadata: body.metadata || {},
      })
      result = rows
    } else if (action === 'update_winner') {
      if (!body.winnerId) return json(400, { error: 'winnerId is required.' })
      const rows = await supabasePatch(`/rest/v1/wm_prize_winners?id=eq.${encodeURIComponent(body.winnerId)}`, {
        status: body.status || 'approved',
        tx_hash: body.txHash || null,
        reason: body.reason || null,
      })
      result = rows
    } else if (action === 'draw_winners') {
      if (!body.prizePoolId) return json(400, { error: 'prizePoolId is required.' })
      const periodType = (body.periodType || 'weekly') as 'daily' | 'weekly' | 'season' | 'all_time'
      const winnerCount = Math.max(1, Math.min(50, Number(body.winnerCount || 3)))
      const leaderboard = await getCurrentLeaderboard(periodType)
      const winners = leaderboard.slice(0, winnerCount).map((row) => ({
        prize_pool_id: body.prizePoolId,
        user_id: row.userId,
        wallet_address: row.walletAddress,
        rank: row.rank,
        reward_amount: Number(body.rewardAmount || 0) || null,
        status: body.status || 'pending',
        reason: body.reason || `Top ${winnerCount} ${periodType} leaderboard draw`,
      }))
      const rows = winners.length ? await supabasePost('/rest/v1/wm_prize_winners', winners) : []
      await supabasePatch(`/rest/v1/wm_prize_pools?id=eq.${encodeURIComponent(body.prizePoolId)}`, {
        status: body.status === 'approved' ? 'published' : 'drawing',
        metadata: { ...(body.metadata || {}), draw_period_type: periodType, winner_count: winnerCount },
      })
      result = rows
    } else {
      return json(400, { error: 'Unsupported prize action.' })
    }

    await writeAdminAuditLog({
      adminUserId: admin.id,
      action: `prize.${action}`,
      targetType: 'wm_prize',
      targetId: body.prizePoolId || body.winnerId || null,
      after: { ...body },
    })

    return json(200, { ok: true, action, result })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

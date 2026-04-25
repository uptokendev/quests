import { requireAdmin } from './_lib/war-admin'
import { writeAdminAuditLog } from './_lib/admin-audit'
import { json, readBody } from './_lib/http'
import { getCurrentLeaderboard } from './_lib/war-engine'
import { supabasePost } from './_lib/supabase'

type SnapshotBody = {
  periodType?: 'daily' | 'weekly' | 'season' | 'all_time'
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  try {
    const { response, admin } = await requireAdmin(event)
    if (response || !admin) return response

    const body = readBody<SnapshotBody>(event) || {}
    const periodType = body.periodType || 'weekly'
    const rows = await getCurrentLeaderboard(periodType)
    const now = new Date().toISOString()
    const inserts = rows.map((row) => ({
      period_type: periodType,
      user_id: row.userId,
      xp_total: row.xpTotal,
      rank: row.rank,
      metadata: { wallet_address: row.walletAddress, display_name: row.displayName },
      published_at: now,
    }))

    const snapshotRows = inserts.length ? await supabasePost('/rest/v1/wm_leaderboard_snapshots', inserts) : []
    await writeAdminAuditLog({
      adminUserId: admin.id,
      action: 'leaderboard.snapshot',
      targetType: 'wm_leaderboard_snapshot',
      after: { period_type: periodType, rows: inserts.length },
    })

    return json(200, { ok: true, periodType, rows: snapshotRows })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

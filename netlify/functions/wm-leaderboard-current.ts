import { json } from './_lib/http'
import { getCurrentLeaderboard } from './_lib/war-engine'

type PeriodType = 'all_time' | 'daily' | 'weekly' | 'season'

export const handler = async (event: any) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' })

  try {
    const period = String(event.queryStringParameters?.period || 'all_time') as PeriodType
    const periodType: PeriodType = ['daily', 'weekly', 'season', 'all_time'].includes(period) ? period : 'all_time'
    const rows = await getCurrentLeaderboard(periodType)
    return json(200, { ok: true, periodType, rows })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

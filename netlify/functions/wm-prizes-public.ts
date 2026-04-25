import { json } from './_lib/http'
import { supabaseGet } from './_lib/supabase'

export const handler = async (event: any) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' })

  try {
    const [pools, winners] = await Promise.all([
      supabaseGet('/rest/v1/wm_prize_pools?select=*&status=in.(active,drawing,published,paid)&order=created_at.desc'),
      supabaseGet('/rest/v1/wm_prize_winners?select=*&status=in.(approved,paid)&order=created_at.desc'),
    ])
    return json(200, { ok: true, pools, winners })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

import crypto from 'node:crypto'
import { json, readWarAuth, unauthorized } from './_lib/war-auth.mjs'
import { insertRow, selectOne } from './_lib/supabase.mjs'

function botUsername() {
  return String(process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@+/, '')
}

function makeChallengeToken() {
  return crypto.randomBytes(24).toString('base64url')
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  const auth = readWarAuth(event)
  if (!auth) return unauthorized()

  try {
    const user = await selectOne('wm_users', {
      select: '*',
      id: `eq.${auth.userId}`,
      limit: '1',
    })

    if (!user || String(user.wallet_address || '').toLowerCase() !== auth.address) {
      return unauthorized('War Missions session is no longer valid.')
    }
    if (user.is_banned) return json(403, { error: 'This wallet is excluded from War Missions.' })

    const username = botUsername()
    if (!process.env.TELEGRAM_BOT_TOKEN || !username) {
      return json(503, { error: 'Telegram bot is not configured yet.' })
    }

    const token = makeChallengeToken()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    await insertRow('wm_social_link_challenges', {
      user_id: user.id,
      provider: 'telegram',
      token,
      expires_at: expiresAt,
    })

    return json(200, {
      ok: true,
      provider: 'telegram',
      expiresInSeconds: 600,
      telegramUrl: `https://t.me/${username}?start=${token}`,
    })
  } catch (error) {
    console.error('[wm-telegram-link-start] failed', error)
    return json(500, { error: error?.message || 'Unexpected server error.' })
  }
}

import crypto from 'node:crypto'
import { json } from './_lib/http'
import { readWarAuth, unauthorized } from './_lib/war-auth'
import { supabasePost } from './_lib/supabase'
import { getUserById } from './_lib/war-profile'

function getTelegramLinkConfig() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || ''
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || process.env.WM_TELEGRAM_BOT_USERNAME || ''
  const configuredUrl = process.env.WM_TELEGRAM_BOT_URL || ''
  const baseUrl = configuredUrl || (botUsername ? `https://t.me/${botUsername.replace(/^@+/, '')}` : '')

  if (!botToken || !baseUrl) {
    throw new Error('Telegram bot linking is not configured yet.')
  }

  return { baseUrl }
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  const auth = readWarAuth(event)
  if (!auth) return unauthorized()

  try {
    const user = await getUserById(auth.userId)
    if (!user || user.wallet_address !== auth.address) return unauthorized('War Missions session is no longer valid.')
    if (user.is_banned) return json(403, { error: 'This wallet is excluded from War Missions.' })

    const { baseUrl } = getTelegramLinkConfig()
    const token = crypto.randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    await supabasePost('/rest/v1/wm_social_link_challenges', {
      user_id: user.id,
      provider: 'telegram',
      token,
      expires_at: expiresAt,
    })

    const telegramUrl = new URL(baseUrl)
    telegramUrl.searchParams.set('start', `wm_${token}`)

    return json(200, {
      ok: true,
      telegramUrl: telegramUrl.toString(),
      expiresAt,
    })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Telegram link could not start.' })
  }
}

import { json, readWarAuth, unauthorized } from './_lib/war-auth.mjs'
import { selectOne, updateOne } from './_lib/supabase.mjs'

async function checkMembership(telegramUserId) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim()
  const chatId = String(process.env.TELEGRAM_REQUIRED_CHAT_ID || '').trim()

  if (!botToken || !chatId) {
    return { checked: false, ok: false, status: null, error: 'Telegram membership check is not configured.' }
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, user_id: Number(telegramUserId) }),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) {
    return {
      checked: true,
      ok: false,
      status: null,
      error: data?.description || `Telegram getChatMember failed (${response.status}).`,
    }
  }

  const status = String(data.result?.status || '')
  return {
    checked: true,
    ok: ['creator', 'administrator', 'member', 'restricted'].includes(status),
    status,
    error: null,
  }
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

    const account = await selectOne('wm_social_accounts', {
      select: 'id,provider_user_id,username',
      provider: 'eq.telegram',
      user_id: `eq.${user.id}`,
      limit: '1',
    })

    if (!account) return json(404, { error: 'Telegram is not linked yet.' })

    const membership = await checkMembership(account.provider_user_id)
    if (membership.ok) {
      await updateOne(
        'wm_social_accounts',
        { id: `eq.${account.id}` },
        { last_verified_at: new Date().toISOString() },
      )
    }

    return json(200, {
      ok: true,
      provider: 'telegram',
      username: account.username || account.provider_user_id,
      membership,
    })
  } catch (error) {
    console.error('[wm-telegram-member-check] failed', error)
    return json(500, { error: error?.message || 'Unexpected server error.' })
  }
}

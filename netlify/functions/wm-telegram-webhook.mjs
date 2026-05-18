import { json } from './_lib/war-auth.mjs'
import { consumeTelegramChallenge, submitSocialStartHereQuest } from './_lib/social-quests.mjs'
import { insertRow, selectOne, updateOne } from './_lib/supabase.mjs'

function getStartPayload(text) {
  const value = String(text || '').trim()
  const match = value.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i)
  return String(match?.[1] || '').trim()
}

function getCommand(text) {
  const value = String(text || '').trim().toLowerCase()
  const match = value.match(/^(\/[a-z0-9_]+)(?:@\w+)?(?:\s|$)/i)
  return match?.[1] || ''
}

function normalizeTelegramUsername(user) {
  const username = String(user?.username || '').trim().replace(/^@+/, '')
  if (username) return username

  const first = String(user?.first_name || '').trim()
  const last = String(user?.last_name || '').trim()
  const full = [first, last].filter(Boolean).join(' ').trim()

  return full || String(user?.id || '').trim()
}

function questsUrl() {
  return String(process.env.WAR_MISSIONS_QUESTS_URL || 'https://quests.memewar.zone').trim()
}

async function sendTelegramMessage(chatId, payload) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim()
  if (!botToken || !chatId) return

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      ...payload,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    console.error('[telegram] sendMessage failed', response.status, text)
  }
}

async function sendBackToQuests(chatId, text = 'Return to your War Missions quests page:') {
  await sendTelegramMessage(chatId, {
    text,
    reply_markup: {
      inline_keyboard: [[{ text: 'Back to Quests', url: questsUrl() }]],
    },
  })
}

async function getTelegramMemberStatus(telegramUserId) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim()
  const chatId = String(process.env.TELEGRAM_REQUIRED_CHAT_ID || '').trim()

  if (!botToken || !chatId || !telegramUserId) {
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

async function upsertTelegramAccount({ userId, telegramUser }) {
  const providerUserId = String(telegramUser.id)
  const username = normalizeTelegramUsername(telegramUser)
  const now = new Date().toISOString()

  const reused = await selectOne('wm_social_accounts', {
    select: 'id,user_id',
    provider: 'eq.telegram',
    provider_user_id: `eq.${providerUserId}`,
    limit: '1',
  })

  if (reused && reused.user_id !== userId) {
    const error = new Error('This Telegram account is already linked to another wallet.')
    error.statusCode = 409
    throw error
  }

  const current = await selectOne('wm_social_accounts', {
    select: 'id',
    provider: 'eq.telegram',
    user_id: `eq.${userId}`,
    limit: '1',
  })

  if (current) {
    await updateOne(
      'wm_social_accounts',
      { id: `eq.${current.id}` },
      {
        provider_user_id: providerUserId,
        username,
        last_verified_at: now,
      },
    )
  } else {
    await insertRow('wm_social_accounts', {
      user_id: userId,
      provider: 'telegram',
      provider_user_id: providerUserId,
      username,
      last_verified_at: now,
    })
  }

  return { providerUserId, username }
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  const expectedSecret = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim()
  if (expectedSecret) {
    const got = String(event.headers?.['x-telegram-bot-api-secret-token'] || event.headers?.['X-Telegram-Bot-Api-Secret-Token'] || '')
    if (got !== expectedSecret) return json(401, { ok: false, error: 'Invalid Telegram webhook secret.' })
  }

  try {
    const update = JSON.parse(event.body || '{}')
    const message = update.message || update.edited_message || null
    const telegramUser = message?.from || null
    const chatId = message?.chat?.id || telegramUser?.id || null
    const text = String(message?.text || '').trim()
    const command = getCommand(text)

    if (!telegramUser?.id || !text) return json(200, { ok: true, ignored: true })

    if (command === '/quests') {
      await sendBackToQuests(chatId)
      return json(200, { ok: true, command: 'quests' })
    }

    if (command === '/help') {
      await sendTelegramMessage(chatId, {
        text: 'Use /start from the MemeWarzone quests page to connect Telegram. Use /quests to return to the quests page.',
      })
      return json(200, { ok: true, command: 'help' })
    }

    const payload = getStartPayload(text)
    if (!payload) {
      await sendTelegramMessage(chatId, {
        text: 'Open Telegram from the MemeWarzone quests page to connect your account.',
        reply_markup: { inline_keyboard: [[{ text: 'Back to Quests', url: questsUrl() }]] },
      })
      return json(200, { ok: true, ignored: true, reason: 'missing_start_payload' })
    }

    const challenge = await consumeTelegramChallenge(payload)
    if (!challenge) {
      await sendTelegramMessage(chatId, {
        text: 'This Telegram connection link expired. Return to the quests page and connect Telegram again.',
        reply_markup: { inline_keyboard: [[{ text: 'Back to Quests', url: questsUrl() }]] },
      })
      return json(200, { ok: true, ignored: true, reason: 'challenge_not_found_or_expired' })
    }

    const user = await selectOne('wm_users', {
      select: '*',
      id: `eq.${challenge.user_id}`,
      limit: '1',
    })

    if (!user || user.is_banned) {
      return json(200, { ok: true, ignored: true, reason: 'user_not_found_or_banned' })
    }

    const membership = await getTelegramMemberStatus(telegramUser.id).catch((error) => ({
      checked: true,
      ok: false,
      status: null,
      error: error?.message || 'Membership check failed.',
    }))

    const linked = await upsertTelegramAccount({ userId: user.id, telegramUser })

    await submitSocialStartHereQuest({
      user,
      provider: 'telegram',
      username: linked.username,
      providerUserId: linked.providerUserId,
      verified: true,
      source: 'telegram_bot_webhook',
      note: membership.ok
        ? 'Telegram identity linked and official group membership confirmed.'
        : 'Telegram identity linked through bot webhook. Membership check was not confirmed yet.',
      metadata: {
        telegram: {
          id: telegramUser.id,
          username: telegramUser.username || null,
          firstName: telegramUser.first_name || null,
          lastName: telegramUser.last_name || null,
          languageCode: telegramUser.language_code || null,
        },
        membership,
      },
    })

    await sendBackToQuests(chatId, '✅ Telegram connected to MemeWarzone.\n\nReturn to your War Missions quests page:')

    return json(200, { ok: true, linked: true, membership })
  } catch (error) {
    console.error('[wm-telegram-webhook] failed', error)
    return json(200, { ok: false, error: error?.message || 'Unexpected server error.' })
  }
}

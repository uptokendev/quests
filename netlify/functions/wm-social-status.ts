import { json } from './_lib/http'
import { readWarAuth } from './_lib/war-auth'
import { supabaseGet } from './_lib/supabase'
import { buildWarProfile, getUserById } from './_lib/war-profile'

type SocialAccountRow = {
  provider: 'x' | 'discord' | 'telegram'
  provider_user_id: string
  username: string | null
  last_verified_at: string | null
}

function isXOAuthConfigured() {
  return Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET && process.env.X_REDIRECT_URI)
}

function getTelegramStatus() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || ''
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || process.env.WM_TELEGRAM_BOT_USERNAME || ''
  const configuredUrl = process.env.WM_TELEGRAM_BOT_URL || ''
  const telegramInviteUrl = configuredUrl || (botUsername ? `https://t.me/${botUsername.replace(/^@+/, '')}` : null)

  return {
    telegramConfigured: Boolean(botToken && telegramInviteUrl),
    telegramInviteUrl,
  }
}

function getDiscordStatus() {
  return {
    discordConfigured: Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_REDIRECT_URI),
    discordInviteUrl: process.env.WM_DISCORD_BOT_INVITE_URL || process.env.DISCORD_BOT_INVITE_URL || null,
  }
}

function buildCapabilityFlags() {
  return {
    xOAuthConfigured: isXOAuthConfigured(),
    ...getTelegramStatus(),
    ...getDiscordStatus(),
  }
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' })

  const baseStatus = buildCapabilityFlags()
  const auth = readWarAuth(event)
  if (!auth) {
    return json(200, {
      ok: true,
      authenticated: false,
      ...baseStatus,
      profile: null,
      accounts: [],
    })
  }

  try {
    const user = await getUserById(auth.userId)
    if (!user || user.wallet_address !== auth.address) {
      return json(200, {
        ok: true,
        authenticated: false,
        ...baseStatus,
        profile: null,
        accounts: [],
      })
    }

    const accounts = await supabaseGet<SocialAccountRow[]>(`/rest/v1/wm_social_accounts?select=provider,provider_user_id,username,last_verified_at&user_id=eq.${encodeURIComponent(user.id)}&order=provider.asc`)
    const profile = await buildWarProfile(user)

    return json(200, {
      ok: true,
      authenticated: true,
      ...baseStatus,
      profile,
      accounts: accounts.map((account) => ({
        provider: account.provider,
        providerUserId: account.provider_user_id,
        username: account.username || account.provider_user_id,
        lastVerifiedAt: account.last_verified_at,
        createdAt: null,
      })),
    })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

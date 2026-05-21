import { supabaseGet } from './supabase'

type Provider = 'telegram' | 'discord'

type LinkedAccountRow = {
  provider_user_id: string
  username: string | null
  last_verified_at: string | null
}

export type SocialMembershipCheckResult = {
  provider: Provider
  verified: boolean
  canRetry: boolean
  message: string
  metadata: Record<string, unknown>
}

export async function getLinkedSocialAccount(userId: string, provider: Provider) {
  const rows = await supabaseGet<LinkedAccountRow[]>(`/rest/v1/wm_social_accounts?select=provider_user_id,username,last_verified_at&provider=eq.${provider}&user_id=eq.${encodeURIComponent(userId)}&limit=1`)
  return rows[0] || null
}

async function verifyTelegramMembership(providerUserId: string): Promise<SocialMembershipCheckResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || ''
  const groupId = process.env.WM_TELEGRAM_GROUP_ID || ''
  if (!botToken || !groupId) {
    return {
      provider: 'telegram',
      verified: false,
      canRetry: true,
      message: 'Telegram membership check is not configured yet.',
      metadata: { configured: false },
    }
  }

  const url = new URL(`https://api.telegram.org/bot${botToken}/getChatMember`)
  url.searchParams.set('chat_id', groupId)
  url.searchParams.set('user_id', providerUserId)

  const response = await fetch(url)
  const payload = await response.json().catch(() => ({})) as {
    ok?: boolean
    result?: { status?: string; user?: { id?: number; username?: string } }
    description?: string
  }

  if (!response.ok || payload.ok === false) {
    return {
      provider: 'telegram',
      verified: false,
      canRetry: true,
      message: payload.description || 'Telegram membership check failed.',
      metadata: {
        configured: true,
        httpStatus: response.status,
        raw: payload,
      },
    }
  }

  const memberStatus = String(payload.result?.status || '').toLowerCase()
  const verified = Boolean(memberStatus && !['left', 'kicked'].includes(memberStatus))
  return {
    provider: 'telegram',
    verified,
    canRetry: !verified,
    message: verified ? 'Telegram membership verified.' : 'Telegram account is not currently in the official group.',
    metadata: {
      configured: true,
      memberStatus,
      raw: payload.result || null,
    },
  }
}

async function verifyDiscordMembership(providerUserId: string): Promise<SocialMembershipCheckResult> {
  const botToken = process.env.DISCORD_BOT_TOKEN || ''
  const guildId = process.env.WM_DISCORD_GUILD_ID || ''
  if (!botToken || !guildId) {
    return {
      provider: 'discord',
      verified: false,
      canRetry: true,
      message: 'Discord membership check is not configured yet.',
      metadata: { configured: false },
    }
  }

  const response = await fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(providerUserId)}`, {
    headers: {
      Authorization: `Bot ${botToken}`,
    },
  })

  if (response.status === 404) {
    return {
      provider: 'discord',
      verified: false,
      canRetry: true,
      message: 'Discord account is not currently in the official guild.',
      metadata: {
        configured: true,
        httpStatus: response.status,
      },
    }
  }

  const payload = await response.json().catch(() => ({})) as { user?: { id?: string; username?: string }; nick?: string; message?: string; joined_at?: string }
  if (!response.ok || !payload.user?.id) {
    return {
      provider: 'discord',
      verified: false,
      canRetry: true,
      message: payload.message || 'Discord membership check failed.',
      metadata: {
        configured: true,
        httpStatus: response.status,
        raw: payload,
      },
    }
  }

  return {
    provider: 'discord',
    verified: true,
    canRetry: false,
    message: 'Discord membership verified.',
    metadata: {
      configured: true,
      guildMember: {
        id: payload.user.id,
        username: payload.user.username || null,
        nick: payload.nick || null,
        joinedAt: payload.joined_at || null,
      },
    },
  }
}

export async function verifySocialMembership(userId: string, verificationType: string): Promise<SocialMembershipCheckResult | null> {
  if (verificationType === 'telegram_join') {
    const account = await getLinkedSocialAccount(userId, 'telegram')
    if (!account?.provider_user_id) {
      return {
        provider: 'telegram',
        verified: false,
        canRetry: true,
        message: 'No Telegram account is linked to this wallet yet.',
        metadata: { linked: false },
      }
    }
    const result = await verifyTelegramMembership(account.provider_user_id)
    return {
      ...result,
      metadata: {
        linked: true,
        providerUserId: account.provider_user_id,
        username: account.username || null,
        lastVerifiedAt: account.last_verified_at,
        ...result.metadata,
      },
    }
  }

  if (verificationType === 'discord_join') {
    const account = await getLinkedSocialAccount(userId, 'discord')
    if (!account?.provider_user_id) {
      return {
        provider: 'discord',
        verified: false,
        canRetry: true,
        message: 'No Discord account is linked to this wallet yet.',
        metadata: { linked: false },
      }
    }
    const result = await verifyDiscordMembership(account.provider_user_id)
    return {
      ...result,
      metadata: {
        linked: true,
        providerUserId: account.provider_user_id,
        username: account.username || null,
        lastVerifiedAt: account.last_verified_at,
        ...result.metadata,
      },
    }
  }

  return null
}

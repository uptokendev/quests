import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import './SocialIdentityPanel.css'

type Provider = 'x' | 'telegram' | 'discord'

type SocialAccount = {
  provider: Provider
  providerUserId: string
  username: string
  lastVerifiedAt: string | null
  createdAt: string | null
}

type SocialStatusResponse = {
  ok?: boolean
  authenticated?: boolean
  error?: string
  xOAuthConfigured?: boolean
  telegramConfigured?: boolean
  telegramInviteUrl?: string | null
  discordConfigured?: boolean
  discordInviteUrl?: string | null
  profile?: {
    walletAddress: string
  } | null
  accounts?: SocialAccount[]
}

type TelegramLinkStartResponse = {
  ok?: boolean
  error?: string
  telegramUrl?: string
}

type DiscordOAuthStartResponse = {
  ok?: boolean
  error?: string
  authorizeUrl?: string
}

type SocialIdentityPanelProps = {
  embedded?: boolean
}

function shorten(value: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : ''
}

function hasTelegramAccount(data: SocialStatusResponse | null) {
  return Boolean(data?.accounts?.some((account) => account.provider === 'telegram'))
}

export default function SocialIdentityPanel({ embedded = false }: SocialIdentityPanelProps) {
  const location = useLocation()
  const [status, setStatus] = useState<SocialStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Provider | ''>('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  const isAdminRoute = location.pathname.startsWith('/admin')

  useEffect(() => {
    if (embedded || isAdminRoute) return

    const mountIntoStatusCard = () => {
      const statusCard = document.querySelector<HTMLElement>('.war-status-card')
      if (!statusCard) return false

      let slot = statusCard.querySelector<HTMLElement>('.war-status-card__social-identity-slot')
      if (!slot) {
        slot = document.createElement('div')
        slot.className = 'war-status-card__social-identity-slot'
        statusCard.appendChild(slot)
      }
      setPortalTarget(slot)
      return true
    }

    if (mountIntoStatusCard()) return

    const raf = window.requestAnimationFrame(() => {
      mountIntoStatusCard()
    })
    return () => window.cancelAnimationFrame(raf)
  }, [embedded, isAdminRoute, location.pathname])

  const accountsByProvider = useMemo(() => {
    const map = new Map<Provider, SocialAccount>()
    for (const account of status?.accounts || []) map.set(account.provider, account)
    return map
  }, [status])

  const telegramLinked = accountsByProvider.has('telegram')
  const discordLinked = accountsByProvider.has('discord')
  const commsLinked = telegramLinked || discordLinked

  const loadStatus = async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/wm-social-status', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const data = (await response.json().catch(() => ({}))) as SocialStatusResponse
      if (!response.ok || !data?.ok) throw new Error(data.error || 'Unable to load social identity status.')
      setStatus(data)
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load social identity status.')
      return null
    } finally {
      if (!options.silent) setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAdminRoute) void loadStatus()
  }, [isAdminRoute])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('social') === 'x-connected') setMessage('X account connected and Start Here verification was submitted.')
    if (params.get('social') === 'telegram-connected') setMessage('Telegram connected. Welcome back to the quest board.')
    if (params.get('social') === 'discord-connected') setMessage('Discord connected. Welcome back to the quest board.')
    if (params.get('discord_bot_added') === '1') setMessage('Discord bot added. You can now connect your personal Discord account from the quest board.')
    if (params.get('social_error')) setError(params.get('social_error') || 'Social connection failed.')
  }, [location.search])

  if (isAdminRoute) return null

  const pollTelegramConnection = () => {
    let attempts = 0
    const maxAttempts = 48

    const interval = window.setInterval(async () => {
      attempts += 1
      const nextStatus = await loadStatus({ silent: true })

      if (hasTelegramAccount(nextStatus)) {
        window.clearInterval(interval)
        setBusy('')
        setMessage('Telegram connected. Returning you to the quest board status now.')
        window.setTimeout(() => window.location.reload(), 450)
        return
      }

      if (attempts >= maxAttempts) {
        window.clearInterval(interval)
        setBusy('')
        setMessage('Still waiting for Telegram. Press Start in the bot, then hit Refresh here.')
      }
    }, 2500)
  }

  const connectTelegram = async () => {
    if (!status?.authenticated) {
      setError('Connect your wallet first, then link Telegram.')
      return
    }
    if (status.telegramConfigured === false) {
      setError('Telegram bot auth is not configured on this deploy yet.')
      return
    }

    setBusy('telegram')
    setError('')
    setMessage('Opening Telegram. Press Start in the bot to connect your account.')

    try {
      const response = await fetch('/api/wm-telegram-link-start', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = (await response.json().catch(() => ({}))) as TelegramLinkStartResponse
      if (!response.ok || !data?.ok || !data.telegramUrl) {
        throw new Error(data?.error || 'Telegram connection could not start.')
      }

      window.open(data.telegramUrl, '_blank', 'noopener,noreferrer')
      pollTelegramConnection()
    } catch (err) {
      setBusy('')
      setError(err instanceof Error ? err.message : 'Telegram connection could not start.')
    }
  }

  const connectDiscord = async () => {
    if (!status?.authenticated) {
      setError('Connect your wallet first, then link Discord.')
      return
    }
    if (status.discordConfigured === false) {
      setError('Discord OAuth is not configured on this deploy yet.')
      return
    }

    setBusy('discord')
    setError('')
    setMessage('Opening Discord authorization. Approve the connection to return to the quest board.')

    try {
      const response = await fetch('/api/wm-discord-oauth-start', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = (await response.json().catch(() => ({}))) as DiscordOAuthStartResponse
      if (!response.ok || !data?.ok || !data.authorizeUrl) {
        throw new Error(data?.error || 'Discord connection could not start.')
      }

      window.location.href = data.authorizeUrl
    } catch (err) {
      setBusy('')
      setError(err instanceof Error ? err.message : 'Discord connection could not start.')
    }
  }

  const connectX = () => {
    if (!status?.authenticated) {
      setError('Connect your wallet first, then link X.')
      return
    }
    if (!status.xOAuthConfigured) {
      setError('X OAuth is not configured on this deploy yet.')
      return
    }
    const returnTo = `${location.pathname}${location.search || ''}`
    window.location.href = `/api/wm-x-oauth-start?returnTo=${encodeURIComponent(returnTo)}`
  }

  const xAccount = accountsByProvider.get('x')
  const telegramAccount = accountsByProvider.get('telegram')
  const discordAccount = accountsByProvider.get('discord')

  const panel = (
    <section className={embedded || portalTarget ? 'social-identity-panel social-identity-panel--embedded' : 'social-identity-panel'} aria-label="Social identity status">
      <div className="social-identity-panel__head">
        <div>
          <div className="social-identity-panel__eyebrow">Identity status</div>
          <h2>Social links</h2>
        </div>
        <button className="social-identity-panel__refresh" type="button" onClick={() => void loadStatus()} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="social-identity-panel__wallet">
        <span className={status?.authenticated ? 'social-identity-panel__dot social-identity-panel__dot--on' : 'social-identity-panel__dot'} />
        {status?.authenticated && status.profile?.walletAddress ? `Wallet ${shorten(status.profile.walletAddress)}` : 'Wallet not connected'}
      </div>

      <div className="social-identity-panel__item">
        <div>
          <strong>X</strong>
          <p>{xAccount ? `@${xAccount.username}` : 'Connect X OAuth for the main social identity path.'}</p>
        </div>
        <button type="button" onClick={connectX} disabled={busy !== '' || loading || Boolean(xAccount)}>
          {xAccount ? 'Connected' : 'Connect X'}
        </button>
      </div>

      <div className="social-identity-panel__or">Optional comms - Telegram or Discord is enough</div>

      <div className="social-identity-panel__item">
        <div>
          <strong>Telegram</strong>
          <p>{telegramAccount ? `@${telegramAccount.username}` : 'Connect through the MemeWarzone bot. No username typing needed.'}</p>
        </div>
        <button type="button" onClick={() => void connectTelegram()} disabled={busy !== '' || loading || telegramLinked}>
          {telegramLinked ? 'Connected' : busy === 'telegram' ? 'Waiting...' : 'Connect Telegram'}
        </button>
      </div>

      <div className="social-identity-panel__item">
        <div>
          <strong>Discord</strong>
          <p>{discordAccount ? discordAccount.username : 'Connect through Discord OAuth. No username typing needed.'}</p>
        </div>
        <button type="button" onClick={() => void connectDiscord()} disabled={busy !== '' || loading || discordLinked}>
          {discordLinked ? 'Connected' : busy === 'discord' ? 'Opening...' : 'Connect Discord'}
        </button>
      </div>

      <div className={commsLinked ? 'social-identity-panel__note social-identity-panel__note--ok' : 'social-identity-panel__note'}>
        {commsLinked ? 'Comms identity linked.' : 'Telegram and Discord are not both required. Link whichever one your soldiers actually use.'}
      </div>

      {message ? <div className="social-identity-panel__message">{message}</div> : null}
      {error ? <div className="social-identity-panel__error">{error}</div> : null}
    </section>
  )

  if (!embedded && portalTarget) return createPortal(panel, portalTarget)
  return panel
}

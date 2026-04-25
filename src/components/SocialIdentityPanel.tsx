import { useEffect, useMemo, useState } from 'react'
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
  profile?: {
    walletAddress: string
  } | null
  accounts?: SocialAccount[]
}

const providerLabels: Record<Provider, string> = {
  x: 'X',
  telegram: 'Telegram',
  discord: 'Discord',
}

function shorten(value: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : ''
}

function normalizeHandle(value: string) {
  return value.trim().replace(/^@+/, '')
}

export default function SocialIdentityPanel() {
  const location = useLocation()
  const [status, setStatus] = useState<SocialStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Provider | ''>('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const isAdminRoute = location.pathname.startsWith('/admin')

  const accountsByProvider = useMemo(() => {
    const map = new Map<Provider, SocialAccount>()
    for (const account of status?.accounts || []) map.set(account.provider, account)
    return map
  }, [status])

  const telegramLinked = accountsByProvider.has('telegram')
  const discordLinked = accountsByProvider.has('discord')
  const commsLinked = telegramLinked || discordLinked

  const loadStatus = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/wm-social-status', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const data = (await response.json().catch(() => ({}))) as SocialStatusResponse
      if (!response.ok || !data?.ok) throw new Error(data.error || 'Unable to load social identity status.')
      setStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load social identity status.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAdminRoute) void loadStatus()
  }, [isAdminRoute])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('social') === 'x-connected') setMessage('X account connected. Follow verification can run once the X checks are enabled.')
    if (params.get('social_error')) setError(params.get('social_error') || 'Social connection failed.')
  }, [location.search])

  if (isAdminRoute) return null

  const linkManualProvider = async (provider: Exclude<Provider, 'x'>) => {
    if (!status?.authenticated) {
      setError('Connect your wallet first, then link socials.')
      return
    }

    const label = providerLabels[provider]
    const username = normalizeHandle(window.prompt(`Enter your ${label} username or user ID:`) || '')
    if (!username) return

    setBusy(provider)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/wm-social-link', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, username }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.ok) throw new Error(data?.error || `${label} link failed.`)
      setMessage(`${label} linked for manual review. Bot verification can replace this once your bot is live.`)
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : `${label} link failed.`)
    } finally {
      setBusy('')
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

  return (
    <aside className="social-identity-panel" aria-label="Social identity status">
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

      <div className="social-identity-panel__or">Optional comms — Telegram or Discord is enough</div>

      <div className="social-identity-panel__item">
        <div>
          <strong>Telegram</strong>
          <p>{telegramAccount ? `@${telegramAccount.username}` : 'Manual link now. Bot verification later.'}</p>
        </div>
        <button type="button" onClick={() => void linkManualProvider('telegram')} disabled={busy !== '' || loading || telegramLinked}>
          {telegramLinked ? 'Linked' : 'Link'}
        </button>
      </div>

      <div className="social-identity-panel__item">
        <div>
          <strong>Discord</strong>
          <p>{discordAccount ? discordAccount.username : 'Manual link now. Bot verification later.'}</p>
        </div>
        <button type="button" onClick={() => void linkManualProvider('discord')} disabled={busy !== '' || loading || discordLinked}>
          {discordLinked ? 'Linked' : 'Link'}
        </button>
      </div>

      <div className={commsLinked ? 'social-identity-panel__note social-identity-panel__note--ok' : 'social-identity-panel__note'}>
        {commsLinked ? 'Comms identity linked.' : 'Telegram and Discord are not both required. Link whichever one your soldiers actually use.'}
      </div>

      {message ? <div className="social-identity-panel__message">{message}</div> : null}
      {error ? <div className="social-identity-panel__error">{error}</div> : null}
    </aside>
  )
}

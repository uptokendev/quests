import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { connectWallet } from '../lib/wallet'
import './WarMissionsPage.css'

type AdminNotification = {
  id: string
  type: string
  title: string
  message: string | null
  priority: 'low' | 'normal' | 'high' | 'urgent'
  status: string
  related_user_id: string | null
  related_completion_id: string | null
  related_application_id: string | null
  created_at: string
}

type PrizePool = {
  id: string
  period_type: string
  reward_asset: string | null
  reward_amount: number | null
  status: string
  created_at: string
}

type PrizeWinner = {
  id: string
  prize_pool_id: string
  wallet_address: string | null
  rank: number | null
  reward_amount: number | null
  status: string
}

function shortId(value: string | null) {
  if (!value) return 'none'
  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

async function apiPost(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data?.ok) throw new Error(data?.error || 'Admin action failed.')
  return data
}

export default function WarAdminPage() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [pools, setPools] = useState<PrizePool[]>([])
  const [winners, setWinners] = useState<PrizeWinner[]>([])
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadAdmin = async () => {
    setBusy('load')
    setError('')
    try {
      const [notificationResponse, prizeResponse] = await Promise.all([
        fetch('/api/wm-admin-notifications-list', { credentials: 'same-origin', cache: 'no-store' }),
        fetch('/api/wm-admin-prizes', { credentials: 'same-origin', cache: 'no-store' }),
      ])
      const notificationData = await notificationResponse.json().catch(() => ({}))
      const prizeData = await prizeResponse.json().catch(() => ({}))
      if (!notificationResponse.ok || !notificationData?.ok) throw new Error(notificationData?.error || 'Admin notifications unavailable.')
      if (!prizeResponse.ok || !prizeData?.ok) throw new Error(prizeData?.error || 'Prize data unavailable.')
      setNotifications(notificationData.rows || [])
      setPools(prizeData.pools || [])
      setWinners(prizeData.winners || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin data unavailable.')
    } finally {
      setBusy('')
    }
  }

  useEffect(() => {
    void loadAdmin()
  }, [])

  const signIn = async () => {
    setBusy('auth')
    setError('')
    try {
      const { signer, address } = await connectWallet()
      const nonceResponse = await fetch(`/api/wm-auth-nonce?address=${encodeURIComponent(address)}`, { credentials: 'same-origin' })
      const nonceData = await nonceResponse.json().catch(() => ({}))
      if (!nonceResponse.ok || !nonceData?.message) throw new Error(nonceData?.error || 'Failed to request wallet challenge.')
      const signature = await signer.signMessage(nonceData.message)
      const verifyResponse = await fetch('/api/wm-auth-verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature }),
      })
      const verifyData = await verifyResponse.json().catch(() => ({}))
      if (!verifyResponse.ok || !verifyData?.ok) throw new Error(verifyData?.error || 'Wallet sign-in failed.')
      setMessage('Admin wallet connected.')
      await loadAdmin()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet sign-in failed.')
    } finally {
      setBusy('')
    }
  }

  const runAction = async (label: string, action: () => Promise<unknown>) => {
    setBusy(label)
    setMessage('')
    setError('')
    try {
      await action()
      setMessage(`${label} complete.`)
      await loadAdmin()
    } catch (err) {
      setError(err instanceof Error ? err.message : `${label} failed.`)
    } finally {
      setBusy('')
    }
  }

  const resolveNotification = (id: string) => runAction('Resolve notification', async () => {
    const response = await fetch('/api/wm-admin-notifications-list', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'resolved' }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.ok) throw new Error(data?.error || 'Notification update failed.')
  })

  const reviewCompletion = () => runAction('Review completion', async () => {
    const completionId = window.prompt('Completion ID') || ''
    if (!completionId) return
    const status = window.prompt('Status', 'verified') || 'verified'
    const reason = window.prompt('Reason', 'Admin review') || 'Admin review'
    await apiPost('/api/wm-admin-review-completion', { completionId, status, reason })
  })

  const recheckSocial = () => runAction('Social recheck', async () => {
    const completionId = window.prompt('Completion ID') || ''
    if (!completionId) return
    const impressions = Number(window.prompt('Impressions', '0') || 0)
    const likes = Number(window.prompt('Likes', '0') || 0)
    const available = (window.prompt('Available?', 'yes') || 'yes').toLowerCase() !== 'no'
    const expired = (window.prompt('Expired?', 'no') || 'no').toLowerCase() === 'yes'
    await apiPost('/api/wm-admin-social-recheck', {
      completionId,
      metrics: { impressionCount: impressions, likeCount: likes },
      available,
      expired,
      reason: 'Admin social metric recheck',
    })
  })

  const snapshotLeaderboard = () => runAction('Snapshot leaderboard', async () => {
    const periodType = window.prompt('Period', 'weekly') || 'weekly'
    await apiPost('/api/wm-admin-leaderboard-snapshot', { periodType })
  })

  const createPrizePool = () => runAction('Create prize pool', async () => {
    const periodType = window.prompt('Period', 'weekly') || 'weekly'
    const rewardAsset = window.prompt('Reward asset', 'XP bonus') || 'XP bonus'
    const rewardAmount = Number(window.prompt('Reward amount', '0') || 0)
    await apiPost('/api/wm-admin-prizes', { action: 'create_pool', periodType, rewardAsset, rewardAmount, status: 'active' })
  })

  const drawWinners = () => runAction('Draw winners', async () => {
    const prizePoolId = window.prompt('Prize pool ID', pools[0]?.id || '') || ''
    if (!prizePoolId) return
    const winnerCount = Number(window.prompt('Winners', '3') || 3)
    const rewardAmount = Number(window.prompt('Reward amount per winner', '0') || 0)
    const periodType = window.prompt('Period', 'weekly') || 'weekly'
    await apiPost('/api/wm-admin-prizes', { action: 'draw_winners', prizePoolId, winnerCount, rewardAmount, periodType })
  })

  const badgeAction = () => runAction('Badge action', async () => {
    const walletAddress = window.prompt('Wallet address') || ''
    const badgeSlug = window.prompt('Badge slug') || ''
    const action = window.prompt('Action', 'award') || 'award'
    const reason = window.prompt('Reason', 'Manual admin action') || 'Manual admin action'
    if (!walletAddress || !badgeSlug) return
    await apiPost('/api/wm-admin-badge-award', { walletAddress, badgeSlug, action, reason })
  })

  const userAction = () => runAction('User action', async () => {
    const walletAddress = window.prompt('Wallet address') || ''
    const action = window.prompt('Action', 'ban') || 'ban'
    const reason = window.prompt('Reason', 'Admin risk action') || 'Admin risk action'
    if (!walletAddress) return
    await apiPost('/api/wm-admin-user-action', { walletAddress, action, reason })
  })

  const recruiterReview = () => runAction('Recruiter review', async () => {
    const applicationId = window.prompt('Application ID') || ''
    const status = window.prompt('Status', 'accepted') || 'accepted'
    const reason = window.prompt('Reason', 'Admin recruiter review') || 'Admin recruiter review'
    if (!applicationId) return
    await apiPost('/api/wm-admin-recruiter-review', { applicationId, status, reason })
  })

  const questUpsert = () => runAction('Quest upsert', async () => {
    const slug = window.prompt('Quest slug') || ''
    if (!slug) return
    const title = window.prompt('Title') || slug
    const categorySlug = window.prompt('Category slug', 'start-here') || 'start-here'
    const description = window.prompt('Description') || ''
    const xpReward = Number(window.prompt('XP reward', '100') || 100)
    const verificationType = window.prompt('Verification type', 'manual_review') || 'manual_review'
    const active = (window.prompt('Active?', 'yes') || 'yes').toLowerCase() !== 'no'
    await apiPost('/api/wm-admin-quest-upsert', { slug, title, categorySlug, description, xpReward, verificationType, active })
  })

  const categoryUpsert = () => runAction('Category upsert', async () => {
    const slug = window.prompt('Category slug') || ''
    if (!slug) return
    const title = window.prompt('Title') || slug
    const description = window.prompt('Description') || ''
    const displayOrder = Number(window.prompt('Display order', '50') || 50)
    const active = (window.prompt('Active?', 'yes') || 'yes').toLowerCase() !== 'no'
    await apiPost('/api/wm-admin-quest-upsert', { entity: 'category', slug, title, description, displayOrder, active })
  })

  return (
    <div className="war-missions-page war-admin-page">
      <div className="war-missions-bg" aria-hidden="true" />
      <div className="war-missions-overlay" aria-hidden="true" />
      <header className="war-missions-top">
        <Link to="/missions" className="war-missions-brand" aria-label="MemeWarzone War Missions">
          <img src="/logo.png" alt="MemeWarzone" />
        </Link>
        <nav className="war-missions-nav" aria-label="War admin navigation">
          <Link to="/missions">Missions</Link>
          <Link to="/missions/leaderboard">Leaderboard</Link>
          <Link to="/missions/rewards">Rewards</Link>
        </nav>
      </header>

      <main className="war-missions-shell">
        <section className="war-panel war-admin-hero">
          <div>
            <div className="war-kicker">Command console</div>
            <h1>War Missions Admin</h1>
          </div>
          <div className="war-admin-actions">
            <button type="button" className="war-primary" onClick={() => void signIn()} disabled={busy === 'auth'}>{busy === 'auth' ? 'Connecting...' : 'Connect admin wallet'}</button>
            <button type="button" className="war-secondary" onClick={() => void loadAdmin()} disabled={busy === 'load'}>Refresh</button>
          </div>
          {error ? <div className="war-alert">{error}</div> : null}
          {message ? <div className="war-success">{message}</div> : null}
        </section>

        <section className="war-panel">
          <div className="war-section-head">
            <div>
              <div className="war-kicker">Action deck</div>
              <h2>Operations</h2>
            </div>
          </div>
          <div className="war-admin-command-grid">
            <button type="button" onClick={reviewCompletion}>Review completion</button>
            <button type="button" onClick={recheckSocial}>Social recheck</button>
            <button type="button" onClick={snapshotLeaderboard}>Snapshot leaderboard</button>
            <button type="button" onClick={createPrizePool}>Create prize pool</button>
            <button type="button" onClick={drawWinners}>Draw winners</button>
            <button type="button" onClick={badgeAction}>Badge award/revoke</button>
            <button type="button" onClick={recruiterReview}>Recruiter review</button>
            <button type="button" onClick={categoryUpsert}>Category upsert</button>
            <button type="button" onClick={questUpsert}>Quest upsert</button>
            <button type="button" onClick={userAction}>Ban/unban user</button>
          </div>
        </section>

        <section className="war-two-col">
          <div className="war-panel war-panel--tight">
            <div className="war-kicker">Review queue</div>
            <h2>{notifications.length} notifications</h2>
            <div className="war-admin-list">
              {notifications.slice(0, 14).map((notification) => (
                <article className="war-admin-row" key={notification.id}>
                  <div>
                    <strong>{notification.title}</strong>
                    <span>{notification.priority} | {notification.status} | {notification.type}</span>
                    <span>completion {shortId(notification.related_completion_id)} | app {shortId(notification.related_application_id)}</span>
                  </div>
                  <button type="button" onClick={() => void resolveNotification(notification.id)} disabled={notification.status === 'resolved'}>Resolve</button>
                </article>
              ))}
            </div>
          </div>

          <div className="war-panel war-panel--tight">
            <div className="war-kicker">Prizes</div>
            <h2>{pools.length} pools</h2>
            <div className="war-admin-list">
              {pools.slice(0, 8).map((pool) => (
                <article className="war-admin-row" key={pool.id}>
                  <div>
                    <strong>{pool.period_type} | {pool.status}</strong>
                    <span>{pool.reward_asset || 'reward'} {pool.reward_amount || ''}</span>
                    <span>{shortId(pool.id)}</span>
                  </div>
                </article>
              ))}
              {winners.slice(0, 8).map((winner) => (
                <article className="war-admin-row" key={winner.id}>
                  <div>
                    <strong>Winner #{winner.rank || '-'}</strong>
                    <span>{winner.wallet_address ? shortId(winner.wallet_address) : 'wallet pending'} | {winner.status}</span>
                    <span>pool {shortId(winner.prize_pool_id)}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

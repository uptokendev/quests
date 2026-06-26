import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EpochStatusBadge, RewardMetricCard, RoleBadge, SquadMembersTable, WeeklyClaimButton, formatDate, shortWallet, type RewardClaim, type RewardEpoch, type RewardMember, type SquadRole } from '../components/rewards/SquadRewards'
import { connectWallet } from '../lib/wallet'
import './WarMissionsPage.css'

type SquadPageResponse = {
  ok?: boolean
  error?: string
  squad?: { id?: string; name?: string | null; imageUrl?: string | null; recruiterWallet: string; recruiterCode?: string | null; recruiterName?: string | null } | null
  user?: { wallet: string; role: SquadRole; joinedAt?: string | null } | null
  metrics?: { totalSquadRevenue: string; currentEpochRevenue: string; userCut: string; claimable: string; claimedLifetime: string; currency: string } | null
  epoch?: RewardEpoch | null
  claim?: RewardClaim | null
  members?: RewardMember[]
}

const SQUAD_ENDPOINTS = ['/api/rewards/squad/portal', '/api/squad/portal']

async function fetchFirst<T>(paths: string[]): Promise<T> {
  let lastError = 'Squad data is not available yet.'
  for (const path of paths) {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store' })
    const data = (await response.json().catch(() => ({}))) as T & { ok?: boolean; error?: string }
    if (response.ok && data && data.ok !== false) return data
    lastError = data?.error || lastError
  }
  throw new Error(lastError)
}

export default function RecruiterSquadPage() {
  const [wallet, setWallet] = useState('')
  const [data, setData] = useState<SquadPageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [authing, setAuthing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadState = async () => {
    setLoading(true)
    setError('')
    try {
      const next = await fetchFirst<SquadPageResponse>(SQUAD_ENDPOINTS)
      setData(next)
      setWallet((current) => next.user?.wallet || current)
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : 'Squad data is not available yet.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadState() }, [])

  const signIn = async () => {
    setAuthing(true)
    setError('')
    try {
      const { signer, address } = await connectWallet()
      const nonceResponse = await fetch(`/api/wm-auth-nonce?address=${encodeURIComponent(address)}`, { credentials: 'same-origin' })
      const nonceData = await nonceResponse.json().catch(() => ({}))
      if (!nonceResponse.ok || !nonceData?.message) throw new Error(nonceData?.error || 'Failed to request wallet challenge.')
      const signature = await signer.signMessage(nonceData.message)
      const verifyResponse = await fetch('/api/wm-auth-verify', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address, signature }) })
      const verifyData = await verifyResponse.json().catch(() => ({}))
      if (!verifyResponse.ok || !verifyData?.ok) throw new Error(verifyData?.error || 'Wallet sign-in failed.')
      setWallet(address)
      await loadState()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet sign-in failed.')
    } finally {
      setAuthing(false)
    }
  }

  const claimSquadRewards = async () => {
    if (!data?.epoch?.id || !wallet) return
    try {
      const response = await fetch('/api/rewards/squad/claim', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet, epochId: data.epoch.id }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.success === false) throw new Error(result?.error || 'Squad claim failed.')
      setNotice('Squad rewards claimed')
      await loadState()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Squad claim failed.')
    }
  }

  const squad = data?.squad
  const user = data?.user
  const metrics = data?.metrics
  const members = data?.members || []
  const currency = metrics?.currency || ''

  return (
    <div className="war-missions-page">
      <div className="war-missions-bg" aria-hidden="true" /><div className="war-missions-overlay" aria-hidden="true" />
      <header className="war-missions-top"><Link to="/" className="war-missions-brand" aria-label="MemeWarzone War Missions home"><img src="/logo.png" alt="MemeWarzone" /></Link><nav className="war-missions-nav" aria-label="Squad navigation"><Link to="/recruiter/portal">Recruiter</Link><Link to="/recruiter/apply">Signup</Link><Link to="/missions">Missions</Link></nav></header>
      <main className="war-missions-shell">
        <section className="war-hero">
          <div className="war-hero-copy"><div className="war-kicker">Command Center</div><h1>Squad Rewards</h1><p>Squad identity, members, revenue, your cut, and weekly claim status.</p><div className="war-hero-actions"><button type="button" className="war-primary" onClick={() => void signIn()} disabled={authing}>{authing ? 'Waiting for signature...' : wallet ? 'Wallet connected' : 'Connect wallet'}</button><Link to="/recruiter/portal" className="war-secondary">Recruiter rewards</Link></div>{error ? <div className="war-alert">{error}</div> : null}{notice ? <div className="war-success">{notice}</div> : null}</div>
          <aside className="war-status-card">{loading ? <p>Loading squad rewards...</p> : squad && user ? <>{squad.imageUrl ? <img src={squad.imageUrl} alt="" style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', marginBottom: 12 }} /> : null}<div className="war-status-card__label">Squad</div><div className="war-status-card__title">{squad.name || squad.recruiterCode || shortWallet(squad.recruiterWallet)}</div><p>Recruiter {squad.recruiterName || shortWallet(squad.recruiterWallet)}</p><div className="war-checklist"><span className="war-checklist__done">Your wallet: {shortWallet(user.wallet)}</span><span>Your role: <RoleBadge role={user.role} /></span><span>Joined {formatDate(user.joinedAt)}</span><span>{members.length} squad members</span></div></> : <><div className="war-status-card__label">Squad</div><div className="war-status-card__title">You are not in a squad yet.</div><p>Join through a recruiter link to activate squad rewards.</p></>}</aside>
        </section>
        {squad && user ? <><section className="war-stats" aria-label="Squad revenue"><RewardMetricCard label="Squad Revenue" value={`${metrics?.totalSquadRevenue || '0'} ${currency}`.trim()} /><RewardMetricCard label="Current Epoch" value={`${metrics?.currentEpochRevenue || '0'} ${currency}`.trim()} /><RewardMetricCard label="Your Cut" value={`${metrics?.userCut || '0'} ${currency}`.trim()} /><RewardMetricCard label="Claimable" value={`${metrics?.claimable || data?.claim?.claimableAmount || '0'} ${currency}`.trim()} help={`Claimed lifetime: ${metrics?.claimedLifetime || '0'} ${currency}`.trim()} /></section><section className="war-two-col"><WeeklyClaimButton label="Claim Weekly Squad Rewards" claim={data?.claim} walletConnected={Boolean(wallet)} onClaim={claimSquadRewards} /><section className="war-panel war-panel--tight"><div className="war-section-head"><div><div className="war-kicker">Claim Status</div><h2>{data?.claim?.canClaim ? 'Claim available' : data?.claim?.disabledReason || 'Claim unavailable'}</h2></div><EpochStatusBadge epoch={data?.epoch} /></div><div className="review-list"><span><strong>Claimable</strong><em>{data?.claim?.claimableAmount || '0'} {currency}</em></span><span><strong>Already claimed</strong><em>{data?.claim?.alreadyClaimed ? 'Yes' : 'No'}</em></span><span><strong>Current epoch</strong><em>{String(data?.epoch?.id || '-')}</em></span><span><strong>Epoch ends</strong><em>{formatDate(data?.epoch?.endsAt)}</em></span></div></section></section><SquadMembersTable members={members} showEarned /></> : null}
      </main>
    </div>
  )
}

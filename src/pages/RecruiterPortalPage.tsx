import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EpochStatusBadge, RewardMetricCard, SquadMembersTable, WeeklyClaimButton, formatDate, shortWallet, type RewardClaim, type RewardEpoch, type RewardMember } from '../components/rewards/SquadRewards'
import { connectWallet } from '../lib/wallet'
import './WarMissionsPage.css'

type RecruiterPortalResponse = {
  ok?: boolean
  error?: string
  recruiter?: { wallet: string; code: string; name?: string | null; imageUrl?: string | null; status: 'active' | 'pending' | 'suspended' | string } | null
  squad?: { totalMembers: number; creators: number; traders: number; both: number; legacyUnknown: number; members: RewardMember[] } | null
  earnings?: { pending: string; claimable: string; claimedLifetime: string; currency: string } | null
  epoch?: RewardEpoch | null
  claim?: RewardClaim | null
}

const PORTAL_ENDPOINTS = ['/api/rewards/recruiter/portal', '/api/recruiter/portal']

async function fetchFirst<T>(paths: string[]): Promise<T> {
  let lastError = 'Recruiter data is not available yet.'
  for (const path of paths) {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store' })
    const data = (await response.json().catch(() => ({}))) as T & { ok?: boolean; error?: string }
    if (response.ok && data && data.ok !== false) return data
    lastError = data?.error || lastError
  }
  throw new Error(lastError)
}

export default function RecruiterPortalPage() {
  const [wallet, setWallet] = useState('')
  const [data, setData] = useState<RecruiterPortalResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [authing, setAuthing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadState = async () => {
    setLoading(true)
    setError('')
    try {
      const next = await fetchFirst<RecruiterPortalResponse>(PORTAL_ENDPOINTS)
      setData(next)
      setWallet((current) => next.recruiter?.wallet || current)
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : 'Recruiter data is not available yet.')
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

  const claimRecruiterRewards = async () => {
    if (!data?.epoch?.id || !wallet) return
    try {
      const response = await fetch('/api/rewards/recruiter/claim', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet, epochId: data.epoch.id }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.success === false) throw new Error(result?.error || 'Recruiter claim failed.')
      setNotice('Recruiter rewards claimed')
      await loadState()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recruiter claim failed.')
    }
  }

  const recruiter = data?.recruiter
  const earnings = data?.earnings
  const members = data?.squad?.members || []
  const link = recruiter?.code && typeof window !== 'undefined' ? `${window.location.origin}/r/${recruiter.code}` : ''

  return (
    <div className="war-missions-page">
      <div className="war-missions-bg" aria-hidden="true" /><div className="war-missions-overlay" aria-hidden="true" />
      <header className="war-missions-top"><Link to="/" className="war-missions-brand" aria-label="MemeWarzone War Missions home"><img src="/logo.png" alt="MemeWarzone" /></Link><nav className="war-missions-nav" aria-label="Recruiter portal navigation"><Link to="/profile/squad">Squad</Link><Link to="/recruiter/apply">Signup</Link><Link to="/missions">Missions</Link></nav></header>
      <main className="war-missions-shell">
        <section className="war-hero">
          <div className="war-hero-copy"><div className="war-kicker">Command Center</div><h1>Recruiter Rewards</h1><p>Recruiter identity, squad roster, earnings, and weekly claim status.</p><div className="war-hero-actions"><button type="button" className="war-primary" onClick={() => void signIn()} disabled={authing}>{authing ? 'Waiting for signature...' : wallet ? 'Wallet connected' : 'Connect wallet'}</button>{link ? <button type="button" className="war-secondary" onClick={() => void navigator.clipboard?.writeText(link)}>Copy recruiter link</button> : null}</div>{error ? <div className="war-alert">{error}</div> : null}{notice ? <div className="war-success">{notice}</div> : null}</div>
          <aside className="war-status-card">{loading ? <p>Loading recruiter rewards...</p> : recruiter ? <>{recruiter.imageUrl ? <img src={recruiter.imageUrl} alt="" style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', marginBottom: 12 }} /> : null}<div className="war-status-card__label">Recruiter</div><div className="war-status-card__title">{recruiter.name || recruiter.code || shortWallet(recruiter.wallet)}</div><p>{shortWallet(recruiter.wallet)} - Code {recruiter.code || '-'}</p><div className="war-checklist"><span className={recruiter.status === 'active' ? 'war-checklist__done' : ''}>Status: {recruiter.status || 'pending'}</span><span>{data?.squad?.totalMembers || 0} squad members</span><span>{data?.squad?.both || 0} Both role</span><span>{data?.squad?.legacyUnknown || 0} Legacy</span></div></> : <><div className="war-status-card__label">Recruiter</div><div className="war-status-card__title">You are not a recruiter yet.</div><p>Connect your wallet or apply to become a recruiter.</p><Link to="/recruiter/apply" className="war-secondary">Apply to become a recruiter</Link></>}</aside>
        </section>
        {recruiter ? <><section className="war-stats" aria-label="Recruiter earnings"><RewardMetricCard label="Pending" value={`${earnings?.pending || '0'} ${earnings?.currency || ''}`.trim()} /><RewardMetricCard label="Claimable" value={`${earnings?.claimable || data?.claim?.claimableAmount || '0'} ${earnings?.currency || ''}`.trim()} /><RewardMetricCard label="Claimed Lifetime" value={`${earnings?.claimedLifetime || '0'} ${earnings?.currency || ''}`.trim()} /><RewardMetricCard label="Epoch Ends" value={formatDate(data?.epoch?.endsAt)} help={String(data?.epoch?.id || '')} /></section><section className="war-two-col"><WeeklyClaimButton label="Claim Weekly Recruiter Rewards" claim={data?.claim} walletConnected={Boolean(wallet)} onClaim={claimRecruiterRewards} /><section className="war-panel war-panel--tight"><div className="war-section-head"><div><div className="war-kicker">Claim Status</div><h2>{data?.claim?.canClaim ? 'Claim available' : data?.claim?.disabledReason || 'Claim unavailable'}</h2></div><EpochStatusBadge epoch={data?.epoch} /></div><div className="review-list"><span><strong>Claimable</strong><em>{data?.claim?.claimableAmount || '0'} {earnings?.currency || ''}</em></span><span><strong>Already claimed</strong><em>{data?.claim?.alreadyClaimed ? 'Yes' : 'No'}</em></span><span><strong>Current epoch</strong><em>{String(data?.epoch?.id || '-')}</em></span><span><strong>Recruiter status</strong><em>{recruiter.status || 'pending'}</em></span></div></section></section><SquadMembersTable members={members} /></> : null}
      </main>
    </div>
  )
}

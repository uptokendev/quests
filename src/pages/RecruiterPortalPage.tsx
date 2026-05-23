import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { connectWallet } from '../lib/wallet'
import './WarMissionsPage.css'

type QuestStatus =
  | 'ready'
  | 'pending'
  | 'review'
  | 'locked'
  | 'verified'
  | 'started'
  | 'rejected'
  | 'revoked'
  | 'expired'

type WarProfile = {
  id: string
  walletAddress: string
  displayName: string | null
  role: 'user' | 'recruiter' | 'admin'
  xpTotal: number
  completedQuestSlugs: string[]
  dailyProgress?: {
    streakCount: number
  }
}

type ApiQuest = {
  slug: string
  title: string
  description: string | null
  xpReward: number
  verificationType: string
  status: QuestStatus | null
}

type ApiCategory = {
  slug: string
  title: string
  description: string | null
  quests: ApiQuest[]
}

type WarMissionsResponse = {
  ok?: boolean
  error?: string
  profile?: WarProfile | null
  categories?: ApiCategory[]
}

function shorten(value: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : ''
}

function xpLabel(value: number) {
  return `${Number(value || 0).toLocaleString()} XP`
}

export default function RecruiterPortalPage() {
  const [profile, setProfile] = useState<WarProfile | null>(null)
  const [reinforcements, setReinforcements] = useState<ApiCategory | null>(null)
  const [loading, setLoading] = useState(true)
  const [authing, setAuthing] = useState(false)
  const [error, setError] = useState('')

  const loadState = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/wm-quests-list', { credentials: 'same-origin', cache: 'no-store' })
      const data = (await response.json().catch(() => ({}))) as WarMissionsResponse
      if (!response.ok || !data?.ok) throw new Error(data.error || 'Recruiter portal data is not available yet.')
      setProfile(data.profile || null)
      setReinforcements(data.categories?.find((category) => category.slug === 'reinforcements') || null)
    } catch (err) {
      setProfile(null)
      setReinforcements(null)
      setError(err instanceof Error ? err.message : 'Recruiter portal data is not available yet.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadState()
  }, [])

  const signIn = async () => {
    setAuthing(true)
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
      await loadState()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet sign-in failed.')
    } finally {
      setAuthing(false)
    }
  }

  const approvedRole = profile?.role === 'recruiter' || profile?.role === 'admin'
  const applicationQuest = useMemo(
    () => reinforcements?.quests.find((quest) => quest.verificationType === 'recruiter_application_submitted') || null,
    [reinforcements],
  )
  const approvedQuest = useMemo(
    () => reinforcements?.quests.find((quest) => /accepted/i.test(quest.title)) || null,
    [reinforcements],
  )
  const referralMilestones = useMemo(
    () => (reinforcements?.quests || []).filter((quest) => !['recruiter_application_submitted'].includes(quest.verificationType)),
    [reinforcements],
  )

  const stats = [
    { label: 'Role', value: profile ? profile.role : 'guest', help: approvedRole ? 'Recruiter lane unlocked' : 'Pending approval' },
    { label: 'Total XP', value: profile ? profile.xpTotal.toLocaleString() : '0', help: 'War Missions ledger' },
    { label: 'Daily streak', value: profile?.dailyProgress ? String(profile.dailyProgress.streakCount) : '0', help: 'Warpath continuity' },
    { label: 'Completed quests', value: profile ? String(profile.completedQuestSlugs.length) : '0', help: 'Across all mission lanes' },
  ]

  return (
    <div className="war-missions-page">
      <div className="war-missions-bg" aria-hidden="true" />
      <div className="war-missions-overlay" aria-hidden="true" />
      <header className="war-missions-top">
        <Link to="/" className="war-missions-brand" aria-label="MemeWarzone War Missions home"><img src="/logo.png" alt="MemeWarzone" /></Link>
        <nav className="war-missions-nav" aria-label="Recruiter portal navigation">
          <Link to="/missions">Missions</Link>
          <Link to="/missions/reinforcements">Reinforcements</Link>
          <Link to="/recruiter/apply">Apply</Link>
        </nav>
      </header>

      <main className="war-missions-shell">
        <section className="war-hero">
          <div className="war-hero-copy">
            <div className="war-kicker">Command Center</div>
            <h1>Recruiter Portal</h1>
            <p>Track recruiter readiness, watch approval status, and keep the reinforcement milestones visible without leaving the quest app.</p>
            <div className="war-hero-actions">
              <button type="button" className="war-primary" onClick={() => void signIn()} disabled={authing}>
                {authing ? 'Waiting for signature...' : profile ? 'Wallet connected' : 'Connect wallet'}
              </button>
              <Link to={approvedRole ? '/profile/squad' : '/recruiter/apply'} className="war-secondary">
                {approvedRole ? 'Open squad view' : 'Finish application'}
              </Link>
            </div>
            {error ? <div className="war-alert">{error}</div> : null}
          </div>

          <aside className="war-status-card">
            <div className="war-status-card__label">Current state</div>
            <div className="war-status-card__title">
              {!profile ? 'Wallet required' : approvedRole ? 'Recruiter active' : applicationQuest?.status === 'review' ? 'Awaiting approval' : 'Apply to continue'}
            </div>
            <p>
              {!profile
                ? 'Connect the same wallet you use for War Missions so recruiter status follows the right identity.'
                : `Wallet ${shorten(profile.walletAddress)} is the source of truth for recruiter progress.`}
            </p>
            <div className="war-checklist">
              <span className={profile ? 'war-checklist__done' : ''}>Wallet identity</span>
              <span className={applicationQuest?.status === 'verified' || applicationQuest?.status === 'review' ? 'war-checklist__done' : ''}>Application filed</span>
              <span className={approvedRole || approvedQuest?.status === 'verified' ? 'war-checklist__done' : ''}>Approved recruiter</span>
              <span>Verified recruits</span>
            </div>
          </aside>
        </section>

        <section className="war-stats" aria-label="Recruiter portal stats">
          {stats.map((stat) => (
            <div className="war-stat" key={stat.label}>
              <div className="war-stat__label">{stat.label}</div>
              <div className="war-stat__value">{stat.value}</div>
              <div className="war-stat__help">{stat.help}</div>
            </div>
          ))}
        </section>

        <section className="war-two-col">
          <section className="war-panel">
            <div className="war-section-head">
              <div>
                <div className="war-kicker">Approval lane</div>
                <h2>Recruiter checklist</h2>
              </div>
              <p>These are the core recruiter steps already reflected by the live mission response.</p>
            </div>
            <div className="quest-list">
              {reinforcements?.quests?.length ? reinforcements.quests.slice(0, 3).map((quest) => (
                <div className="quest-row" key={quest.slug}>
                  <div>
                    <div className="quest-row__title">{quest.title}</div>
                    <div className="quest-row__text">{quest.description || 'Recruiter mission step.'}</div>
                  </div>
                  <div className="quest-row__meta">
                    <strong>{xpLabel(quest.xpReward)}</strong>
                    <span className={`quest-status quest-status--${quest.status || 'locked'}`}>{quest.status || 'locked'}</span>
                  </div>
                </div>
              )) : <div className="leaderboard-empty">Connect your wallet to pull recruiter progress from War Missions.</div>}
            </div>
          </section>

          <section className="war-panel">
            <div className="war-section-head">
              <div>
                <div className="war-kicker">Squad growth</div>
                <h2>Referral milestones</h2>
              </div>
              <p>Verified recruits are what move the recruiter questline forward.</p>
            </div>
            <div className="war-admin-list">
              {referralMilestones.length > 0 ? referralMilestones.map((quest) => (
                <article className="war-admin-row" key={quest.slug}>
                  <div>
                    <strong>{quest.title}</strong>
                    <span>{quest.description || 'Recruiter squad objective.'}</span>
                  </div>
                  <div className="war-admin-row__actions">
                    <strong>{xpLabel(quest.xpReward)}</strong>
                    <span className={`quest-status quest-status--${quest.status || 'locked'}`}>{quest.status || 'locked'}</span>
                  </div>
                </article>
              )) : <div className="leaderboard-empty">Referral milestones will populate here once the reinforcement quest feed is available.</div>}
            </div>
          </section>
        </section>
      </main>
    </div>
  )
}

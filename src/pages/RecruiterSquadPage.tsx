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

const DEFAULT_COMMAND_CENTER_URL = 'https://memewarzonefrontend-production.up.railway.app/command/recruiter'
const commandCenterUrl = String(import.meta.env.VITE_COMMAND_CENTER_RECRUITER_URL || DEFAULT_COMMAND_CENTER_URL).trim()
const START_HERE_SLUGS = new Set(['intercept-global-comms', 'access-underground-comms', 'report-to-base-camp', 'take-the-oath'])

function shorten(value: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : ''
}

function xpLabel(value: number) {
  return `${Number(value || 0).toLocaleString()} XP`
}

function statusText(status: QuestStatus | null | undefined) {
  return status || 'locked'
}

export default function RecruiterSquadPage() {
  const [profile, setProfile] = useState<WarProfile | null>(null)
  const [reinforcements, setReinforcements] = useState<ApiCategory | null>(null)
  const [authing, setAuthing] = useState(false)
  const [error, setError] = useState('')

  const loadState = async () => {
    setError('')
    try {
      const response = await fetch('/api/wm-quests-list', { credentials: 'same-origin', cache: 'no-store' })
      const data = (await response.json().catch(() => ({}))) as WarMissionsResponse
      if (!response.ok || !data?.ok) throw new Error(data.error || 'Squad data is not available yet.')
      setProfile(data.profile || null)
      setReinforcements(data.categories?.find((category) => category.slug === 'reinforcements') || null)
    } catch (err) {
      setProfile(null)
      setReinforcements(null)
      setError(err instanceof Error ? err.message : 'Squad data is not available yet.')
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
  const referralMilestones = useMemo(
    () => (reinforcements?.quests || []).filter((quest) => quest.verificationType !== 'recruiter_application_submitted'),
    [reinforcements],
  )
  const completedMilestones = useMemo(
    () => referralMilestones.filter((quest) => quest.status === 'verified').length,
    [referralMilestones],
  )
  const nextMilestone = useMemo(
    () => referralMilestones.find((quest) => quest.status !== 'verified') || null,
    [referralMilestones],
  )
  const onboardingComplete = useMemo(() => {
    if (!profile) return 0
    return profile.completedQuestSlugs.filter((slug) => START_HERE_SLUGS.has(slug)).length
  }, [profile])

  const stats = [
    { label: 'Role', value: profile ? profile.role : 'guest', help: approvedRole ? 'Recruiter tools unlocked' : 'Approval required' },
    { label: 'XP', value: profile ? profile.xpTotal.toLocaleString() : '0', help: 'War Missions ledger' },
    { label: 'Milestones cleared', value: String(completedMilestones), help: `${referralMilestones.length} reinforcement steps tracked` },
    { label: 'Start Here done', value: String(onboardingComplete), help: 'Your own onboarding progress' },
  ]

  return (
    <div className="war-missions-page">
      <div className="war-missions-bg" aria-hidden="true" />
      <div className="war-missions-overlay" aria-hidden="true" />
      <header className="war-missions-top">
        <Link to="/" className="war-missions-brand" aria-label="MemeWarzone War Missions home"><img src="/logo.png" alt="MemeWarzone" /></Link>
        <nav className="war-missions-nav" aria-label="Recruiter squad navigation">
          <Link to="/missions">Missions</Link>
          <Link to="/recruiter/portal">Recruiter Portal</Link>
          <Link to="/missions/reinforcements">Reinforcements</Link>
        </nav>
      </header>

      <main className="war-missions-shell">
        <section className="war-hero">
          <div className="war-hero-copy">
            <div className="war-kicker">Recruiter Operations</div>
            <h1>Squad View</h1>
            <p>Use this screen to track reinforcement milestones inside War Missions, then jump into Command Center for referral links, recruit attribution, and live squad management.</p>
            <div className="war-hero-actions">
              <button type="button" className="war-primary" onClick={() => void signIn()} disabled={authing}>
                {authing ? 'Waiting for signature...' : profile ? 'Wallet connected' : 'Connect wallet'}
              </button>
              <a href={commandCenterUrl} target="_blank" rel="noreferrer" className="war-secondary">Open Command Center</a>
              <Link to="/recruiter/portal" className="war-secondary">Back to portal</Link>
            </div>
            {error ? <div className="war-alert">{error}</div> : null}
          </div>

          <aside className="war-status-card">
            <div className="war-status-card__label">Squad readiness</div>
            <div className="war-status-card__title">
              {!profile ? 'Wallet required' : approvedRole ? 'Recruiter lane active' : applicationQuest?.status === 'review' ? 'Approval pending' : 'Apply first'}
            </div>
            <p>
              {!profile
                ? 'Connect your wallet to sync recruiter identity and reinforcement milestones.'
                : `Wallet ${shorten(profile.walletAddress)} is currently ${profile.role}.`}
            </p>
            <div className="war-checklist">
              <span className={profile ? 'war-checklist__done' : ''}><strong>Wallet linked</strong><em>Required for all recruiter sync</em></span>
              <span className={applicationQuest?.status === 'review' || applicationQuest?.status === 'verified' ? 'war-checklist__done' : ''}><strong>Application tracked</strong><em>Visible in recruiter quest lane</em></span>
              <span className={approvedRole ? 'war-checklist__done' : ''}><strong>Recruiter approved</strong><em>Unlocks referral link assignment</em></span>
              <span className={approvedRole ? 'war-checklist__done' : ''}><strong>Command Center access</strong><em>Referral links and roster live there</em></span>
            </div>
          </aside>
        </section>

        <section className="war-stats" aria-label="Recruiter squad stats">
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
                <div className="war-kicker">Next target</div>
                <h2>Milestone focus</h2>
              </div>
              <p>War Missions shows the quest ladder and XP state here, while recruit-by-recruit attribution continues in the backend and Command Center.</p>
            </div>
            {nextMilestone ? (
              <div className="quest-row">
                <div>
                  <div className="quest-row__title">{nextMilestone.title}</div>
                  <div className="quest-row__text">{nextMilestone.description || 'Next recruiter milestone.'}</div>
                </div>
                <div className="quest-row__meta">
                  <strong>{xpLabel(nextMilestone.xpReward)}</strong>
                  <span className={`quest-status quest-status--${statusText(nextMilestone.status)}`}>{statusText(nextMilestone.status)}</span>
                </div>
              </div>
            ) : (
              <div className="war-success">All current reinforcement milestones in this quest feed are already verified.</div>
            )}
            <div className="review-list" style={{ marginTop: 16 }}>
              <span><strong>Referral links</strong><em>Assigned after recruiter approval</em></span>
              <span><strong>Verified recruits</strong><em>Count only after required onboarding is completed</em></span>
              <span><strong>Start Here sync</strong><em>Recruit validation finalizes when onboarding clears</em></span>
              <span><strong>Milestone XP</strong><em>Awards continue back into your War Missions ledger</em></span>
            </div>
          </section>

          <section className="war-panel">
            <div className="war-section-head">
              <div>
                <div className="war-kicker">Milestone ladder</div>
                <h2>Recruiter progression</h2>
              </div>
              <p>These are the reinforcement quests currently returned for your wallet.</p>
            </div>
            <div className="quest-list">
              {referralMilestones.length ? referralMilestones.map((quest) => (
                <div className="quest-row" key={quest.slug}>
                  <div>
                    <div className="quest-row__title">{quest.title}</div>
                    <div className="quest-row__text">{quest.description || 'Recruiter milestone.'}</div>
                  </div>
                  <div className="quest-row__meta">
                    <strong>{xpLabel(quest.xpReward)}</strong>
                    <span className={`quest-status quest-status--${statusText(quest.status)}`}>{statusText(quest.status)}</span>
                  </div>
                </div>
              )) : <div className="leaderboard-empty">No reinforcement milestones were returned yet.</div>}
            </div>
          </section>
        </section>
      </main>
    </div>
  )
}

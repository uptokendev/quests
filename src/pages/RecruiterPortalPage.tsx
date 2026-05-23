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

type RecruiterQuestState = 'not_started' | 'pending_review' | 'approved' | 'rejected'

type RecruiterStatusPayload = {
  status: RecruiterQuestState
  reason: string | null
  source: string
  checkedAt: string
}

type RecruiterStatusResponse = {
  ok?: boolean
  error?: string
  recruiterStatus?: RecruiterStatusPayload
}

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

function shorten(value: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : ''
}

function xpLabel(value: number) {
  return `${Number(value || 0).toLocaleString()} XP`
}

export default function RecruiterPortalPage() {
  const [profile, setProfile] = useState<WarProfile | null>(null)
  const [reinforcements, setReinforcements] = useState<ApiCategory | null>(null)
  const [recruiterStatus, setRecruiterStatus] = useState<RecruiterStatusPayload | null>(null)
  const [authing, setAuthing] = useState(false)
  const [error, setError] = useState('')

  const loadRecruiterStatus = async () => {
    const response = await fetch('/api/wm-recruiter-status', { credentials: 'same-origin', cache: 'no-store' })
    const data = (await response.json().catch(() => ({}))) as RecruiterStatusResponse
    if (!response.ok || !data?.ok || !data.recruiterStatus) throw new Error(data.error || 'Recruiter status is not available yet.')
    setRecruiterStatus(data.recruiterStatus)
  }

  const loadState = async () => {
    setError('')
    try {
      const response = await fetch('/api/wm-quests-list', { credentials: 'same-origin', cache: 'no-store' })
      const data = (await response.json().catch(() => ({}))) as WarMissionsResponse
      if (!response.ok || !data?.ok) throw new Error(data.error || 'Recruiter portal data is not available yet.')
      setProfile(data.profile || null)
      setReinforcements(data.categories?.find((category) => category.slug === 'reinforcements') || null)
      if (data.profile) await loadRecruiterStatus()
      else setRecruiterStatus(null)
    } catch (err) {
      setProfile(null)
      setReinforcements(null)
      setRecruiterStatus(null)
      setError(err instanceof Error ? err.message : 'Recruiter portal data is not available yet.')
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
  const recruiterApproved = approvedRole || recruiterStatus?.status === 'approved'
  const approvedQuest = useMemo(
    () => reinforcements?.quests.find((quest) => quest.verificationType === 'recruiter_application_accepted') || null,
    [reinforcements],
  )
  const referralMilestones = useMemo(
    () => (reinforcements?.quests || []).filter((quest) => !['recruiter_application_submitted', 'recruiter_application_accepted'].includes(quest.verificationType)),
    [reinforcements],
  )

  const stats = [
    { label: 'Role', value: profile ? profile.role : 'guest', help: recruiterApproved ? 'Recruiter lane unlocked' : 'Pending approval' },
    { label: 'Total XP', value: profile ? profile.xpTotal.toLocaleString() : '0', help: 'War Missions ledger' },
    { label: 'Daily streak', value: profile?.dailyProgress ? String(profile.dailyProgress.streakCount) : '0', help: 'Warpath continuity' },
    { label: 'Completed quests', value: profile ? String(profile.completedQuestSlugs.length) : '0', help: 'Across all mission lanes' },
  ]

  const statusTitle = !profile
    ? 'Wallet required'
    : recruiterApproved
      ? approvedRole ? 'Recruiter active' : 'Approved in Command Center'
      : recruiterStatus?.status === 'pending_review'
        ? 'Awaiting approval'
        : recruiterStatus?.status === 'rejected'
          ? 'Needs update'
          : 'Apply to continue'

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
            <p>Track recruiter readiness in War Missions, then jump into Command Center for signup, referral links, recruiter management, and live squad operations.</p>
            <div className="war-hero-actions">
              <button type="button" className="war-primary" onClick={() => void signIn()} disabled={authing}>
                {authing ? 'Waiting for signature...' : profile ? 'Wallet connected' : 'Connect wallet'}
              </button>
              {approvedRole ? <Link to="/profile/squad" className="war-secondary">Open squad view</Link> : <Link to="/recruiter/apply" className="war-secondary">Finish signup</Link>}
              <a href={commandCenterUrl} target="_blank" rel="noreferrer" className="war-secondary">Open Command Center</a>
            </div>
            {error ? <div className="war-alert">{error}</div> : null}
          </div>

          <aside className="war-status-card">
            <div className="war-status-card__label">Current state</div>
            <div className="war-status-card__title">{statusTitle}</div>
            <p>
              {!profile
                ? 'Connect the same wallet you use for War Missions so recruiter status follows the right identity.'
                : `Wallet ${shorten(profile.walletAddress)} is the source of truth for recruiter progress.`}
            </p>
            <div className="war-checklist">
              <span className={profile ? 'war-checklist__done' : ''}>Wallet identity</span>
              <span className={recruiterStatus && recruiterStatus.status !== 'not_started' ? 'war-checklist__done' : ''}>Command Center signup</span>
              <span className={recruiterApproved || approvedQuest?.status === 'verified' ? 'war-checklist__done' : ''}>Approved recruiter</span>
              <span className={approvedRole ? 'war-checklist__done' : ''}>Referral link management</span>
            </div>
            {recruiterStatus?.reason ? <div className="war-alert">{recruiterStatus.reason}</div> : null}
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
              <p>Command Center handles signup decisions now. War Missions reads that status back and unlocks the recruiter quest lane after approval is confirmed.</p>
            </div>
            <div className="quest-list">
              {reinforcements?.quests?.length ? reinforcements.quests
                .filter((quest) => quest.verificationType !== 'recruiter_application_submitted')
                .slice(0, 3)
                .map((quest) => (
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
                <div className="war-kicker">Milestones</div>
                <h2>Referral ladder</h2>
              </div>
              <p>These milestones are already present in the reinforcement category and stay locked until approval is confirmed inside War Missions.</p>
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
                    <span className={`quest-status quest-status--${quest.status || 'locked'}`}>{quest.status || 'locked'}</span>
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

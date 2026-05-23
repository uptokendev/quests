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

export default function RecruiterApplyPage() {
  const [profile, setProfile] = useState<WarProfile | null>(null)
  const [reinforcementQuests, setReinforcementQuests] = useState<ApiQuest[]>([])
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
      if (!response.ok || !data?.ok) throw new Error(data.error || 'Recruiter data is not available yet.')
      setProfile(data.profile || null)
      const reinforcements = data.categories?.find((category) => category.slug === 'reinforcements')
      setReinforcementQuests(reinforcements?.quests || [])
      if (data.profile) await loadRecruiterStatus()
      else setRecruiterStatus(null)
    } catch (err) {
      setProfile(null)
      setReinforcementQuests([])
      setRecruiterStatus(null)
      setError(err instanceof Error ? err.message : 'Recruiter data is not available yet.')
    }
  }

  useEffect(() => {
    void loadState()
  }, [])

  const alreadyApproved = profile?.role === 'recruiter' || profile?.role === 'admin' || recruiterStatus?.status === 'approved'
  const recruiterQuest = useMemo(
    () => reinforcementQuests.find((quest) => quest.verificationType === 'recruiter_application_accepted') || null,
    [reinforcementQuests],
  )

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

  const statusTitle = alreadyApproved
    ? 'Approved recruiter'
    : recruiterStatus?.status === 'pending_review'
      ? 'Application in review'
      : recruiterStatus?.status === 'rejected'
        ? 'Needs update'
        : 'Command Center required'

  return (
    <div className="war-missions-page">
      <div className="war-missions-bg" aria-hidden="true" />
      <div className="war-missions-overlay" aria-hidden="true" />
      <header className="war-missions-top">
        <Link to="/" className="war-missions-brand" aria-label="MemeWarzone War Missions home"><img src="/logo.png" alt="MemeWarzone" /></Link>
        <nav className="war-missions-nav" aria-label="Recruiter navigation">
          <Link to="/missions">Missions</Link>
          <Link to="/missions/reinforcements">Reinforcements</Link>
          <Link to="/recruiter/portal">Recruiter Portal</Link>
        </nav>
      </header>

      <main className="war-missions-shell">
        <section className="war-hero">
          <div className="war-hero-copy">
            <div className="war-kicker">Operation: Reinforcements</div>
            <h1>Recruiter Apply</h1>
            <p>Recruiter signup now happens only in the MemeWarzone Command Center. War Missions is the place to come back, check status, and unlock recruiter XP and milestones once approval lands.</p>
            <div className="war-hero-actions">
              <button type="button" className="war-primary" onClick={() => void signIn()} disabled={authing}>
                {authing ? 'Waiting for signature...' : profile ? 'Wallet connected' : 'Connect wallet'}
              </button>
              <a href={commandCenterUrl} target="_blank" rel="noreferrer" className="war-secondary">
                Open Command Center
              </a>
              {alreadyApproved ? <Link to="/profile/squad" className="war-secondary">Open squad view</Link> : null}
            </div>
            {error ? <div className="war-alert">{error}</div> : null}
          </div>

          <aside className="war-status-card">
            <div className="war-status-card__label">Recruiter status</div>
            <div className="war-status-card__title">{statusTitle}</div>
            <p>
              {profile
                ? `Wallet ${shorten(profile.walletAddress)} is connected.`
                : 'Connect your wallet first so recruiter status follows the same War Missions identity.'}
            </p>
            <div className="war-checklist">
              <span className={profile ? 'war-checklist__done' : ''}>Wallet identity</span>
              <span className={recruiterStatus && recruiterStatus.status !== 'not_started' ? 'war-checklist__done' : ''}>Command Center signup</span>
              <span className={alreadyApproved ? 'war-checklist__done' : ''}>Approved recruiter</span>
              <span className={alreadyApproved ? 'war-checklist__done' : ''}>Referral link + roster</span>
            </div>
            {recruiterStatus?.reason ? <div className="war-alert">{recruiterStatus.reason}</div> : null}
          </aside>
        </section>

        <section className="war-two-col">
          <section className="war-panel">
            <div className="war-section-head">
              <div>
                <div className="war-kicker">Current flow</div>
                <h2>What happens next</h2>
              </div>
              <p>This repo now keeps one recruiter source of truth: Command Center handles intake, and War Missions checks status back in from there.</p>
            </div>
            <div className="review-list">
              <span><strong>1. Connect wallet</strong><em>Use the same wallet as War Missions</em></span>
              <span><strong>2. Open Command Center</strong><em>Complete signup there instead of inside quests</em></span>
              <span><strong>3. Wait for approval</strong><em>{recruiterStatus?.status === 'rejected' ? 'Update the application there, then recheck here' : 'Come back here to recheck after review'}</em></span>
              <span><strong>4. Unlock recruiter quests</strong><em>Approved status unlocks recruiter XP and milestone progress</em></span>
            </div>
          </section>

          <section className="war-panel war-panel--tight">
            <div className="war-section-head">
              <div>
                <div className="war-kicker">Quest context</div>
                <h2>Recruiter milestones</h2>
              </div>
              <p>These reinforcement quests remain the progression backbone after your recruiter approval is confirmed inside War Missions.</p>
            </div>
            <div className="quest-list">
              {reinforcementQuests.length > 0 ? reinforcementQuests
                .filter((quest) => quest.verificationType !== 'recruiter_application_submitted')
                .map((quest) => (
                  <div className="quest-row" key={quest.slug}>
                    <div>
                      <div className="quest-row__title">{quest.title}</div>
                      <div className="quest-row__text">{quest.description || 'Recruiter progression milestone.'}</div>
                    </div>
                    <div className="quest-row__meta">
                      <strong>{xpLabel(quest.xpReward)}</strong>
                      <span className={`quest-status quest-status--${quest.status || 'locked'}`}>{quest.status || 'locked'}</span>
                    </div>
                  </div>
                )) : <div className="leaderboard-empty">Recruiter mission data will appear here after the quest API responds.</div>}
            </div>
          </section>
        </section>
      </main>
    </div>
  )
}

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { connectWallet } from '../lib/wallet'
import './WarMissionsPage.css'

type RecruiterApplyResponse = {
  ok?: boolean
  error?: string
}

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

type FormState = {
  xUsername: string
  telegramUsername: string
  discordUsername: string
  expectedRecruits: string
  motivation: string
}

const initialForm: FormState = {
  xUsername: '',
  telegramUsername: '',
  discordUsername: '',
  expectedRecruits: '',
  motivation: '',
}

function shorten(value: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : ''
}

function xpLabel(value: number) {
  return `${Number(value || 0).toLocaleString()} XP`
}

export default function RecruiterApplyPage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<WarProfile | null>(null)
  const [reinforcementQuests, setReinforcementQuests] = useState<ApiQuest[]>([])
  const [form, setForm] = useState<FormState>(initialForm)
  const [loading, setLoading] = useState(true)
  const [authing, setAuthing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadState = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/wm-quests-list', { credentials: 'same-origin', cache: 'no-store' })
      const data = (await response.json().catch(() => ({}))) as WarMissionsResponse
      if (!response.ok || !data?.ok) throw new Error(data.error || 'Recruiter data is not available yet.')
      setProfile(data.profile || null)
      const reinforcements = data.categories?.find((category) => category.slug === 'reinforcements')
      setReinforcementQuests(reinforcements?.quests || [])
    } catch (err) {
      setProfile(null)
      setReinforcementQuests([])
      setError(err instanceof Error ? err.message : 'Recruiter data is not available yet.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadState()
  }, [])

  const alreadyApproved = profile?.role === 'recruiter' || profile?.role === 'admin'
  const recruiterQuest = useMemo(
    () => reinforcementQuests.find((quest) => quest.verificationType === 'recruiter_application_submitted') || null,
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

  const submitApplication = async (event: FormEvent) => {
    event.preventDefault()
    if (!profile) {
      await signIn()
      return
    }

    setSubmitting(true)
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/wm-recruiter-apply', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xUsername: form.xUsername.trim(),
          telegramUsername: form.telegramUsername.trim(),
          discordUsername: form.discordUsername.trim(),
          expectedRecruits: form.expectedRecruits ? Number(form.expectedRecruits) : undefined,
          motivation: form.motivation.trim(),
        }),
      })
      const data = (await response.json().catch(() => ({}))) as RecruiterApplyResponse
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Recruiter application failed.')
      setForm(initialForm)
      setMessage('Recruiter application submitted. Command review will pick it up from the admin queue.')
      await loadState()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recruiter application failed.')
    } finally {
      setSubmitting(false)
    }
  }

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
            <p>Submit one clean recruiter application inside War Missions. Once approved, your wallet can move into the recruiter lane and start building verified squads.</p>
            <div className="war-hero-actions">
              <button type="button" className="war-primary" onClick={() => void signIn()} disabled={authing}>
                {authing ? 'Waiting for signature...' : profile ? 'Wallet connected' : 'Connect wallet'}
              </button>
              <button type="button" className="war-secondary" onClick={() => navigate('/recruiter/portal')}>
                Open portal
              </button>
            </div>
            {error ? <div className="war-alert">{error}</div> : null}
            {message ? <div className="war-success">{message}</div> : null}
          </div>

          <aside className="war-status-card">
            <div className="war-status-card__label">Recruiter status</div>
            <div className="war-status-card__title">
              {alreadyApproved ? 'Approved recruiter' : recruiterQuest?.status === 'review' ? 'Application in review' : 'Application required'}
            </div>
            <p>
              {profile
                ? `Wallet ${shorten(profile.walletAddress)} is connected.`
                : 'Connect your wallet first so the recruiter application can attach to your War Missions identity.'}
            </p>
            <div className="war-checklist">
              <span className={profile ? 'war-checklist__done' : ''}>Wallet identity</span>
              <span className={recruiterQuest?.status === 'verified' ? 'war-checklist__done' : ''}>Application approval</span>
              <span>Referral milestones</span>
              <span>Verified recruits only</span>
            </div>
          </aside>
        </section>

        <section className="war-two-col">
          <section className="war-panel">
            <div className="war-section-head">
              <div>
                <div className="war-kicker">Application form</div>
                <h2>Recruiter intake</h2>
              </div>
              <p>This form feeds the same recruiter review queue the admin console already reads.</p>
            </div>

            {alreadyApproved ? (
              <div className="war-success">This wallet already has recruiter access. Use the portal to track mission progress.</div>
            ) : null}

            <form className="war-admin-login__form" onSubmit={submitApplication}>
              <label>
                <span>X username</span>
                <input value={form.xUsername} onChange={(event) => setForm((current) => ({ ...current, xUsername: event.target.value }))} placeholder="@username" />
              </label>
              <label>
                <span>Telegram username</span>
                <input value={form.telegramUsername} onChange={(event) => setForm((current) => ({ ...current, telegramUsername: event.target.value }))} placeholder="@username" />
              </label>
              <label>
                <span>Discord username</span>
                <input value={form.discordUsername} onChange={(event) => setForm((current) => ({ ...current, discordUsername: event.target.value }))} placeholder="username" />
              </label>
              <label>
                <span>Expected recruits in first push</span>
                <input value={form.expectedRecruits} onChange={(event) => setForm((current) => ({ ...current, expectedRecruits: event.target.value }))} inputMode="numeric" placeholder="10" />
              </label>
              <label>
                <span>Why you should be approved</span>
                <textarea value={form.motivation} onChange={(event) => setForm((current) => ({ ...current, motivation: event.target.value }))} rows={6} />
              </label>
              <div className="war-admin-actions">
                <button className="war-primary" type="submit" disabled={submitting || alreadyApproved || loading}>
                  {submitting ? 'Submitting...' : 'Submit recruiter application'}
                </button>
                <Link className="war-secondary" to="/missions/reinforcements">Back to reinforcements</Link>
              </div>
            </form>
          </section>

          <section className="war-panel war-panel--tight">
            <div className="war-section-head">
              <div>
                <div className="war-kicker">Quest context</div>
                <h2>Recruiter milestones</h2>
              </div>
              <p>These are the reinforcement steps already wired into War Missions.</p>
            </div>
            <div className="quest-list">
              {reinforcementQuests.length > 0 ? reinforcementQuests.map((quest) => (
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

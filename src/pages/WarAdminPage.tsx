import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import './WarMissionsPage.css'

type AdminSession = {
  username: string
  role: string
}

type AdminSummary = {
  usersTotal: number
  adminsTotal: number
  bannedTotal: number
  completionsTotal: number
  completionsVerified: number
  completionsOpen: number
  completionsRejected: number
  socialAccountsTotal: number
  telegramAccountsTotal: number
  discordAccountsTotal: number
  xAccountsTotal: number
  notificationsOpen: number
  activeXpTotal: number
}

type AdminUser = {
  id: string
  walletAddress: string
  displayName: string | null
  role: string
  isBanned: boolean
  riskScore: number
  completionCount: number
  verifiedCount: number
  socialCount: number
  activeXp: number
  createdAt: string | null
  updatedAt: string | null
}

type AdminCompletion = {
  id: string
  status: string
  submittedValue: string | null
  verificationPayload: Record<string, unknown>
  rejectionReason: string | null
  verifiedAt: string | null
  createdAt: string | null
  updatedAt: string | null
  user: {
    walletAddress: string
    displayName: string | null
    riskScore: number
  }
  quest: {
    slug: string
    title: string
    verificationType: string
    periodType: string | null
  }
  latestLog: {
    provider: string | null
    status: string | null
    message: string | null
    createdAt: string
  } | null
}

type SocialAccount = {
  id: string
  userId: string
  provider: string
  providerUserId: string
  username: string
  lastVerifiedAt: string | null
  createdAt: string | null
  walletAddress: string
  displayName: string | null
}

type AdminNotification = {
  id: string
  type: string
  title: string
  message: string | null
  priority: string
  status: string
  related_user_id: string | null
  related_completion_id: string | null
  related_application_id: string | null
  created_at: string
  updated_at?: string | null
}

type VerificationLog = {
  id: string
  userId: string | null
  completionId: string | null
  provider: string | null
  verificationType: string | null
  status: string | null
  message: string | null
  metadata: Record<string, unknown>
  createdAt: string | null
  walletAddress: string | null
}

type PrizePool = {
  id: string
  period_type: string
  reward_asset: string | null
  reward_amount: number | null
  status: string
  created_at: string
  updated_at?: string | null
}

type PrizeWinner = {
  id: string
  prize_pool_id: string
  wallet_address: string | null
  rank: number | null
  reward_amount: number | null
  status: string
  created_at?: string | null
}

type AdminConsoleData = {
  ok?: boolean
  error?: string
  admin?: AdminSession
  summary?: AdminSummary
  users?: AdminUser[]
  completions?: AdminCompletion[]
  socialAccounts?: SocialAccount[]
  notifications?: AdminNotification[]
  verificationLogs?: VerificationLog[]
  prizePools?: PrizePool[]
  prizeWinners?: PrizeWinner[]
}

type QuizAnswer = {
  key: string
  text: string
}

type QuizQuestion = {
  id: string
  questTemplateId: string
  questSlug: string
  questTitle: string
  prompt: string
  answers: QuizAnswer[]
  correctAnswerKey: string
  explanation: string
  active: boolean
  displayOrder: number
  metadata: Record<string, unknown>
  createdAt: string | null
  updatedAt: string | null
}

type QuizQuestionsResponse = {
  ok?: boolean
  error?: string
  admin?: AdminSession
  questions?: QuizQuestion[]
}

type QuizDraft = {
  id: string
  questSlug: string
  prompt: string
  answerA: string
  answerB: string
  answerC: string
  answerD: string
  correctAnswerKey: string
  explanation: string
  displayOrder: string
  active: boolean
}

type TabKey = 'overview' | 'reviews' | 'users' | 'social' | 'quizzes' | 'logs' | 'notifications' | 'prizes'

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'users', label: 'Users' },
  { key: 'social', label: 'Social accounts' },
  { key: 'quizzes', label: 'Quiz bank' },
  { key: 'logs', label: 'Verification logs' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'prizes', label: 'Prizes' },
]

function shortId(value: string | null | undefined) {
  if (!value) return 'none'
  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

function shortText(value: unknown, fallback = 'none', length = 120) {
  const text = String(value || '').trim()
  if (!text) return fallback
  return text.length > length ? `${text.slice(0, length)}...` : text
}

function dateText(value: string | null | undefined) {
  if (!value) return 'none'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return String(value ?? '')
  }
}

function createEmptyQuizDraft(): QuizDraft {
  return {
    id: '',
    questSlug: '',
    prompt: '',
    answerA: '',
    answerB: '',
    answerC: '',
    answerD: '',
    correctAnswerKey: 'a',
    explanation: '',
    displayOrder: '0',
    active: true,
  }
}

function buildQuizDraft(question: QuizQuestion): QuizDraft {
  const answerMap = new Map(question.answers.map((answer) => [answer.key, answer.text]))
  return {
    id: question.id,
    questSlug: question.questSlug,
    prompt: question.prompt,
    answerA: answerMap.get('a') || '',
    answerB: answerMap.get('b') || '',
    answerC: answerMap.get('c') || '',
    answerD: answerMap.get('d') || '',
    correctAnswerKey: question.correctAnswerKey || 'a',
    explanation: question.explanation || '',
    displayOrder: String(question.displayOrder || 0),
    active: Boolean(question.active),
  }
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

function StatusPill({ value }: { value: string }) {
  return <span className={`quest-status quest-status--${String(value || '').toLowerCase()}`}>{value || 'unknown'}</span>
}

export default function WarAdminPage() {
  const [admin, setAdmin] = useState<AdminSession | null>(null)
  const [data, setData] = useState<AdminConsoleData | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [expandedId, setExpandedId] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([])
  const [quizLoaded, setQuizLoaded] = useState(false)
  const [quizQuestSlug, setQuizQuestSlug] = useState('')
  const [quizIncludeInactive, setQuizIncludeInactive] = useState(false)
  const [quizDraft, setQuizDraft] = useState<QuizDraft>(() => createEmptyQuizDraft())

  const loadSession = async () => {
    try {
      const response = await fetch('/api/wm-admin-auth', { credentials: 'same-origin', cache: 'no-store' })
      const session = await response.json().catch(() => ({}))
      if (response.ok && session?.authenticated && session.admin) {
        setAdmin(session.admin)
        await loadData()
      } else {
        setAdmin(null)
      }
    } catch {
      setAdmin(null)
    }
  }

  const loadData = async () => {
    setBusy('load')
    setError('')
    try {
      const response = await fetch('/api/wm-admin-console-data?limit=100', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const payload = (await response.json().catch(() => ({}))) as AdminConsoleData
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Admin data unavailable.')
      setData(payload)
      if (payload.admin) setAdmin(payload.admin)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin data unavailable.')
    } finally {
      setBusy('')
    }
  }

  const loadQuizQuestions = async () => {
    setBusy('load-quizzes')
    setError('')
    try {
      const params = new URLSearchParams()
      if (quizQuestSlug.trim()) params.set('questSlug', quizQuestSlug.trim())
      if (quizIncludeInactive) params.set('includeInactive', 'true')
      const response = await fetch(`/api/wm-admin-quiz-questions${params.toString() ? `?${params.toString()}` : ''}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const payload = (await response.json().catch(() => ({}))) as QuizQuestionsResponse
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Quiz questions unavailable.')
      setQuizQuestions(payload.questions || [])
      setQuizLoaded(true)
      if (payload.admin) setAdmin(payload.admin)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quiz questions unavailable.')
    } finally {
      setBusy('')
    }
  }

  useEffect(() => {
    void loadSession()
  }, [])

  useEffect(() => {
    if (!admin || activeTab !== 'quizzes') return
    void loadQuizQuestions()
  }, [admin, activeTab, quizQuestSlug, quizIncludeInactive])

  const login = async (event: FormEvent) => {
    event.preventDefault()
    setBusy('login')
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/wm-admin-auth', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Admin login failed.')
      setAdmin(payload.admin)
      setPassword('')
      setMessage('Admin logged in.')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin login failed.')
    } finally {
      setBusy('')
    }
  }

  const logout = async () => {
    setBusy('logout')
    try {
      await fetch('/api/wm-admin-auth', { method: 'DELETE', credentials: 'same-origin' })
      setAdmin(null)
      setData(null)
      setQuizQuestions([])
      setQuizLoaded(false)
      setQuizDraft(createEmptyQuizDraft())
      setMessage('Logged out.')
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
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : `${label} failed.`)
    } finally {
      setBusy('')
    }
  }

  const reviewCompletion = (completionId: string, status: 'verified' | 'rejected') => runAction(status === 'verified' ? 'Approve completion' : 'Reject completion', async () => {
    await apiPost('/api/wm-admin-review-completion', {
      completionId,
      status,
      reason: status === 'verified' ? 'Admin approved from review dashboard' : 'Admin rejected from review dashboard',
    })
  })

  const recheckSocial = (completionId: string) => runAction('Recheck completion', async () => {
    await apiPost('/api/wm-admin-social-recheck', {
      completionId,
      reason: 'Admin recheck from review dashboard',
    })
  })

  const resolveNotification = (id: string) => runAction('Resolve notification', async () => {
    const response = await fetch('/api/wm-admin-notifications-list', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'resolved' }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Notification update failed.')
  })

  const submitQuizQuestion = async (event: FormEvent) => {
    event.preventDefault()
    setBusy('save-quiz')
    setMessage('')
    setError('')
    try {
      const answers = [
        { key: 'a', text: quizDraft.answerA.trim() },
        { key: 'b', text: quizDraft.answerB.trim() },
        { key: 'c', text: quizDraft.answerC.trim() },
        { key: 'd', text: quizDraft.answerD.trim() },
      ].filter((answer) => answer.text)

      if (!quizDraft.questSlug.trim()) throw new Error('Quest slug is required.')
      if (!quizDraft.prompt.trim()) throw new Error('Prompt is required.')
      if (answers.length < 2) throw new Error('At least two answers are required.')
      if (!answers.some((answer) => answer.key === quizDraft.correctAnswerKey)) {
        throw new Error('Correct answer must match one of the filled answers.')
      }

      const payload = {
        id: quizDraft.id || undefined,
        questSlug: quizDraft.questSlug.trim(),
        prompt: quizDraft.prompt.trim(),
        answers,
        correctAnswerKey: quizDraft.correctAnswerKey,
        explanation: quizDraft.explanation.trim(),
        displayOrder: Number(quizDraft.displayOrder || 0),
        active: quizDraft.active,
      }

      const response = await fetch('/api/wm-admin-quiz-questions', {
        method: quizDraft.id ? 'PUT' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Quiz question save failed.')

      setMessage(quizDraft.id ? 'Quiz question updated.' : 'Quiz question created.')
      setQuizDraft(createEmptyQuizDraft())
      await loadQuizQuestions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quiz question save failed.')
    } finally {
      setBusy('')
    }
  }

  const editQuizQuestion = (question: QuizQuestion) => {
    setQuizDraft(buildQuizDraft(question))
    setMessage(`Editing ${question.questSlug}.`)
    setError('')
  }

  const deactivateQuizQuestion = async (questionId: string) => {
    setBusy('deactivate-quiz')
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/wm-admin-quiz-questions', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: questionId }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Quiz question update failed.')
      setMessage('Quiz question deactivated.')
      if (quizDraft.id === questionId) setQuizDraft(createEmptyQuizDraft())
      await loadQuizQuestions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quiz question update failed.')
    } finally {
      setBusy('')
    }
  }

  const resetQuizDraft = () => {
    setQuizDraft(createEmptyQuizDraft())
    setMessage('Quiz form reset.')
    setError('')
  }

  const normalizedQuery = query.trim().toLowerCase()
  const completions = useMemo(() => {
    const rows = data?.completions || []
    if (!normalizedQuery) return rows
    return rows.filter((row) => [
      row.id,
      row.status,
      row.user.walletAddress,
      row.user.displayName,
      row.quest.title,
      row.quest.slug,
      row.quest.verificationType,
      row.submittedValue,
      row.latestLog?.message,
    ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery)))
  }, [data?.completions, normalizedQuery])

  const users = useMemo(() => {
    const rows = data?.users || []
    if (!normalizedQuery) return rows
    return rows.filter((row) => [row.walletAddress, row.displayName, row.role].some((value) => String(value || '').toLowerCase().includes(normalizedQuery)))
  }, [data?.users, normalizedQuery])

  const socialAccounts = useMemo(() => {
    const rows = data?.socialAccounts || []
    if (!normalizedQuery) return rows
    return rows.filter((row) => [row.provider, row.username, row.walletAddress, row.displayName].some((value) => String(value || '').toLowerCase().includes(normalizedQuery)))
  }, [data?.socialAccounts, normalizedQuery])

  const filteredQuizQuestions = useMemo(() => {
    if (!normalizedQuery) return quizQuestions
    return quizQuestions.filter((question) => [
      question.questSlug,
      question.questTitle,
      question.prompt,
      question.explanation,
      question.correctAnswerKey,
      question.answers.map((answer) => answer.text).join(' '),
    ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery)))
  }, [quizQuestions, normalizedQuery])

  const summary = data?.summary

  const renderLogin = () => (
    <main className="war-missions-shell">
      <section className="war-panel war-admin-login">
        <div>
          <div className="war-kicker">Admin access</div>
          <h1>War Missions Admin</h1>
          <p>Login with admin username and password. Wallet login is no longer required for the admin console.</p>
        </div>
        <form className="war-admin-login__form" onSubmit={login}>
          <label>
            <span>Username</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            <span>Password</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
          </label>
          <button className="war-primary" type="submit" disabled={busy === 'login'}>{busy === 'login' ? 'Logging in...' : 'Login'}</button>
        </form>
        {error ? <div className="war-alert">{error}</div> : null}
        {message ? <div className="war-success">{message}</div> : null}
      </section>
    </main>
  )

  const renderStats = () => (
    <section className="war-stats war-admin-stats">
      <div className="war-stat"><div className="war-stat__label">Users</div><div className="war-stat__value">{summary?.usersTotal || 0}</div><div className="war-stat__help">{summary?.bannedTotal || 0} banned / {summary?.adminsTotal || 0} admins</div></div>
      <div className="war-stat"><div className="war-stat__label">Completions</div><div className="war-stat__value">{summary?.completionsTotal || 0}</div><div className="war-stat__help">{summary?.completionsOpen || 0} open / {summary?.completionsVerified || 0} verified</div></div>
      <div className="war-stat"><div className="war-stat__label">Social links</div><div className="war-stat__value">{summary?.socialAccountsTotal || 0}</div><div className="war-stat__help">TG {summary?.telegramAccountsTotal || 0} / DC {summary?.discordAccountsTotal || 0} / X {summary?.xAccountsTotal || 0}</div></div>
      <div className="war-stat"><div className="war-stat__label">Active XP</div><div className="war-stat__value">{summary?.activeXpTotal || 0}</div><div className="war-stat__help">{summary?.notificationsOpen || 0} open notifications</div></div>
    </section>
  )

  const renderCompletionDetails = (row: AdminCompletion) => (
    <div className="war-admin-details">
      <div className="war-admin-details__head">
        <div>
          <div className="war-kicker">Review data</div>
          <h3>{row.quest.title}</h3>
        </div>
        <div className="war-admin-row__actions">
          <button type="button" onClick={() => void reviewCompletion(row.id, 'verified')}>Approve</button>
          <button type="button" onClick={() => void reviewCompletion(row.id, 'rejected')}>Reject</button>
          <button type="button" onClick={() => void recheckSocial(row.id)}>Recheck</button>
        </div>
      </div>
      <div className="war-admin-details__grid">
        <div><strong>Completion ID</strong><span>{row.id}</span></div>
        <div><strong>Status</strong><span>{row.status}</span></div>
        <div><strong>Quest</strong><span>{row.quest.slug}</span></div>
        <div><strong>Verification</strong><span>{row.quest.verificationType}</span></div>
        <div><strong>Wallet</strong><span>{row.user.walletAddress}</span></div>
        <div><strong>Display name</strong><span>{row.user.displayName || 'none'}</span></div>
        <div><strong>Risk score</strong><span>{row.user.riskScore}</span></div>
        <div><strong>Submitted</strong><span>{shortText(row.submittedValue, 'empty', 240)}</span></div>
        <div><strong>Created</strong><span>{dateText(row.createdAt)}</span></div>
        <div><strong>Updated</strong><span>{dateText(row.updatedAt)}</span></div>
        <div><strong>Verified</strong><span>{dateText(row.verifiedAt)}</span></div>
        <div><strong>Latest log</strong><span>{row.latestLog?.message || 'none'}</span></div>
      </div>
      <div className="war-admin-details__json-grid">
        <div><strong>Verification payload</strong><pre>{prettyJson(row.verificationPayload)}</pre></div>
        <div><strong>Latest log</strong><pre>{prettyJson(row.latestLog)}</pre></div>
      </div>
    </div>
  )

  const renderReviews = () => (
    <section className="war-panel">
      <div className="war-section-head">
        <div><div className="war-kicker">Review center</div><h2>{completions.length} completions</h2></div>
        <p>Open a row to inspect submitted data, user risk, verification payloads, and latest logs before approving or rejecting.</p>
      </div>
      <div className="war-admin-list">
        {completions.map((row) => {
          const isExpanded = expandedId === row.id
          return (
            <article className={isExpanded ? 'war-admin-row war-admin-row--expanded' : 'war-admin-row'} key={row.id}>
              <div>
                <strong>{row.quest.title}</strong>
                <span>{row.quest.verificationType} | wallet {shortId(row.user.walletAddress)} | risk {row.user.riskScore}</span>
                <span>submitted: {shortText(row.submittedValue)}</span>
                {row.latestLog?.message ? <span>log: {shortText(row.latestLog.message)}</span> : null}
              </div>
              <div className="war-admin-row__actions">
                <StatusPill value={row.status} />
                <button type="button" onClick={() => setExpandedId(isExpanded ? '' : row.id)}>{isExpanded ? 'Close data' : 'Open data'}</button>
              </div>
              {isExpanded ? renderCompletionDetails(row) : null}
            </article>
          )
        })}
      </div>
    </section>
  )

  const renderUsers = () => (
    <section className="war-panel">
      <div className="war-section-head"><div><div className="war-kicker">Users</div><h2>{users.length} quest users</h2></div></div>
      <div className="war-admin-table">
        <div className="war-admin-table__head"><span>Wallet</span><span>Name</span><span>Role</span><span>Risk</span><span>Quests</span><span>XP</span></div>
        {users.map((user) => (
          <div className="war-admin-table__row" key={user.id}>
            <span>{shortId(user.walletAddress)}</span>
            <span>{user.displayName || 'none'}</span>
            <span>{user.role}{user.isBanned ? ' / banned' : ''}</span>
            <span>{user.riskScore}</span>
            <span>{user.verifiedCount}/{user.completionCount}</span>
            <span>{user.activeXp}</span>
          </div>
        ))}
      </div>
    </section>
  )

  const renderSocial = () => (
    <section className="war-panel">
      <div className="war-section-head"><div><div className="war-kicker">Social identities</div><h2>{socialAccounts.length} linked accounts</h2></div></div>
      <div className="war-admin-list">
        {socialAccounts.map((account) => (
          <article className="war-admin-row" key={account.id}>
            <div>
              <strong>{account.provider}: {account.username}</strong>
              <span>wallet {account.walletAddress}</span>
              <span>provider user ID {account.providerUserId}</span>
              <span>last verified {dateText(account.lastVerifiedAt)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )

  const renderQuizzes = () => (
    <section className="war-panel">
      <div className="war-section-head">
        <div><div className="war-kicker">Docs quiz bank</div><h2>{filteredQuizQuestions.length} questions</h2></div>
        <p>Create, update, and deactivate quiz questions for War Missions documentation quests without leaving the admin console.</p>
      </div>

      <div className="war-two-col">
        <section className="war-panel">
          <div className="war-section-head">
            <div><div className="war-kicker">Question editor</div><h3>{quizDraft.id ? 'Edit question' : 'New question'}</h3></div>
            <p>Use the quest slug from the docs quiz template, then set the prompt, answers, and correct key.</p>
          </div>
          <form className="war-admin-login__form" onSubmit={submitQuizQuestion}>
            <label>
              <span>Quest slug</span>
              <input value={quizDraft.questSlug} onChange={(event) => setQuizDraft((current) => ({ ...current, questSlug: event.target.value }))} placeholder="read-the-basics" />
            </label>
            <label>
              <span>Prompt</span>
              <textarea value={quizDraft.prompt} onChange={(event) => setQuizDraft((current) => ({ ...current, prompt: event.target.value }))} rows={4} />
            </label>
            <label>
              <span>Answer A</span>
              <input value={quizDraft.answerA} onChange={(event) => setQuizDraft((current) => ({ ...current, answerA: event.target.value }))} />
            </label>
            <label>
              <span>Answer B</span>
              <input value={quizDraft.answerB} onChange={(event) => setQuizDraft((current) => ({ ...current, answerB: event.target.value }))} />
            </label>
            <label>
              <span>Answer C</span>
              <input value={quizDraft.answerC} onChange={(event) => setQuizDraft((current) => ({ ...current, answerC: event.target.value }))} />
            </label>
            <label>
              <span>Answer D</span>
              <input value={quizDraft.answerD} onChange={(event) => setQuizDraft((current) => ({ ...current, answerD: event.target.value }))} />
            </label>
            <label>
              <span>Correct answer</span>
              <select value={quizDraft.correctAnswerKey} onChange={(event) => setQuizDraft((current) => ({ ...current, correctAnswerKey: event.target.value }))}>
                <option value="a">A</option>
                <option value="b">B</option>
                <option value="c">C</option>
                <option value="d">D</option>
              </select>
            </label>
            <label>
              <span>Explanation</span>
              <textarea value={quizDraft.explanation} onChange={(event) => setQuizDraft((current) => ({ ...current, explanation: event.target.value }))} rows={3} />
            </label>
            <label>
              <span>Display order</span>
              <input value={quizDraft.displayOrder} onChange={(event) => setQuizDraft((current) => ({ ...current, displayOrder: event.target.value }))} inputMode="numeric" />
            </label>
            <label>
              <span>Status</span>
              <select value={quizDraft.active ? 'active' : 'inactive'} onChange={(event) => setQuizDraft((current) => ({ ...current, active: event.target.value === 'active' }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <div className="war-admin-actions">
              <button className="war-primary" type="submit" disabled={busy === 'save-quiz'}>{busy === 'save-quiz' ? 'Saving...' : quizDraft.id ? 'Update question' : 'Create question'}</button>
              <button className="war-secondary" type="button" onClick={resetQuizDraft}>Reset</button>
            </div>
          </form>
        </section>

        <section className="war-panel">
          <div className="war-section-head">
            <div><div className="war-kicker">Question filters</div><h3>Review and manage</h3></div>
            <p>Filter by quest slug, search by text, and keep inactive questions visible when needed.</p>
          </div>
          <div className="war-admin-login__form">
            <label>
              <span>Quest slug filter</span>
              <input value={quizQuestSlug} onChange={(event) => setQuizQuestSlug(event.target.value)} placeholder="all docs quizzes" />
            </label>
            <label>
              <span>Include inactive</span>
              <select value={quizIncludeInactive ? 'true' : 'false'} onChange={(event) => setQuizIncludeInactive(event.target.value === 'true')}>
                <option value="false">Active only</option>
                <option value="true">Show inactive too</option>
              </select>
            </label>
            <div className="war-admin-actions">
              <button className="war-secondary" type="button" onClick={() => void loadQuizQuestions()} disabled={busy === 'load-quizzes'}>{busy === 'load-quizzes' ? 'Refreshing...' : 'Refresh questions'}</button>
            </div>
          </div>
          {!quizLoaded && busy === 'load-quizzes' ? <div className="war-alert">Loading quiz questions...</div> : null}
          <div className="war-admin-list">
            {filteredQuizQuestions.map((question) => (
              <article className="war-admin-row" key={question.id}>
                <div>
                  <strong>{question.questTitle || question.questSlug}</strong>
                  <span>{question.questSlug} | {question.active ? 'active' : 'inactive'} | answer {question.correctAnswerKey.toUpperCase()}</span>
                  <span>{shortText(question.prompt, 'No prompt', 220)}</span>
                  <span>{question.answers.map((answer) => `${answer.key.toUpperCase()}: ${answer.text}`).join(' | ')}</span>
                  {question.explanation ? <span>explanation: {shortText(question.explanation, 'none', 160)}</span> : null}
                </div>
                <div className="war-admin-row__actions">
                  <button type="button" onClick={() => editQuizQuestion(question)}>Edit</button>
                  <button type="button" onClick={() => void deactivateQuizQuestion(question.id)} disabled={!question.active || busy === 'deactivate-quiz'}>Deactivate</button>
                </div>
              </article>
            ))}
            {!filteredQuizQuestions.length ? <div className="war-alert">No quiz questions match the current filters yet.</div> : null}
          </div>
        </section>
      </div>
    </section>
  )

  const renderLogs = () => (
    <section className="war-panel">
      <div className="war-section-head"><div><div className="war-kicker">Audit trail</div><h2>{data?.verificationLogs?.length || 0} latest logs</h2></div></div>
      <div className="war-admin-list">
        {(data?.verificationLogs || []).map((log) => (
          <article className="war-admin-row" key={log.id}>
            <div>
              <strong>{log.provider || 'admin'} | {log.status || 'unknown'} | {log.verificationType || 'verification'}</strong>
              <span>{log.message || 'No message'}</span>
              <span>wallet {shortId(log.walletAddress)} | completion {shortId(log.completionId)}</span>
              <span>{dateText(log.createdAt)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )

  const renderNotifications = () => (
    <section className="war-panel">
      <div className="war-section-head"><div><div className="war-kicker">Notifications</div><h2>{data?.notifications?.length || 0} admin notices</h2></div></div>
      <div className="war-admin-list">
        {(data?.notifications || []).map((notice) => (
          <article className="war-admin-row" key={notice.id}>
            <div>
              <strong>{notice.title}</strong>
              <span>{notice.priority} | {notice.status} | {notice.type}</span>
              {notice.message ? <span>{notice.message}</span> : null}
              <span>completion {shortId(notice.related_completion_id)} | user {shortId(notice.related_user_id)}</span>
            </div>
            <div className="war-admin-row__actions">
              <button type="button" onClick={() => void resolveNotification(notice.id)} disabled={notice.status === 'resolved'}>Resolve</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )

  const renderPrizes = () => (
    <section className="war-panel">
      <div className="war-section-head"><div><div className="war-kicker">Prizes</div><h2>{data?.prizePools?.length || 0} pools</h2></div></div>
      <div className="war-two-col">
        <div className="war-admin-list">
          {(data?.prizePools || []).map((pool) => (
            <article className="war-admin-row" key={pool.id}>
              <div><strong>{pool.period_type} | {pool.status}</strong><span>{pool.reward_asset || 'reward'} {pool.reward_amount || ''}</span><span>{shortId(pool.id)} | {dateText(pool.created_at)}</span></div>
            </article>
          ))}
        </div>
        <div className="war-admin-list">
          {(data?.prizeWinners || []).map((winner) => (
            <article className="war-admin-row" key={winner.id}>
              <div><strong>Winner #{winner.rank || '-'}</strong><span>{shortId(winner.wallet_address)} | {winner.status}</span><span>pool {shortId(winner.prize_pool_id)} | {winner.reward_amount || 0}</span></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )

  const renderActiveTab = () => {
    if (activeTab === 'overview') return <><section className="war-panel"><div className="war-section-head"><div><div className="war-kicker">Live data</div><h2>Admin overview</h2></div><p>This console reads users, completions, social accounts, logs, notifications, prizes, and XP from the Railway API.</p></div>{renderStats()}</section>{renderReviews()}</>
    if (activeTab === 'reviews') return renderReviews()
    if (activeTab === 'users') return renderUsers()
    if (activeTab === 'social') return renderSocial()
    if (activeTab === 'quizzes') return renderQuizzes()
    if (activeTab === 'logs') return renderLogs()
    if (activeTab === 'notifications') return renderNotifications()
    return renderPrizes()
  }

  return (
    <div className="war-missions-page war-admin-page">
      <div className="war-missions-bg" aria-hidden="true" />
      <div className="war-missions-overlay" aria-hidden="true" />
      <header className="war-missions-top">
        <Link to="/missions" className="war-missions-brand" aria-label="MemeWarzone War Missions"><img src="/logo.png" alt="MemeWarzone" /></Link>
        <nav className="war-missions-nav" aria-label="War admin navigation"><Link to="/missions">Missions</Link><Link to="/missions/leaderboard">Leaderboard</Link><Link to="/missions/rewards">Rewards</Link></nav>
      </header>

      {!admin ? renderLogin() : (
        <main className="war-missions-shell">
          <section className="war-panel war-admin-hero">
            <div><div className="war-kicker">Command console</div><h1>War Missions Admin</h1><p>Logged in as {admin.username}</p></div>
            <div className="war-admin-actions"><button type="button" className="war-secondary" onClick={() => void loadData()} disabled={busy === 'load'}>{busy === 'load' ? 'Refreshing...' : 'Refresh data'}</button><button type="button" className="war-secondary" onClick={() => void logout()} disabled={busy === 'logout'}>Logout</button></div>
            {error ? <div className="war-alert">{error}</div> : null}
            {message ? <div className="war-success">{message}</div> : null}
          </section>

          <section className="war-panel war-admin-toolbar">
            <div className="war-admin-tabs">
              {tabs.map((tab) => <button key={tab.key} type="button" className={activeTab === tab.key ? 'war-admin-tab war-admin-tab--active' : 'war-admin-tab'} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>)}
            </div>
            <input className="war-admin-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search wallet, quest, provider, username..." />
          </section>

          {renderActiveTab()}
        </main>
      )}
    </div>
  )
}

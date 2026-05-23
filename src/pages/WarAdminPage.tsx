import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import './WarMissionsPage.css'
import './WarAdminPage.css'

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

type RecruiterApplication = {
  id: string
  userId: string
  walletAddress: string
  displayName: string | null
  role: string
  xUsername: string
  telegramUsername: string
  discordUsername: string
  motivation: string
  expectedRecruits: number | null
  status: string
  reviewedAt: string | null
  createdAt: string | null
  referralCode: string | null
  referralUrl: string | null
  verifiedRecruits: number
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
  recruiterApplications?: RecruiterApplication[]
  prizePools?: PrizePool[]
  prizeWinners?: PrizeWinner[]
}

type QuizAnswer = {
  key: string
  text: string
}

type QuizTemplate = {
  id: string
  slug: string
  title: string
  description: string
  xpReward: number
  active: boolean
  metadata: Record<string, unknown>
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
  templates?: QuizTemplate[]
  questions?: QuizQuestion[]
}

type QuizTemplatesResponse = {
  ok?: boolean
  error?: string
  admin?: AdminSession
  templates?: QuizTemplate[]
  template?: QuizTemplate
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

type QuizTemplateDraft = {
  id: string
  slug: string
  title: string
  description: string
  active: boolean
}

type TabKey = 'overview' | 'reviews' | 'recruiters' | 'users' | 'social' | 'quizzes' | 'logs' | 'notifications' | 'prizes'

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'recruiters', label: 'Recruiters' },
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

function normalizeQuizAnswers(value: unknown): QuizAnswer[] {
  const parsed = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value)
        } catch {
          return []
        }
      })()
    : value

  if (!Array.isArray(parsed)) return []

  return parsed
    .map((answer) => {
      if (!answer || typeof answer !== 'object') return null
      const key = String((answer as { key?: unknown }).key || '').trim().toLowerCase()
      const text = String((answer as { text?: unknown }).text || '').trim()
      if (!key || !text) return null
      return { key, text }
    })
    .filter((answer): answer is QuizAnswer => Boolean(answer))
}

function createEmptyQuizDraft(defaultQuestSlug = ''): QuizDraft {
  return {
    id: '',
    questSlug: defaultQuestSlug,
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

function createEmptyQuizTemplateDraft(): QuizTemplateDraft {
  return {
    id: '',
    slug: '',
    title: '',
    description: '',
    active: true,
  }
}

function buildQuizDraft(question: QuizQuestion): QuizDraft {
  const answers = normalizeQuizAnswers(question.answers)
  const answerMap = new Map(answers.map((answer) => [answer.key, answer.text]))
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
  const [quizTemplates, setQuizTemplates] = useState<QuizTemplate[]>([])
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([])
  const [quizLoaded, setQuizLoaded] = useState(false)
  const [quizQuestSlug, setQuizQuestSlug] = useState('')
  const [quizIncludeInactive, setQuizIncludeInactive] = useState(false)
  const [quizDraft, setQuizDraft] = useState<QuizDraft>(() => createEmptyQuizDraft())
  const [quizTemplateDraft, setQuizTemplateDraft] = useState<QuizTemplateDraft>(() => createEmptyQuizTemplateDraft())

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

  const loadQuizTemplates = async () => {
    const response = await fetch('/api/wm-admin-quiz-templates', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
    const payload = (await response.json().catch(() => ({}))) as QuizTemplatesResponse
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Quiz templates unavailable.')

    const templates = payload.templates || []
    setQuizTemplates(templates)
    if (payload.admin) setAdmin(payload.admin)

    const selectedSlug = quizDraft.questSlug || templates[0]?.slug || ''
    const selectedTemplate = templates.find((template) => template.slug === selectedSlug) || templates[0] || null

    if (selectedTemplate) {
      setQuizDraft((current) => (current.questSlug === selectedTemplate.slug ? current : { ...current, questSlug: selectedTemplate.slug }))
      setQuizTemplateDraft({
        id: selectedTemplate.id,
        slug: selectedTemplate.slug,
        title: selectedTemplate.title,
        description: selectedTemplate.description || '',
        active: Boolean(selectedTemplate.active),
      })
    } else {
      setQuizTemplateDraft(createEmptyQuizTemplateDraft())
    }
  }

  const loadQuizQuestions = async () => {
    setBusy('load-quizzes')
    setError('')
    try {
      const params = new URLSearchParams()
      if (quizQuestSlug.trim()) params.set('questSlug', quizQuestSlug.trim())
      if (quizIncludeInactive) params.set('includeInactive', 'true')
      const [templatesResponse, questionsResponse] = await Promise.all([
        loadQuizTemplates(),
        fetch(`/api/wm-admin-quiz-questions${params.toString() ? `?${params.toString()}` : ''}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        }),
      ])
      void templatesResponse
      const payload = (await questionsResponse.json().catch(() => ({}))) as QuizQuestionsResponse
      if (!questionsResponse.ok || !payload?.ok) throw new Error(payload?.error || 'Quiz questions unavailable.')
      setQuizQuestions((payload.questions || []).map((question) => ({
        ...question,
        answers: normalizeQuizAnswers(question.answers),
      })))
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

  useEffect(() => {
    const selectedTemplate = quizTemplates.find((template) => template.slug === quizDraft.questSlug) || null
    if (!selectedTemplate) return
    setQuizTemplateDraft((current) => (
      current.id === selectedTemplate.id &&
      current.title === selectedTemplate.title &&
      current.description === (selectedTemplate.description || '') &&
      current.active === Boolean(selectedTemplate.active)
        ? current
        : {
            id: selectedTemplate.id,
            slug: selectedTemplate.slug,
            title: selectedTemplate.title,
            description: selectedTemplate.description || '',
            active: Boolean(selectedTemplate.active),
          }
    ))
  }, [quizDraft.questSlug, quizTemplates])

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
      setQuizTemplates([])
      setQuizQuestions([])
      setQuizLoaded(false)
      setQuizDraft(createEmptyQuizDraft())
      setQuizTemplateDraft(createEmptyQuizTemplateDraft())
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

  const reviewRecruiterApplication = (applicationId: string, decision: 'accepted' | 'rejected') => runAction(
    decision === 'accepted' ? 'Accept recruiter application' : 'Reject recruiter application',
    async () => {
      await apiPost('/api/wm-admin-recruiter-review', {
        applicationId,
        decision,
        reason: decision === 'accepted'
          ? 'Admin approved from recruiter review dashboard'
          : 'Admin rejected from recruiter review dashboard',
      })
    },
  )

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

      if (!quizDraft.questSlug.trim()) throw new Error('Please choose a quiz.')
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
      setQuizDraft(createEmptyQuizDraft(quizDraft.questSlug))
      await loadQuizQuestions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quiz question save failed.')
    } finally {
      setBusy('')
    }
  }

  const saveQuizTemplate = async (event: FormEvent) => {
    event.preventDefault()
    setBusy('save-quiz-template')
    setMessage('')
    setError('')
    try {
      if (!quizTemplateDraft.id) throw new Error('Please choose a quiz first.')
      if (!quizTemplateDraft.title.trim()) throw new Error('Quiz title is required.')

      const response = await fetch('/api/wm-admin-quiz-templates', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: quizTemplateDraft.id,
          title: quizTemplateDraft.title.trim(),
          description: quizTemplateDraft.description.trim(),
          active: quizTemplateDraft.active,
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as QuizTemplatesResponse
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Quiz template save failed.')

      setMessage('Quiz details updated.')
      await loadQuizQuestions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quiz template save failed.')
    } finally {
      setBusy('')
    }
  }

  const editQuizQuestion = (question: QuizQuestion) => {
    setQuizDraft(buildQuizDraft(question))
    setMessage(`Editing ${question.questSlug}.`)
    setError('')
  }

  const removeQuizQuestion = async (questionId: string) => {
    const confirmed = window.confirm('Remove this quiz question? This will permanently delete it.')
    if (!confirmed) return
    setBusy('remove-quiz')
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/wm-admin-quiz-questions', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: questionId, hardDelete: true }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Quiz question update failed.')
      setMessage('Quiz question removed.')
      if (quizDraft.id === questionId) setQuizDraft(createEmptyQuizDraft(quizDraft.questSlug))
      await loadQuizQuestions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quiz question update failed.')
    } finally {
      setBusy('')
    }
  }

  const resetQuizDraft = () => {
    setQuizDraft(createEmptyQuizDraft(quizDraft.questSlug || quizTemplates[0]?.slug || ''))
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

  const recruiterApplications = useMemo(() => {
    const rows = data?.recruiterApplications || []
    if (!normalizedQuery) return rows
    return rows.filter((row) => [
      row.walletAddress,
      row.displayName,
      row.role,
      row.status,
      row.xUsername,
      row.telegramUsername,
      row.discordUsername,
      row.motivation,
      row.referralCode,
      row.referralUrl,
    ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery)))
  }, [data?.recruiterApplications, normalizedQuery])

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
    return quizQuestions.filter((question) => {
      const answers = normalizeQuizAnswers(question.answers)
      return [
        question.questSlug,
        question.questTitle,
        question.prompt,
        question.explanation,
        question.correctAnswerKey,
        answers.map((answer) => answer.text).join(' '),
      ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery))
    })
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

  const renderRecruiterApplicationDetails = (row: RecruiterApplication) => (
    <div className="war-admin-details">
      <div className="war-admin-details__head">
        <div>
          <div className="war-kicker">Recruiter review</div>
          <h3>{row.displayName || shortId(row.walletAddress)}</h3>
        </div>
        <div className="war-admin-row__actions">
          <button type="button" onClick={() => void reviewRecruiterApplication(row.id, 'accepted')} disabled={row.status === 'accepted'}>Accept</button>
          <button type="button" onClick={() => void reviewRecruiterApplication(row.id, 'rejected')} disabled={row.status === 'rejected'}>Reject</button>
        </div>
      </div>
      <div className="war-admin-details__grid">
        <div><strong>Application ID</strong><span>{row.id}</span></div>
        <div><strong>Status</strong><span>{row.status}</span></div>
        <div><strong>Wallet</strong><span>{row.walletAddress}</span></div>
        <div><strong>Current role</strong><span>{row.role}</span></div>
        <div><strong>X username</strong><span>{row.xUsername || 'none'}</span></div>
        <div><strong>Telegram</strong><span>{row.telegramUsername || 'none'}</span></div>
        <div><strong>Discord</strong><span>{row.discordUsername || 'none'}</span></div>
        <div><strong>Expected recruits</strong><span>{row.expectedRecruits ?? 0}</span></div>
        <div><strong>Verified recruits</strong><span>{row.verifiedRecruits}</span></div>
        <div><strong>Created</strong><span>{dateText(row.createdAt)}</span></div>
        <div><strong>Reviewed</strong><span>{dateText(row.reviewedAt)}</span></div>
        <div><strong>Referral code</strong><span>{row.referralCode || 'not assigned yet'}</span></div>
      </div>
      <div className="war-admin-details__json-grid">
        <div>
          <strong>Motivation</strong>
          <pre>{row.motivation || 'No motivation provided.'}</pre>
        </div>
        <div>
          <strong>Referral info</strong>
          <pre>{prettyJson({ referralCode: row.referralCode, referralUrl: row.referralUrl, verifiedRecruits: row.verifiedRecruits })}</pre>
        </div>
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

  const renderRecruiters = () => (
    <section className="war-panel">
      <div className="war-section-head">
        <div><div className="war-kicker">Recruiter queue</div><h2>{recruiterApplications.length} recruiter applications</h2></div>
        <p>Review incoming recruiter applications, approve the wallets that should receive a recruiter role, and reject weak submissions without leaving the admin console.</p>
      </div>
      <div className="war-admin-list">
        {recruiterApplications.map((row) => {
          const isExpanded = expandedId === row.id
          return (
            <article className={isExpanded ? 'war-admin-row war-admin-row--expanded' : 'war-admin-row'} key={row.id}>
              <div>
                <strong>{row.displayName || shortId(row.walletAddress)}</strong>
                <span>{row.role} | X @{row.xUsername || 'none'} | TG @{row.telegramUsername || 'none'}</span>
                <span>{shortText(row.motivation, 'No motivation provided.', 180)}</span>
              </div>
              <div className="war-admin-row__actions">
                <StatusPill value={row.status} />
                <button type="button" onClick={() => setExpandedId(isExpanded ? '' : row.id)}>{isExpanded ? 'Close application' : 'Open application'}</button>
              </div>
              {isExpanded ? renderRecruiterApplicationDetails(row) : null}
            </article>
          )
        })}
      </div>
    </section>
  )

  const renderUsers = () => (
    <section className="war-panel">
      <div className="war-section-head">
        <div><div className="war-kicker">User roster</div><h2>{users.length} users</h2></div>
        <p>Snapshot of wallets, risk scores, social counts, and active XP to help identify suspicious accounts quickly.</p>
      </div>
      <div className="war-admin-table">
        <div className="war-admin-table__head">
          <span>Wallet</span>
          <span>Role</span>
          <span>Name</span>
          <span>Risk</span>
          <span>XP</span>
          <span>Verified</span>
        </div>
        {users.map((row) => (
          <div className="war-admin-table__row" key={row.id}>
            <span>{shortId(row.walletAddress)}</span>
            <span>{row.role}</span>
            <span>{row.displayName || 'none'}</span>
            <span>{row.riskScore}</span>
            <span>{row.activeXp}</span>
            <span>{row.verifiedCount}</span>
          </div>
        ))}
      </div>
    </section>
  )

  const renderSocial = () => (
    <section className="war-panel">
      <div className="war-section-head">
        <div><div className="war-kicker">Social link audit</div><h2>{socialAccounts.length} linked accounts</h2></div>
        <p>Cross-check provider IDs and usernames against the wallet roster when fraud or duplicate-account concerns show up.</p>
      </div>
      <div className="war-admin-table">
        <div className="war-admin-table__head">
          <span>Wallet</span>
          <span>Provider</span>
          <span>Username</span>
          <span>Provider ID</span>
          <span>Verified</span>
          <span>Created</span>
        </div>
        {socialAccounts.map((row) => (
          <div className="war-admin-table__row" key={row.id}>
            <span>{shortId(row.walletAddress)}</span>
            <span>{row.provider}</span>
            <span>{row.username || 'none'}</span>
            <span>{shortId(row.providerUserId)}</span>
            <span>{dateText(row.lastVerifiedAt)}</span>
            <span>{dateText(row.createdAt)}</span>
          </div>
        ))}
      </div>
    </section>
  )

  const renderQuizzes = () => (
    <section className="war-two-col">
      <section className="war-panel">
        <div className="war-section-head">
          <div><div className="war-kicker">Quiz bank</div><h2>{filteredQuizQuestions.length} quiz questions</h2></div>
          <p>Update quiz metadata, swap answers, and curate which questions are active without touching the API directly.</p>
        </div>
        <div className="war-admin-actions">
          <button type="button" onClick={resetQuizDraft}>New question</button>
        </div>
        <div className="war-quiz-list">
          {filteredQuizQuestions.map((question) => {
            const answers = normalizeQuizAnswers(question.answers)
            return (
              <article key={question.id} className="war-quiz-card">
                <div className="war-kicker">{question.questSlug}</div>
                <h3>{question.prompt}</h3>
                <div className="war-quiz-progress">Correct answer: {question.correctAnswerKey.toUpperCase()}</div>
                <div className="war-quiz-options">
                  {answers.map((answer) => (
                    <button key={answer.key} type="button" className={answer.key === question.correctAnswerKey ? 'war-quiz-option war-quiz-option--active' : 'war-quiz-option'}>
                      <strong>{answer.key.toUpperCase()}</strong>
                      <span>{answer.text}</span>
                    </button>
                  ))}
                </div>
                <div className="war-admin-actions">
                  <button type="button" onClick={() => editQuizQuestion(question)}>Edit</button>
                  <button type="button" onClick={() => void removeQuizQuestion(question.id)}>Delete</button>
                </div>
              </article>
            )
          })}
        </div>
      </section>
      <section className="war-panel">
        <div className="war-section-head">
          <div><div className="war-kicker">Quiz editor</div><h2>{quizDraft.id ? 'Edit question' : 'Create question'}</h2></div>
          <p>Every question is tied to a quest template so the missions page can serve the right quiz in the right order.</p>
        </div>
        <form className="war-admin-login__form" onSubmit={submitQuizQuestion}>
          <label>
            <span>Quiz</span>
            <select value={quizDraft.questSlug} onChange={(event) => setQuizDraft((current) => ({ ...current, questSlug: event.target.value }))}>
              <option value="">Choose quiz</option>
              {quizTemplates.map((template) => <option key={template.id} value={template.slug}>{template.title}</option>)}
            </select>
          </label>
          <label>
            <span>Prompt</span>
            <textarea value={quizDraft.prompt} onChange={(event) => setQuizDraft((current) => ({ ...current, prompt: event.target.value }))} />
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
            <textarea value={quizDraft.explanation} onChange={(event) => setQuizDraft((current) => ({ ...current, explanation: event.target.value }))} />
          </label>
          <label>
            <span>Display order</span>
            <input value={quizDraft.displayOrder} onChange={(event) => setQuizDraft((current) => ({ ...current, displayOrder: event.target.value }))} type="number" />
          </label>
          <button className="war-primary" type="submit" disabled={busy === 'save-quiz'}>{busy === 'save-quiz' ? 'Saving...' : quizDraft.id ? 'Update question' : 'Create question'}</button>
        </form>
      </section>
    </section>
  )

  const renderLogs = () => (
    <section className="war-panel">
      <div className="war-section-head">
        <div><div className="war-kicker">Verification logs</div><h2>{data?.verificationLogs?.length || 0} recent logs</h2></div>
        <p>Latest provider responses and moderation notes for troubleshooting failed verification attempts.</p>
      </div>
      <div className="war-admin-list">
        {(data?.verificationLogs || []).map((row) => (
          <article className="war-admin-row" key={row.id}>
            <div>
              <strong>{row.provider || 'system'} | {row.status || 'unknown'}</strong>
              <span>{shortText(row.message, 'No message', 180)}</span>
              <span>wallet {shortId(row.walletAddress)} | completion {shortId(row.completionId)}</span>
            </div>
            <div className="war-admin-row__actions">
              <StatusPill value={row.status || 'unknown'} />
            </div>
          </article>
        ))}
      </div>
    </section>
  )

  const renderNotifications = () => (
    <section className="war-panel">
      <div className="war-section-head">
        <div><div className="war-kicker">Alert queue</div><h2>{data?.notifications?.length || 0} notifications</h2></div>
        <p>Resolve moderation alerts and system notices once they have been reviewed.</p>
      </div>
      <div className="war-admin-list">
        {(data?.notifications || []).map((row) => (
          <article className="war-admin-row" key={row.id}>
            <div>
              <strong>{row.title}</strong>
              <span>{row.type} | {row.priority} | {row.status}</span>
              <span>{shortText(row.message, 'No message', 180)}</span>
            </div>
            <div className="war-admin-row__actions">
              <StatusPill value={row.status} />
              <button type="button" onClick={() => void resolveNotification(row.id)} disabled={row.status === 'resolved'}>Resolve</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )

  const renderPrizes = () => (
    <section className="war-two-col">
      <section className="war-panel">
        <div className="war-section-head">
          <div><div className="war-kicker">Prize pools</div><h2>{data?.prizePools?.length || 0} pools</h2></div>
          <p>Current reward pools and status snapshots for weekly and seasonal mission incentives.</p>
        </div>
        <div className="war-admin-list">
          {(data?.prizePools || []).map((row) => (
            <article className="war-admin-row" key={row.id}>
              <div>
                <strong>{row.period_type}</strong>
                <span>{row.reward_asset || 'reward'} | amount {row.reward_amount ?? 0}</span>
                <span>created {dateText(row.created_at)}</span>
              </div>
              <div className="war-admin-row__actions">
                <StatusPill value={row.status} />
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="war-panel">
        <div className="war-section-head">
          <div><div className="war-kicker">Winners</div><h2>{data?.prizeWinners?.length || 0} winners</h2></div>
          <p>Reward winner records pulled from the latest prize distributions.</p>
        </div>
        <div className="war-admin-list">
          {(data?.prizeWinners || []).map((row) => (
            <article className="war-admin-row" key={row.id}>
              <div>
                <strong>{shortId(row.wallet_address)}</strong>
                <span>pool {shortId(row.prize_pool_id)} | rank {row.rank ?? 'n/a'}</span>
                <span>reward {row.reward_amount ?? 0}</span>
              </div>
              <div className="war-admin-row__actions">
                <StatusPill value={row.status} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  )

  if (!admin) {
    return (
      <div className="war-missions-page war-admin-page">
        <div className="war-missions-bg" />
        <div className="war-missions-overlay" />
        <header className="war-missions-top">
          <Link to="/" className="war-missions-brand" aria-label="Back to missions home"><img src="/uptoken-brand.png" alt="UpToken" /></Link>
        </header>
        {renderLogin()}
      </div>
    )
  }

  return (
    <div className="war-missions-page war-admin-page">
      <div className="war-missions-bg" />
      <div className="war-missions-overlay" />
      <header className="war-missions-top">
        <Link to="/" className="war-missions-brand" aria-label="Back to missions home"><img src="/uptoken-brand.png" alt="UpToken" /></Link>
        <nav className="war-missions-nav">
          <a href="/">Missions</a>
          <a href="/faq.html">FAQ</a>
          <a href="https://uptoken.org" target="_blank" rel="noreferrer">UpToken</a>
        </nav>
      </header>
      <main className="war-missions-shell">
        <section className="war-panel war-admin-hero">
          <div>
            <div className="war-kicker">Moderation + operations</div>
            <h1>War Missions Admin</h1>
            <p>Review completions, inspect user wallets, manage recruiter applications, tune quizzes, and resolve alerts without leaving the quest environment.</p>
          </div>
          <div className="war-admin-toolbar">
            <div className="war-admin-actions">
              <button type="button" onClick={() => void loadData()} disabled={busy === 'load'}>{busy === 'load' ? 'Refreshing...' : 'Refresh data'}</button>
              <button type="button" onClick={() => void loadQuizQuestions()} disabled={busy === 'load-quizzes'}>{busy === 'load-quizzes' ? 'Refreshing...' : 'Refresh quizzes'}</button>
              <button type="button" onClick={() => void logout()} disabled={busy === 'logout'}>{busy === 'logout' ? 'Logging out...' : 'Logout'}</button>
            </div>
            <input className="war-admin-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search wallets, quests, providers, notes" />
          </div>
        </section>

        {message ? <div className="war-success">{message}</div> : null}
        {error ? <div className="war-alert">{error}</div> : null}
        {renderStats()}

        <section className="war-panel">
          <div className="war-admin-tabs">
            {tabs.map((tab) => (
              <button key={tab.key} type="button" className={tab.key === activeTab ? 'war-admin-tab war-admin-tab--active' : 'war-admin-tab'} onClick={() => { setExpandedId(''); setActiveTab(tab.key) }}>
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {activeTab === 'overview' ? renderReviews() : null}
        {activeTab === 'reviews' ? renderReviews() : null}
        {activeTab === 'recruiters' ? renderRecruiters() : null}
        {activeTab === 'users' ? renderUsers() : null}
        {activeTab === 'social' ? renderSocial() : null}
        {activeTab === 'quizzes' ? renderQuizzes() : null}
        {activeTab === 'logs' ? renderLogs() : null}
        {activeTab === 'notifications' ? renderNotifications() : null}
        {activeTab === 'prizes' ? renderPrizes() : null}
      </main>
    </div>
  )
}

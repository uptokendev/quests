import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { connectWallet } from '../lib/wallet'
import './WarMissionsPage.css'
import './WarMissionsSimplified.css'

type QuestStatus = 'ready' | 'pending' | 'review' | 'locked' | 'verified' | 'started' | 'rejected' | 'revoked' | 'expired'
type RecruiterQuestState = 'not_started' | 'pending_review' | 'approved' | 'rejected'

type Quest = {
  slug?: string
  title: string
  description: string
  xp: string
  status: QuestStatus
  verificationType?: string
  recruiterState?: RecruiterQuestState
  rejectionReason?: string | null
}

type MissionCategory = {
  slug: string
  eyebrow: string
  title: string
  description: string
  accent: string
  quests: Quest[]
}

type BadgeType = 'identity' | 'mission' | 'xp' | 'streak' | 'recruiter' | 'manual'

type ProfileBadge = {
  slug: string
  title: string
  description: string | null
  type: BadgeType
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  iconKey: string
  criteria: Record<string, unknown>
  displayOrder: number
  unlocked: boolean
  awardedAt: string | null
  source: 'auto' | 'admin' | 'system' | null
  reason: string | null
}

type BadgeSummary = {
  total: number
  unlocked: number
  byType: Record<BadgeType, { total: number; unlocked: number }>
}

type WarProfile = {
  id: string
  walletAddress: string
  displayName: string | null
  avatarUrl: string | null
  role: 'user' | 'recruiter' | 'admin'
  riskScore: number
  isBanned: boolean
  xpTotal: number
  completedQuestSlugs: string[]
  dailyProgress: {
    dateUtc: string
    questsCompleted: number
    dailyXpEarned: number
    completedAll: boolean
    streakCount: number
    raffleTicketsEarned: number
    resetAt: string
    updatedAt: string | null
  }
  badges: ProfileBadge[]
  badgeSummary: BadgeSummary
}

type ApiQuest = {
  instanceId: string | null
  templateId: string
  slug: string
  title: string
  description: string | null
  xpReward: number
  verificationType: string
  repeatable: boolean
  periodType: 'once' | 'daily' | 'weekly' | 'season' | null
  metadata: Record<string, unknown>
  status: QuestStatus | null
  rejectionReason: string | null
}

type ApiCategory = {
  slug: string
  title: string
  description: string | null
  displayOrder: number
  quests: ApiQuest[]
}

type WarMissionsResponse = {
  ok?: boolean
  error?: string
  profile?: WarProfile | null
  categories?: ApiCategory[]
}

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

type RecruiterStatusCheckResponse = {
  ok?: boolean
  error?: string
  recruiterStatus?: RecruiterStatusPayload
  roleSynced?: boolean
  questAwarded?: boolean
  questAlreadyAwarded?: boolean
}

type LeaderboardRow = {
  rank: number
  userId: string
  walletAddress: string
  displayName: string | null
  avatarUrl: string | null
  xpTotal: number
  periodType: string
}

type LeaderboardResponse = {
  ok?: boolean
  error?: string
  rows?: LeaderboardRow[]
}

type BadgesResponse = {
  ok?: boolean
  error?: string
  authenticated?: boolean
  badges?: ProfileBadge[]
  badgeSummary?: BadgeSummary
}

type PrizePool = {
  id: string
  period_type: string
  reward_asset: string | null
  reward_amount: number | null
  status: string
}

type PrizeWinner = {
  id: string
  prize_pool_id: string
  wallet_address: string | null
  rank: number | null
  reward_amount: number | null
  status: string
}

type PrizesResponse = {
  ok?: boolean
  pools?: PrizePool[]
  winners?: PrizeWinner[]
}

type SocialStatusResponse = {
  ok?: boolean
  authenticated?: boolean
  xOAuthConfigured?: boolean
  telegramInviteUrl?: string | null
  discordInviteUrl?: string | null
  accounts?: Array<{ provider: string; username: string; providerUserId: string; lastVerifiedAt: string | null }>
}

type XOAuthStartResponse = {
  ok?: boolean
  error?: string
  authorizeUrl?: string
}

type XFollowCheckResponse = {
  ok?: boolean
  error?: string
  follows?: boolean
  status?: string
  result?: {
    ok?: boolean
    status?: string | null
    error?: string | null
  }
}

type QuizQuestion = {
  id: string
  prompt: string
  answers: Array<{ key: string; text: string }>
}

type QuizLoadResponse = {
  ok?: boolean
  error?: string
  title?: string
  cooldownUntil?: string | null
  cooldownActive?: boolean
  passingScore?: number
  questions?: QuizQuestion[]
}

type QuizSubmitResponse = {
  ok?: boolean
  error?: string
  passed?: boolean
  score?: number
  totalQuestions?: number
  passingScore?: number
  cooldownUntil?: string | null
}

type IdentityCheck = {
  label: string
  done: boolean
  hint: string
}

type ProofDraft = {
  quest: Quest
  value: string
  notes: string
}

type QuizSession = {
  quest: Quest
  title: string
  passingScore: number
  questions: QuizQuestion[]
  answers: Record<string, string>
  submitting: boolean
}

const badgeTypeLabels: Record<BadgeType, string> = {
  identity: 'Identity',
  mission: 'Missions',
  xp: 'XP',
  streak: 'Streaks',
  recruiter: 'Recruiter',
  manual: 'Special',
}

const badgeTypeOrder: BadgeType[] = ['identity', 'mission', 'xp', 'streak', 'recruiter', 'manual']
const DEFAULT_COMMAND_CENTER_URL = 'https://memewarzonefrontend-production.up.railway.app/command/recruiter'
const commandCenterUrl = String(import.meta.env.VITE_COMMAND_CENTER_RECRUITER_URL || DEFAULT_COMMAND_CENTER_URL).trim()

const fallbackBadges: ProfileBadge[] = [
  { slug: 'oathkeeper', title: 'Oathkeeper', description: 'Connect wallet and sign the War Missions oath.', type: 'identity', rarity: 'common', iconKey: 'oath', criteria: {}, displayOrder: 10, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'start-here-cleared', title: 'Start Here Cleared', description: 'Complete every Start Here onboarding quest.', type: 'mission', rarity: 'uncommon', iconKey: 'start', criteria: {}, displayOrder: 100, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'xp-500', title: '500 XP', description: 'Earn 500 active XP.', type: 'xp', rarity: 'common', iconKey: 'xp', criteria: {}, displayOrder: 200, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'streak-3', title: '3-Day Streak', description: 'Build a 3-day Warpath streak.', type: 'streak', rarity: 'common', iconKey: 'streak', criteria: {}, displayOrder: 300, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'recruiter-approved', title: 'Recruiter Approved', description: 'Get accepted into the Recruiter Program.', type: 'recruiter', rarity: 'uncommon', iconKey: 'recruiter', criteria: {}, displayOrder: 400, unlocked: false, awardedAt: null, source: null, reason: null },
]

const fallbackCategories: MissionCategory[] = [
  {
    slug: 'start-here',
    eyebrow: 'First run',
    title: 'Start Here',
    accent: '4 onboarding quests',
    description: 'Connect wallet, verify identity, and join the core MemeWarzone channels.',
    quests: [
      { slug: 'intercept-global-comms', title: 'Intercept Global Comms', description: 'Follow MemeWarzone on X.', xp: '100 XP', status: 'ready', verificationType: 'x_follow' },
      { slug: 'access-underground-comms', title: 'Access the Underground Comms', description: 'Join the official Telegram group. This is a growth quest, not account connection.', xp: '100 XP', status: 'ready', verificationType: 'telegram_join' },
      { slug: 'report-to-base-camp', title: 'Report to Base Camp', description: 'Join the official Discord server. This is a growth quest, not account connection.', xp: '100 XP', status: 'ready', verificationType: 'discord_join' },
      { slug: 'take-the-oath', title: 'Take the Oath', description: 'Connect wallet and sign the oath message.', xp: '150 XP', status: 'ready', verificationType: 'wallet_connect' },
    ],
  },
  {
    slug: 'daily-warpath',
    eyebrow: 'Daily reset 00:00 UTC',
    title: 'Daily Warpath',
    accent: '850 XP daily max',
    description: 'Daily social and community activity with caps, quality checks, and streak tracking.',
    quests: [
      { title: 'Drop Frontline Propaganda', description: 'Submit a unique X post with at least 3 likes.', xp: '150 XP', status: 'pending' },
      { title: 'Provide Covering Fire', description: 'Submit 2 valuable replies, not one-line spam.', xp: '150 XP', status: 'pending' },
      { title: 'Relay the Battleplan', description: 'Submit a quote post with at least 50 impressions.', xp: '200 XP', status: 'pending' },
      { title: 'Maintain Radio Discipline', description: 'Meaningful Discord and/or Telegram activity.', xp: '100 XP', status: 'pending' },
    ],
  },
  {
    slug: 'black-market-contracts',
    eyebrow: 'High XP contracts',
    title: 'Black Market Contracts',
    accent: 'highest tier only',
    description: 'Impression-based MemeWarzone posts with delayed checks and manual review on the top tier.',
    quests: [
      { title: 'Signal Leak', description: '500 impressions on a tagged X post.', xp: '500 XP', status: 'review' },
      { title: 'Broadcasting Static', description: '1,000 impressions on a tagged X post.', xp: '1,000 XP', status: 'review' },
      { title: 'Viral Contagion', description: '2,000 impressions on a tagged X post.', xp: '2,500 XP', status: 'review' },
      { title: 'Total Info-Dominance', description: '5,000 impressions and admin review.', xp: '7,500 XP', status: 'review' },
    ],
  },
  {
    slug: 'recon',
    eyebrow: 'Knowledge checks',
    title: 'Recon & Interrogation',
    accent: '3/4 to pass',
    description: 'Documentation quizzes for basics, leagues, treasury objectives, and safety rules.',
    quests: [
      { title: 'Read the Basics', description: 'Read docs and pass the quiz.', xp: '250 XP', status: 'locked', verificationType: 'docs_quiz' },
      { title: 'Leagues and Airdrop Briefing', description: 'Learn weekly and monthly competition loops.', xp: '300 XP', status: 'locked', verificationType: 'docs_quiz' },
      { title: 'Fees and Treasury Objectives', description: 'Understand the prize and revenue loops.', xp: '300 XP', status: 'locked', verificationType: 'docs_quiz' },
      { title: 'Security & Safety Recon', description: 'Learn safety rules and anti-farming policy.', xp: '350 XP', status: 'locked', verificationType: 'docs_quiz' },
    ],
  },
  {
    slug: 'reinforcements',
    eyebrow: 'Recruiter growth',
    title: 'Operation: Reinforcements',
    accent: 'verified recruits only',
    description: 'Recruiter signup happens in Command Center. Return here to check status and unlock verified squad milestones.',
    quests: [
      {
        slug: 'accepted-recruiter-program',
        title: 'Recruiter Program',
        description: 'Open Command Center, complete signup there, then return here to check status and unlock recruiter progression.',
        xp: '2,000 XP',
        status: 'ready',
        verificationType: 'recruiter_status_check',
        recruiterState: 'not_started',
      },
    ],
  },
]

function shorten(value: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : ''
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function xpLabel(value: number) {
  return `${Number(value || 0).toLocaleString()} XP`
}

function categoryEyebrow(slug: string) {
  switch (slug) {
    case 'start-here': return 'First run'
    case 'daily-warpath': return 'Daily reset 00:00 UTC'
    case 'black-market-contracts': return 'High XP contracts'
    case 'recon': return 'Knowledge checks'
    case 'reinforcements': return 'Recruiter growth'
    default: return 'War Missions'
  }
}

function categoryAccent(slug: string, quests: ApiQuest[]) {
  if (slug === 'start-here') return `${quests.length} onboarding quests`
  if (slug === 'daily-warpath') return '850 XP daily max'
  if (slug === 'black-market-contracts') return 'highest tier only'
  if (slug === 'recon') return '3/4 to pass'
  if (slug === 'reinforcements') return 'verified recruits only'
  return `${quests.length} quests`
}

function displayStatus(status: ApiQuest['status'], verificationType: string, isConnected: boolean): QuestStatus {
  if (status) return status
  if (verificationType === 'manual_review') return isConnected ? 'review' : 'locked'
  if (!isConnected && verificationType !== 'wallet_connect') return 'locked'
  return 'ready'
}

function mapApiCategory(category: ApiCategory, isConnected: boolean): MissionCategory {
  return {
    slug: category.slug,
    eyebrow: categoryEyebrow(category.slug),
    title: category.title,
    accent: categoryAccent(category.slug, category.quests),
    description: category.description || '',
    quests: category.quests.map((quest) => ({
      slug: quest.slug,
      title: quest.title,
      description: quest.description || '',
      xp: xpLabel(quest.xpReward),
      status: displayStatus(quest.status, quest.verificationType, isConnected),
      verificationType: quest.verificationType,
      rejectionReason: quest.rejectionReason,
    })),
  }
}

function recruiterStateToQuestStatus(state?: RecruiterQuestState): QuestStatus {
  switch (state) {
    case 'pending_review':
      return 'pending'
    case 'approved':
      return 'ready'
    case 'rejected':
      return 'rejected'
    default:
      return 'ready'
  }
}

function recruiterDescription(status: RecruiterStatusPayload | null) {
  switch (status?.status) {
    case 'pending_review':
      return 'Your Command Center recruiter signup is still under review. Check again here after approval to unlock recruiter quests.'
    case 'approved':
      return 'Command Center already shows this wallet as approved. Run the check here once to verify the quest and unlock recruiter milestones.'
    case 'rejected':
      return status.reason
        ? `Your recruiter signup was rejected: ${status.reason}`
        : 'Your recruiter signup was rejected. Update it in Command Center, then run the check again here.'
    default:
      return 'Open Command Center, complete recruiter signup there, then return here and run the status check.'
  }
}

function recruiterStatusLabel(quest: Quest) {
  switch (quest.recruiterState) {
    case 'pending_review':
      return 'Pending review'
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
    default:
      return 'Not started'
  }
}

function normalizeReinforcementsCategory(category: MissionCategory, recruiterStatus: RecruiterStatusPayload | null) {
  const approvalQuest = category.quests.find((quest) => quest.verificationType === 'recruiter_application_accepted' || /accepted/i.test(quest.title)) || null
  const followUpQuests = category.quests.filter((quest) => quest !== approvalQuest && quest.verificationType !== 'recruiter_application_submitted')

  if (approvalQuest?.status === 'verified') {
    return {
      ...category,
      description: 'Recruiter approval is confirmed. Verified recruit milestones now unlock from the same War Missions profile.',
      quests: [approvalQuest, ...followUpQuests],
    }
  }

  return {
    ...category,
    description: 'Recruiter signup happens in Command Center. Return here to check status and unlock verified squad milestones.',
    quests: [
      {
        slug: approvalQuest?.slug || 'accepted-recruiter-program',
        title: 'Recruiter Program',
        description: recruiterDescription(recruiterStatus),
        xp: approvalQuest?.xp || '2,000 XP',
        status: recruiterStateToQuestStatus(recruiterStatus?.status),
        verificationType: 'recruiter_status_check',
        recruiterState: recruiterStatus?.status || 'not_started',
        rejectionReason: recruiterStatus?.reason || null,
      },
    ],
  }
}

function statusLabel(quest: Quest) {
  if (quest.verificationType === 'recruiter_status_check') return recruiterStatusLabel(quest)
  if (quest.status === 'verified') return 'Complete'
  if (quest.status === 'ready') return 'Ready'
  if (quest.status === 'pending' || quest.status === 'started') return 'Metric check'
  if (quest.status === 'review') return 'Review'
  if (quest.status === 'rejected') return 'Rejected'
  if (quest.status === 'revoked') return 'Revoked'
  if (quest.status === 'expired') return 'Expired'
  return 'Locked'
}

function badgeCode(badge: ProfileBadge) {
  if (badge.iconKey === 'xp') return 'XP'
  if (badge.iconKey === 'streak') return 'ST'
  if (badge.iconKey === 'recruits') return 'RC'
  return badge.title.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function summarizeFallbackBadges(badges: ProfileBadge[]): BadgeSummary {
  const byType = badgeTypeOrder.reduce((acc, type) => {
    acc[type] = { total: 0, unlocked: 0 }
    return acc
  }, {} as BadgeSummary['byType'])

  for (const badge of badges) {
    byType[badge.type].total += 1
    if (badge.unlocked) byType[badge.type].unlocked += 1
  }

  return { total: badges.length, unlocked: badges.filter((badge) => badge.unlocked).length, byType }
}

function proofPlaceholder(quest: Quest) {
  if (quest.verificationType?.startsWith('x_')) return 'https://x.com/your-post'
  if (quest.verificationType?.includes('telegram')) return 'Telegram proof or message link'
  if (quest.verificationType?.includes('discord')) return 'Discord proof or message link'
  return 'Paste the proof link or metric reference'
}

function proofInstructions(quest: Quest) {
  if (quest.verificationType?.startsWith('x_')) return 'Paste the public X post, reply, or quote-post link used for this mission.'
  if (quest.verificationType === 'manual_review') return 'Share the clearest public proof you have. Admin review will use this reference.'
  return 'Paste the best proof link or short reference for the mission. You can add context for reviewers below.'
}

export default function WarMissionsPage() {
  const { section } = useParams()
  const navigate = useNavigate()
  const [missionsData, setMissionsData] = useState<WarMissionsResponse | null>(null)
  const [badgesData, setBadgesData] = useState<BadgesResponse | null>(null)
  const [socialStatus, setSocialStatus] = useState<SocialStatusResponse | null>(null)
  const [recruiterStatus, setRecruiterStatus] = useState<RecruiterStatusPayload | null>(null)
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>([])
  const [prizePools, setPrizePools] = useState<PrizePool[]>([])
  const [prizeWinners, setPrizeWinners] = useState<PrizeWinner[]>([])
  const [loading, setLoading] = useState(true)
  const [authing, setAuthing] = useState(false)
  const [actionBusy, setActionBusy] = useState('')
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [nowMs, setNowMs] = useState(Date.now())
  const [proofDraft, setProofDraft] = useState<ProofDraft | null>(null)
  const [proofSubmitting, setProofSubmitting] = useState(false)
  const [quizSession, setQuizSession] = useState<QuizSession | null>(null)

  const profile = missionsData?.profile || null
  const isConnected = Boolean(profile)

  const loadMissions = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/wm-quests-list', { credentials: 'same-origin', cache: 'no-store' })
      const badgeResponse = await fetch('/api/wm-badges-list', { credentials: 'same-origin', cache: 'no-store' })
      const leaderboardResponse = await fetch('/api/wm-leaderboard-current?period=weekly', { credentials: 'same-origin', cache: 'no-store' })
      const prizesResponse = await fetch('/api/wm-prizes-public', { credentials: 'same-origin', cache: 'no-store' })
      const data = (await response.json().catch(() => ({}))) as WarMissionsResponse
      const badgeData = (await badgeResponse.json().catch(() => ({}))) as BadgesResponse
      const leaderboardData = (await leaderboardResponse.json().catch(() => ({}))) as LeaderboardResponse
      const prizesData = (await prizesResponse.json().catch(() => ({}))) as PrizesResponse
      if (!response.ok || !data?.ok || !data.categories) throw new Error(data.error || 'War Missions API is not available yet.')
      if (!badgeResponse.ok || !badgeData?.ok || !badgeData.badges) throw new Error(badgeData.error || 'War Missions badge API is not available yet.')
      setMissionsData(data)
      setBadgesData(badgeData)
      setLeaderboardRows(leaderboardResponse.ok && leaderboardData.rows ? leaderboardData.rows : [])
      setPrizePools(prizesResponse.ok && prizesData.pools ? prizesData.pools : [])
      setPrizeWinners(prizesResponse.ok && prizesData.winners ? prizesData.winners : [])
    } catch (err) {
      setMissionsData(null)
      setBadgesData(null)
      setLeaderboardRows([])
      setPrizePools([])
      setPrizeWinners([])
      setError(err instanceof Error ? err.message : 'War Missions API is not available yet.')
    } finally {
      setLoading(false)
    }
  }

  const loadSocialStatus = async () => {
    try {
      const response = await fetch('/api/wm-social-status', { credentials: 'same-origin', cache: 'no-store' })
      const data = (await response.json().catch(() => ({}))) as SocialStatusResponse & { error?: string }
      if (!response.ok || !data?.ok) throw new Error(data.error || 'Social status unavailable.')
      setSocialStatus(data)
    } catch {
      setSocialStatus(null)
    }
  }

  const loadRecruiterStatus = async () => {
    try {
      const response = await fetch('/api/wm-recruiter-status', { credentials: 'same-origin', cache: 'no-store' })
      const data = (await response.json().catch(() => ({}))) as RecruiterStatusResponse
      if (!response.ok || !data?.ok || !data.recruiterStatus) throw new Error(data.error || 'Recruiter status unavailable.')
      setRecruiterStatus(data.recruiterStatus)
    } catch {
      setRecruiterStatus(null)
    }
  }

  useEffect(() => { void loadMissions() }, [])
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!profile) {
      setSocialStatus(null)
      setRecruiterStatus(null)
      return
    }
    void Promise.all([loadSocialStatus(), loadRecruiterStatus()])
  }, [profile?.id])

  const categories = useMemo(() => {
    const base = missionsData?.categories?.length
      ? missionsData.categories.map((category) => mapApiCategory(category, isConnected))
      : fallbackCategories

    return base.map((category) => (
      category.slug === 'reinforcements'
        ? normalizeReinforcementsCategory(category, recruiterStatus)
        : category
    ))
  }, [isConnected, missionsData, recruiterStatus])

  const visibleCategories = useMemo(() => {
    if (!section) return categories
    if (section === 'leaderboard' || section === 'rewards') return []
    return categories.filter((category) => category.slug === section)
  }, [categories, section])

  const stats = useMemo(() => {
    const pendingReview = categories.reduce((total, category) => total + category.quests.filter((quest) => ['pending', 'review', 'started'].includes(quest.status)).length, 0)
    const leaderboardRank = profile ? leaderboardRows.find((row) => row.userId === profile.id)?.rank || 'Unranked' : '0'
    const resetAt = profile?.dailyProgress?.resetAt ? new Date(profile.dailyProgress.resetAt).getTime() : 0
    const resetMinutes = resetAt > nowMs ? Math.ceil((resetAt - nowMs) / 60000) : 0
    return [
      { label: 'Total XP', value: profile ? profile.xpTotal.toLocaleString() : '0', help: 'Ledger backed' },
      { label: 'Daily streak', value: profile ? String(profile.dailyProgress.streakCount) : '0', help: resetMinutes ? `Reset in ${resetMinutes}m` : 'UTC reset' },
      { label: 'Pending review', value: String(pendingReview), help: 'Admin queue' },
      { label: 'Weekly rank', value: String(leaderboardRank), help: 'Active XP' },
    ]
  }, [categories, leaderboardRows, nowMs, profile])

  const badges = useMemo(() => profile?.badges || badgesData?.badges || fallbackBadges, [badgesData, profile])
  const badgeSummary = useMemo(() => profile?.badgeSummary || badgesData?.badgeSummary || summarizeFallbackBadges(badges), [badges, badgesData, profile])
  const unlockedBadges = useMemo(() => badges.filter((badge) => badge.unlocked), [badges])
  const badgeGroups = useMemo(() => badgeTypeOrder.map((type) => ({ type, label: badgeTypeLabels[type], badges: badges.filter((badge) => badge.type === type) })).filter((group) => group.badges.length > 0), [badges])

  const linkedProviders = useMemo(() => new Set((socialStatus?.accounts || []).map((account) => account.provider)), [socialStatus])
  const identityChecks = useMemo<IdentityCheck[]>(() => [
    { label: 'Wallet signature', done: Boolean(profile), hint: profile ? shorten(profile.walletAddress) : 'Required to unlock live quests' },
    { label: 'X account', done: linkedProviders.has('x'), hint: linkedProviders.has('x') ? 'Connected for social verification' : 'Connect once when prompted by an X quest' },
    { label: 'Telegram identity', done: linkedProviders.has('telegram'), hint: linkedProviders.has('telegram') ? 'Ready for join checks' : 'Connect once before running Telegram join quests' },
    { label: 'Discord identity', done: linkedProviders.has('discord'), hint: linkedProviders.has('discord') ? 'Ready for join checks' : 'Connect once before running Discord join quests' },
  ], [linkedProviders, profile])

  const reviewQueue = useMemo(() => categories
    .map((category) => ({
      slug: category.slug,
      title: category.title,
      count: category.quests.filter((quest) => ['pending', 'review', 'started'].includes(quest.status)).length,
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count), [categories])

  const missionLinks = useMemo(() => categories.map((category) => ({
    slug: category.slug,
    title: category.title,
    accent: category.accent,
    active: section === category.slug || (!section && category.slug === 'start-here'),
  })), [categories, section])

  const recruiterCta = useMemo(() => {
    if (profile?.role === 'recruiter' || profile?.role === 'admin') {
      return { to: '/recruiter/portal', label: 'Open recruiter portal' }
    }
    return { to: '/recruiter/apply', label: 'Recruiter status' }
  }, [profile?.role])

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
      await loadMissions()
      await Promise.all([loadSocialStatus(), loadRecruiterStatus()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet sign-in failed.')
    } finally {
      setAuthing(false)
    }
  }

  const submitQuest = async (questSlug: string, submittedValue: string, payload: Record<string, unknown>) => {
    const response = await fetch('/api/wm-quests-submit', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questSlug, submittedValue, payload }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.ok) throw new Error(data?.error || 'Quest submission failed.')
    setActionMessage(data.status === 'verified' ? 'Quest verified and XP awarded.' : 'Quest submitted for review.')
  }

  const getSocialStatus = async () => {
    const response = await fetch('/api/wm-social-status', { credentials: 'same-origin', cache: 'no-store' })
    const data = (await response.json().catch(() => ({}))) as SocialStatusResponse & { error?: string }
    if (!response.ok || !data?.ok) throw new Error(data.error || 'Social status unavailable.')
    setSocialStatus(data)
    return data
  }

  const checkCommunityMembership = async (provider: 'telegram' | 'discord', questSlug: string) => {
    const endpoint = provider === 'telegram' ? '/api/wm-telegram-member-check' : '/api/wm-discord-member-check'
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questSlug }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.ok) throw new Error(data?.error || `${provider} membership check failed.`)
    return data
  }

  const startXOAuth = async () => {
    const response = await fetch('/api/wm-x-oauth-start', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = (await response.json().catch(() => ({}))) as XOAuthStartResponse
    if (!response.ok || !data?.ok || !data.authorizeUrl) throw new Error(data?.error || 'X connection could not start.')
    window.location.href = data.authorizeUrl
  }

  const checkXFollow = async () => {
    const response = await fetch('/api/wm-x-follow-check', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = (await response.json().catch(() => ({}))) as XFollowCheckResponse
    if (!response.ok || !data?.ok) throw new Error(data?.error || 'X follow check failed.')
    return data
  }

  const checkRecruiterStatus = async () => {
    const response = await fetch('/api/wm-recruiter-status-check', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = (await response.json().catch(() => ({}))) as RecruiterStatusCheckResponse
    if (!response.ok || !data?.ok || !data.recruiterStatus) throw new Error(data?.error || 'Recruiter status check failed.')

    setRecruiterStatus(data.recruiterStatus)

    if (data.recruiterStatus.status === 'approved') {
      setActionMessage(data.questAwarded
        ? 'Recruiter approval confirmed. Quest verified and recruiter milestones unlocked.'
        : 'Recruiter approval is already synced. Recruiter milestones are ready.' )
    } else if (data.recruiterStatus.status === 'pending_review') {
      setActionMessage('Recruiter signup is still pending review in Command Center.')
    } else if (data.recruiterStatus.status === 'rejected') {
      setActionMessage(data.recruiterStatus.reason || 'Recruiter signup is currently rejected in Command Center.')
    } else {
      setActionMessage('No recruiter signup was found yet. Open Command Center to get started.')
    }

    return data
  }

  const runJoinQuest = async (quest: Quest) => {
    if (!quest.slug) return

    const provider = quest.verificationType === 'telegram_join' ? 'telegram' : 'discord'
    const label = provider === 'telegram' ? 'Telegram' : 'Discord'
    const destination = provider === 'telegram' ? 'group' : 'server'
    const social = await getSocialStatus()
    const account = social.accounts?.find((item) => item.provider === provider)
    const inviteUrl = provider === 'telegram' ? social.telegramInviteUrl : social.discordInviteUrl

    if (!account) {
      throw new Error(`${label} identity is not connected yet. Connect ${label} once in Identity Status, then return here so the bot can verify the ${destination} membership quest.`)
    }

    if (inviteUrl) window.open(inviteUrl, '_blank', 'noopener,noreferrer')
    setActionMessage(`Opened the official ${label} ${destination}. Join it there while we keep checking membership automatically.`)

    let lastMessage = ''
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      if (attempt > 1) await sleep(attempt === 2 ? 3000 : 5000)
      const data = await checkCommunityMembership(provider, quest.slug)
      lastMessage = data.membership?.error || data.result?.reason || ''

      if (data.membership?.ok || data.status === 'verified' || data.result?.status === 'verified' || data.result?.status === 'already_verified') {
        setActionMessage(`${label} ${destination} membership confirmed. Quest verified and XP awarded.`)
        await loadMissions()
        return
      }

      setActionMessage(`Waiting for ${label} ${destination} membership confirmation... check ${attempt}/12.`)
    }

    setActionMessage(`${label} membership is not confirmed yet${lastMessage ? `: ${lastMessage}` : ''}. If you just joined, the bot will also keep checking when you refresh the quest page.`)
  }

  const linkXForQuest = async () => {
    const social = await getSocialStatus()
    const xAccount = social.accounts?.find((item) => item.provider === 'x')

    if (!xAccount) {
      if (!social.xOAuthConfigured) {
        throw new Error('X OAuth is not configured on this deploy yet.')
      }
      setActionMessage('Opening X authorization. Approve the connection, then you will return here for follow verification.')
      await startXOAuth()
      return
    }

    const data = await checkXFollow()
    if (data.follows || data.status === 'verified' || data.result?.ok) {
      setActionMessage('X follow confirmed. Quest verified and XP awarded.')
      await loadMissions()
      return
    }

    setActionMessage('X account is linked, but the required follow is not confirmed yet. Follow the official account, then run this check again.')
  }

  const loadQuiz = async (quest: Quest) => {
    const quizResponse = await fetch(`/api/wm-quiz-load?questSlug=${encodeURIComponent(quest.slug || '')}`, { credentials: 'same-origin', cache: 'no-store' })
    const quizData = (await quizResponse.json().catch(() => ({}))) as QuizLoadResponse
    if (!quizResponse.ok || !quizData?.ok || !Array.isArray(quizData.questions)) throw new Error(quizData?.error || 'Quiz could not be loaded.')
    if (quizData.cooldownActive) {
      throw new Error(quizData.cooldownUntil ? `Quiz retry is locked until ${new Date(quizData.cooldownUntil).toLocaleString()}.` : 'Quiz retry cooldown is active.')
    }

    setQuizSession({
      quest,
      title: quizData.title || quest.title,
      passingScore: quizData.passingScore ?? 0,
      questions: quizData.questions,
      answers: {},
      submitting: false,
    })
  }

  const submitQuizSession = async () => {
    if (!quizSession?.quest.slug) return

    const questionIds = quizSession.questions.map((question) => question.id)
    const unanswered = questionIds.some((questionId) => !quizSession.answers[questionId])
    if (unanswered) {
      setError('Answer every quiz question before submitting.')
      return
    }

    setError('')
    setQuizSession((current) => current ? { ...current, submitting: true } : current)

    try {
      const submitResponse = await fetch('/api/wm-quiz-submit', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questSlug: quizSession.quest.slug, answers: quizSession.answers, questionIds }),
      })
      const submitData = (await submitResponse.json().catch(() => ({}))) as QuizSubmitResponse
      if (!submitResponse.ok || !submitData?.ok) throw new Error(submitData?.error || 'Quiz submission failed.')

      const passingScore = submitData.passingScore ?? quizSession.passingScore
      setActionMessage(
        submitData.passed
          ? `Quiz passed: ${submitData.score}/${submitData.totalQuestions}. Needed ${passingScore}.`
          : `Quiz failed: ${submitData.score}/${submitData.totalQuestions}. Needed ${passingScore}.${submitData.cooldownUntil ? ` Retry after ${new Date(submitData.cooldownUntil).toLocaleString()}.` : ''}`,
      )
      setQuizSession(null)
      await loadMissions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quiz submission failed.')
      setQuizSession((current) => current ? { ...current, submitting: false } : current)
    }
  }

  const openProofComposer = (quest: Quest) => {
    setProofDraft({
      quest,
      value: '',
      notes: '',
    })
  }

  const submitProofDraft = async () => {
    if (!proofDraft?.quest.slug) return
    if (!proofDraft.value.trim()) {
      setError('Add a proof link or reference before submitting.')
      return
    }

    setProofSubmitting(true)
    setError('')
    try {
      await submitQuest(proofDraft.quest.slug, proofDraft.value.trim(), {
        source: 'war_missions_ui',
        notes: proofDraft.notes.trim() || undefined,
      })
      setProofDraft(null)
      await loadMissions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quest submission failed.')
    } finally {
      setProofSubmitting(false)
    }
  }

  const runQuestAction = async (quest: Quest) => {
    if (!profile) {
      await signIn()
      return
    }
    if (!quest.slug) return

    setActionMessage('')
    setError('')

    if (quest.verificationType === 'recruiter_status_check') {
      setActionBusy(quest.slug)
      try {
        await checkRecruiterStatus()
        await loadMissions()
        await loadRecruiterStatus()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Recruiter status check failed.')
      } finally {
        setActionBusy('')
      }
      return
    }

    if (quest.verificationType === 'docs_quiz') {
      setActionBusy(quest.slug)
      try {
        await loadQuiz(quest)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Quiz could not be loaded.')
      } finally {
        setActionBusy('')
      }
      return
    }

    if (quest.verificationType === 'recruiter_application_submitted') {
      navigate(profile.role === 'recruiter' || profile.role === 'admin' ? '/recruiter/portal' : '/recruiter/apply')
      return
    }

    if (!['wallet_connect', 'telegram_join', 'discord_join', 'x_follow'].includes(quest.verificationType || '')) {
      openProofComposer(quest)
      return
    }

    setActionBusy(quest.slug)
    try {
      if (quest.verificationType === 'wallet_connect') await signIn()
      else if (quest.verificationType === 'telegram_join' || quest.verificationType === 'discord_join') await runJoinQuest(quest)
      else if (quest.verificationType === 'x_follow') await linkXForQuest()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quest action failed.')
    } finally {
      setActionBusy('')
    }
  }

  const questActionLabel = (quest: Quest) => {
    if (quest.status === 'verified') return 'Done'
    if (quest.status === 'locked') return 'Locked'
    if (quest.verificationType === 'recruiter_status_check') return 'Check status'
    if (quest.verificationType === 'docs_quiz') return 'Open quiz'
    if (quest.verificationType === 'recruiter_application_submitted') return profile?.role === 'recruiter' || profile?.role === 'admin' ? 'Open portal' : 'Apply now'
    if (quest.verificationType === 'wallet_connect') return 'Sign'
    if (quest.verificationType === 'telegram_join') return 'Join & verify TG'
    if (quest.verificationType === 'discord_join') return 'Join & verify Discord'
    if (quest.verificationType === 'x_follow') return 'Connect / verify X'
    return quest.status === 'review' || quest.status === 'pending' ? 'Update proof' : 'Submit proof'
  }

  const missionHeading = visibleCategories.length === 1 ? visibleCategories[0].title : 'Choose your mission path'
  const answeredQuizQuestions = quizSession ? quizSession.questions.filter((question) => quizSession.answers[question.id]).length : 0

  return (
    <div className="war-missions-page">
      <div className="war-missions-bg" aria-hidden="true" />
      <div className="war-missions-overlay" aria-hidden="true" />
      <header className="war-missions-top">
        <Link to="/" className="war-missions-brand" aria-label="MemeWarzone War Missions home"><img src="/logo.png" alt="MemeWarzone" /></Link>
        <nav className="war-missions-nav" aria-label="War Missions navigation">
          <Link to="/missions">Missions</Link>
          <Link to="/missions/leaderboard">Leaderboard</Link>
          <Link to="/missions/rewards">Rewards</Link>
          <Link to="/recruiter/portal">Recruiter Portal</Link>
          <Link to="/admin/missions">Admin</Link>
        </nav>
      </header>

      <main className="war-missions-shell">
        <section className="war-hero">
          <div className="war-hero-copy">
            <div className="war-kicker">MemeWarzone Command</div>
            <h1>War Missions</h1>
            <p>Complete quests, earn XP, build streaks, recruit verified soldiers, and qualify for weekly prizes before the full Warzone opens.</p>
            <div className="war-hero-actions">
              <button type="button" className="war-primary" onClick={() => void signIn()} disabled={authing}>{authing ? 'Waiting for signature...' : profile ? 'Wallet connected' : 'Connect wallet'}</button>
              <Link to={recruiterCta.to} className="war-secondary">{recruiterCta.label}</Link>
            </div>
            {error ? <div className="war-alert">{error}</div> : null}
            {actionMessage ? <div className="war-success">{actionMessage}</div> : null}
          </div>

          <aside className="war-status-card">
            <div className="war-status-card__label">Identity status</div>
            <div className="war-status-card__title">{profile ? 'Wallet verified' : 'Wallet required'}</div>
            <p>{profile ? `Profile ${shorten(profile.walletAddress)} is active. Link your socials once, then run join and follow quests without leaving this flow.` : 'Wallet is the primary identity. Social accounts can be connected once, then join quests verify membership.'}</p>
            <div className="war-checklist">
              {identityChecks.map((item) => (
                <span className={item.done ? 'war-checklist__done' : ''} key={item.label}>
                  <strong>{item.label}</strong>
                  <em>{item.hint}</em>
                </span>
              ))}
            </div>
            <div className="war-badge-strip" aria-label="Unlocked badges">
              {unlockedBadges.length > 0 ? unlockedBadges.slice(0, 5).map((badge) => <span className={`war-badge-dot war-badge-dot--${badge.rarity}`} title={badge.title} key={badge.slug}>{badgeCode(badge)}</span>) : <span className="war-badge-strip__empty">No badges unlocked yet</span>}
            </div>
          </aside>
        </section>

        <section className="war-stats" aria-label="Mission stats">
          {stats.map((stat) => <div className="war-stat" key={stat.label}><div className="war-stat__label">{stat.label}</div><div className="war-stat__value">{stat.value}</div><div className="war-stat__help">{stat.help}</div></div>)}
        </section>

        {(section === 'leaderboard' || section === 'rewards') ? null : (
          <section className="war-panel war-panel--tight war-mission-rail" aria-label="Mission categories">
            <div className="war-route-strip">
              {missionLinks.map((category) => (
                <Link key={category.slug} to={`/missions/${category.slug}`} className={`war-route-chip ${category.active ? 'war-route-chip--active' : ''}`}>
                  <strong>{category.title}</strong>
                  <span>{category.accent}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="war-panel war-badges-panel" aria-label="War Missions badges">
          <div className="war-section-head">
            <div><div className="war-kicker">Badge cabinet</div><h2>{badgeSummary.unlocked} / {badgeSummary.total} badges unlocked</h2></div>
            <p>Badges are off-chain achievements synced from verified quests, active XP, streaks, and recruiter milestones.</p>
          </div>
          <div className="war-badge-groups">
            {badgeGroups.map((group) => <section className="war-badge-group" key={group.type}><div className="war-badge-group__head"><h3>{group.label}</h3><span>{badgeSummary.byType[group.type].unlocked} / {badgeSummary.byType[group.type].total}</span></div><div className="war-badge-grid">{group.badges.map((badge) => <article className={`war-badge-card ${badge.unlocked ? 'war-badge-card--unlocked' : ''}`} key={badge.slug}><div className={`war-badge-medallion war-badge-medallion--${badge.rarity}`}>{badgeCode(badge)}</div><div><div className="war-badge-card__title">{badge.title}</div><div className="war-badge-card__text">{badge.description}</div><div className="war-badge-card__meta">{badge.unlocked ? 'Unlocked' : 'Locked'} | {badge.rarity}</div></div></article>)}</div></section>)}
          </div>
        </section>

        {visibleCategories.length > 0 ? (
          <section className="war-panel" id="missions">
            <div className="war-section-head">
              <div><div className="war-kicker">Quest board</div><h2>{missionHeading}</h2></div>
              <p>{loading ? 'Loading mission data...' : missionsData?.categories?.length ? 'Live mission data from Supabase.' : 'Local mission scaffold shown until Supabase responds.'}</p>
            </div>
            <div className="mission-grid">
              {visibleCategories.map((category) => (
                <article className="mission-card" key={category.title}>
                  <div className="mission-card__top"><div><div className="mission-card__eyebrow">{category.eyebrow}</div><h3>{category.title}</h3></div><span>{category.accent}</span></div>
                  <p>{category.description}</p>
                  <div className="quest-list">
                    {category.quests.map((quest) => (
                      <div className="quest-row" key={quest.slug || quest.title}>
                        <div>
                          <div className="quest-row__title">{quest.title}</div>
                          <div className="quest-row__text">{quest.description}</div>
                          {quest.verificationType === 'recruiter_status_check' ? <div className="quest-row__hint">Command Center is the only signup path. Open it there, then run the status check here to unlock recruiter milestones.</div> : null}
                          {quest.verificationType === 'docs_quiz' ? <div className="quest-row__hint">Quiz now runs inside the app so users can review every question before submitting.</div> : null}
                        </div>
                        <div className="quest-row__meta">
                          <strong>{quest.xp}</strong>
                          <span className={`quest-status quest-status--${quest.status}`}>{statusLabel(quest)}</span>
                          {quest.verificationType === 'recruiter_status_check' ? (
                            <div className="quest-row__actions">
                              <a href={commandCenterUrl} target="_blank" rel="noreferrer" className="quest-action quest-action--secondary">Open Command Center</a>
                              <button type="button" className="quest-action" disabled={actionBusy === quest.slug} onClick={() => void runQuestAction(quest)}>{actionBusy === quest.slug ? 'Checking...' : questActionLabel(quest)}</button>
                            </div>
                          ) : (
                            <button type="button" className="quest-action" disabled={quest.status === 'locked' || quest.status === 'verified' || actionBusy === quest.slug} onClick={() => void runQuestAction(quest)}>{actionBusy === quest.slug ? 'Checking...' : questActionLabel(quest)}</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {(section === 'rewards' || !section) ? (
          <section className="war-panel war-rewards-panel" id="rewards">
            <div className="war-section-head"><div><div className="war-kicker">Rewards</div><h2>Prize pools and winners</h2></div><p>Published pools and approved winners are pulled from the prize workflow.</p></div>
            <div className="war-rewards-grid">
              <div className="war-rewards-column"><h3>Active pools</h3>{prizePools.length === 0 ? <div className="leaderboard-empty">No public prize pools yet.</div> : prizePools.slice(0, 6).map((pool) => <article className="war-reward-row" key={pool.id}><strong>{pool.period_type} | {pool.status}</strong><span>{pool.reward_asset || 'Reward'} {pool.reward_amount ? Number(pool.reward_amount).toLocaleString() : ''}</span></article>)}</div>
              <div className="war-rewards-column"><h3>Winners</h3>{prizeWinners.length === 0 ? <div className="leaderboard-empty">No approved winners yet.</div> : prizeWinners.slice(0, 6).map((winner) => <article className="war-reward-row" key={winner.id}><strong>Rank #{winner.rank || '-'}</strong><span>{winner.wallet_address ? shorten(winner.wallet_address) : 'Wallet pending'} | {winner.status}</span></article>)}</div>
            </div>
          </section>
        ) : null}

        <section className="war-two-col" id="leaderboard">
          <div className="war-panel war-panel--tight">
            <div className="war-kicker">Leaderboard preview</div><h2>Weekly front line</h2>
            {leaderboardRows.length === 0 ? <div className="leaderboard-empty">No ranked soldiers yet. XP will be calculated from the active XP ledger.</div> : <div className="leaderboard-list">{leaderboardRows.slice(0, 8).map((row) => <div className="leaderboard-row" key={row.userId}><span>#{row.rank}</span><strong>{row.displayName || shorten(row.walletAddress)}</strong><em>{row.xpTotal.toLocaleString()} XP</em></div>)}</div>}
          </div>
          <div className="war-panel war-panel--tight">
            <div className="war-kicker">Pending review</div><h2>Admin watchlist</h2>
            {reviewQueue.length === 0 ? <div className="leaderboard-empty">Nothing is waiting for review right now.</div> : <div className="review-list">{reviewQueue.slice(0, 4).map((entry) => <span key={entry.slug}><strong>{entry.title}</strong><em>{entry.count} queued</em></span>)}</div>}
          </div>
        </section>
      </main>

      {proofDraft ? (
        <div className="war-modal-shell" role="dialog" aria-modal="true" aria-labelledby="proof-modal-title">
          <div className="war-modal-backdrop" onClick={() => !proofSubmitting && setProofDraft(null)} />
          <div className="war-modal">
            <div className="war-modal__head">
              <div>
                <div className="war-kicker">Proof submission</div>
                <h2 id="proof-modal-title">{proofDraft.quest.title}</h2>
              </div>
              <button type="button" className="war-modal__close" onClick={() => setProofDraft(null)} disabled={proofSubmitting}>Close</button>
            </div>
            <p className="war-modal__copy">{proofInstructions(proofDraft.quest)}</p>
            <label className="war-field">
              <span>Proof link or reference</span>
              <input
                type="text"
                value={proofDraft.value}
                onChange={(event) => setProofDraft((current) => current ? { ...current, value: event.target.value } : current)}
                placeholder={proofPlaceholder(proofDraft.quest)}
              />
            </label>
            <label className="war-field">
              <span>Context for review</span>
              <textarea
                value={proofDraft.notes}
                onChange={(event) => setProofDraft((current) => current ? { ...current, notes: event.target.value } : current)}
                rows={4}
                placeholder="Add metrics, campaign notes, or anything that helps review this faster."
              />
            </label>
            <div className="war-modal__actions">
              <button type="button" className="war-secondary" onClick={() => setProofDraft(null)} disabled={proofSubmitting}>Cancel</button>
              <button type="button" className="war-primary" onClick={() => void submitProofDraft()} disabled={proofSubmitting}>{proofSubmitting ? 'Submitting...' : 'Submit proof'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {quizSession ? (
        <div className="war-modal-shell" role="dialog" aria-modal="true" aria-labelledby="quiz-modal-title">
          <div className="war-modal-backdrop" onClick={() => !quizSession.submitting && setQuizSession(null)} />
          <div className="war-modal war-modal--wide">
            <div className="war-modal__head">
              <div>
                <div className="war-kicker">Recon quiz</div>
                <h2 id="quiz-modal-title">{quizSession.title}</h2>
              </div>
              <button type="button" className="war-modal__close" onClick={() => setQuizSession(null)} disabled={quizSession.submitting}>Close</button>
            </div>
            <p className="war-modal__copy">Answer all {quizSession.questions.length} questions, then submit once. Passing score: {quizSession.passingScore}.</p>
            <div className="war-quiz-progress">{answeredQuizQuestions} / {quizSession.questions.length} answered</div>
            <div className="war-quiz-list">
              {quizSession.questions.map((question, index) => (
                <section className="war-quiz-card" key={question.id}>
                  <div className="war-quiz-card__count">Question {index + 1}</div>
                  <h3>{question.prompt}</h3>
                  <div className="war-quiz-options">
                    {question.answers.map((answer) => (
                      <button
                        type="button"
                        key={answer.key}
                        className={`war-quiz-option ${quizSession.answers[question.id] === answer.key ? 'war-quiz-option--active' : ''}`}
                        onClick={() => setQuizSession((current) => current ? { ...current, answers: { ...current.answers, [question.id]: answer.key } } : current)}
                        disabled={quizSession.submitting}
                      >
                        <strong>{answer.key.toUpperCase()}</strong>
                        <span>{answer.text}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="war-modal__actions">
              <button type="button" className="war-secondary" onClick={() => setQuizSession(null)} disabled={quizSession.submitting}>Cancel</button>
              <button type="button" className="war-primary" onClick={() => void submitQuizSession()} disabled={quizSession.submitting}>{quizSession.submitting ? 'Submitting...' : 'Submit quiz'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

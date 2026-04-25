import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { connectWallet } from '../lib/wallet'
import './WarMissionsPage.css'

type QuestStatus = 'ready' | 'pending' | 'review' | 'locked' | 'verified' | 'started' | 'rejected' | 'revoked' | 'expired'

type Quest = {
  slug?: string
  title: string
  description: string
  xp: string
  status: QuestStatus
  verificationType?: string
}

type MissionCategory = {
  slug: string
  eyebrow: string
  title: string
  description: string
  accent: string
  quests: Quest[]
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

const badgeTypeLabels: Record<BadgeType, string> = {
  identity: 'Identity',
  mission: 'Missions',
  xp: 'XP',
  streak: 'Streaks',
  recruiter: 'Recruiter',
  manual: 'Special',
}

const badgeTypeOrder: BadgeType[] = ['identity', 'mission', 'xp', 'streak', 'recruiter', 'manual']

const fallbackCategories: MissionCategory[] = [
  {
    slug: 'start-here',
    eyebrow: 'First run',
    title: 'Start Here',
    accent: '4 onboarding quests',
    description: 'Connect wallet, link socials, and complete the basic soldier verification path.',
    quests: [
      { title: 'Intercept Global Comms', description: 'Follow MemeWarzone on X.', xp: '100 XP', status: 'ready' },
      { title: 'Access the Underground Comms', description: 'Join the official Telegram.', xp: '100 XP', status: 'ready' },
      { title: 'Report to Base Camp', description: 'Join the official Discord.', xp: '100 XP', status: 'ready' },
      { title: 'Take the Oath', description: 'Connect wallet and sign the oath message.', xp: '150 XP', status: 'ready' },
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
      { title: 'Read the Basics', description: 'Read docs and pass the quiz.', xp: '250 XP', status: 'locked' },
      { title: 'Leagues and Airdrop Briefing', description: 'Learn weekly and monthly competition loops.', xp: '300 XP', status: 'locked' },
      { title: 'Fees and Treasury Objectives', description: 'Understand the prize and revenue loops.', xp: '300 XP', status: 'locked' },
      { title: 'Security & Safety Recon', description: 'Learn safety rules and anti-farming policy.', xp: '350 XP', status: 'locked' },
    ],
  },
  {
    slug: 'reinforcements',
    eyebrow: 'Recruiter growth',
    title: 'Operation: Reinforcements',
    accent: 'verified recruits only',
    description: 'Apply for recruiter, get approved, generate links, and build verified squads.',
    quests: [
      { title: 'Apply for Recruiter Program', description: 'Submit the recruiter application.', xp: '500 XP', status: 'ready' },
      { title: 'Get Accepted', description: 'Admin approves your recruiter profile.', xp: '2,000 XP', status: 'review' },
      { title: 'Assemble a Fireteam', description: 'Bring in 2 verified recruits.', xp: '1,000 XP', status: 'locked' },
      { title: 'Lead a Battalion', description: 'Bring in 20 verified recruits.', xp: '15,000 XP', status: 'locked' },
    ],
  },
]

const fallbackBadges: ProfileBadge[] = [
  { slug: 'oathkeeper', title: 'Oathkeeper', description: 'Connect wallet and sign the War Missions oath.', type: 'identity', rarity: 'common', iconKey: 'oath', criteria: {}, displayOrder: 10, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'start-here-cleared', title: 'Start Here Cleared', description: 'Complete every Start Here onboarding quest.', type: 'mission', rarity: 'uncommon', iconKey: 'start', criteria: {}, displayOrder: 100, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'daily-warpath-cleared', title: 'Daily Warpath Cleared', description: 'Complete the Daily Warpath bonus quest.', type: 'mission', rarity: 'uncommon', iconKey: 'daily', criteria: {}, displayOrder: 110, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'black-market-operator', title: 'Black Market Operator', description: 'Complete a Black Market Contract.', type: 'mission', rarity: 'rare', iconKey: 'market', criteria: {}, displayOrder: 120, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'recon-certified', title: 'Recon Certified', description: 'Pass every Recon briefing.', type: 'mission', rarity: 'rare', iconKey: 'recon', criteria: {}, displayOrder: 130, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'reinforcements-operator', title: 'Reinforcements Operator', description: 'Complete an Operation: Reinforcements quest.', type: 'mission', rarity: 'rare', iconKey: 'reinforce', criteria: {}, displayOrder: 140, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'xp-500', title: '500 XP', description: 'Earn 500 active XP.', type: 'xp', rarity: 'common', iconKey: 'xp', criteria: {}, displayOrder: 200, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'xp-1000', title: '1,000 XP', description: 'Earn 1,000 active XP.', type: 'xp', rarity: 'common', iconKey: 'xp', criteria: {}, displayOrder: 210, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'xp-5000', title: '5,000 XP', description: 'Earn 5,000 active XP.', type: 'xp', rarity: 'uncommon', iconKey: 'xp', criteria: {}, displayOrder: 220, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'xp-10000', title: '10,000 XP', description: 'Earn 10,000 active XP.', type: 'xp', rarity: 'rare', iconKey: 'xp', criteria: {}, displayOrder: 230, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'xp-25000', title: '25,000 XP', description: 'Earn 25,000 active XP.', type: 'xp', rarity: 'epic', iconKey: 'xp', criteria: {}, displayOrder: 240, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'xp-50000', title: '50,000 XP', description: 'Earn 50,000 active XP.', type: 'xp', rarity: 'legendary', iconKey: 'xp', criteria: {}, displayOrder: 250, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'streak-3', title: '3-Day Streak', description: 'Build a 3-day Warpath streak.', type: 'streak', rarity: 'common', iconKey: 'streak', criteria: {}, displayOrder: 300, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'streak-7', title: '7-Day Streak', description: 'Build a 7-day Warpath streak.', type: 'streak', rarity: 'uncommon', iconKey: 'streak', criteria: {}, displayOrder: 310, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'streak-14', title: '14-Day Streak', description: 'Build a 14-day Warpath streak.', type: 'streak', rarity: 'rare', iconKey: 'streak', criteria: {}, displayOrder: 320, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'streak-30', title: '30-Day Streak', description: 'Build a 30-day Warpath streak.', type: 'streak', rarity: 'legendary', iconKey: 'streak', criteria: {}, displayOrder: 330, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'recruiter-approved', title: 'Recruiter Approved', description: 'Get accepted into the Recruiter Program.', type: 'recruiter', rarity: 'uncommon', iconKey: 'recruiter', criteria: {}, displayOrder: 400, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'fireteam-2', title: 'Fireteam Builder', description: 'Recruit 2 verified users.', type: 'recruiter', rarity: 'uncommon', iconKey: 'recruits', criteria: {}, displayOrder: 410, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'squad-4', title: 'Squad Builder', description: 'Recruit 4 verified users.', type: 'recruiter', rarity: 'rare', iconKey: 'recruits', criteria: {}, displayOrder: 420, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'strike-force-10', title: 'Strike Force Lead', description: 'Recruit 10 verified users.', type: 'recruiter', rarity: 'epic', iconKey: 'recruits', criteria: {}, displayOrder: 430, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'battalion-20', title: 'Battalion Lead', description: 'Recruit 20 verified users.', type: 'recruiter', rarity: 'epic', iconKey: 'recruits', criteria: {}, displayOrder: 440, unlocked: false, awardedAt: null, source: null, reason: null },
  { slug: 'brigade-30', title: 'Brigade Commander', description: 'Recruit 30 verified users.', type: 'recruiter', rarity: 'legendary', iconKey: 'recruits', criteria: {}, displayOrder: 450, unlocked: false, awardedAt: null, source: null, reason: null },
]

function shorten(value: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : ''
}

function xpLabel(value: number) {
  return `${Number(value || 0).toLocaleString()} XP`
}

function categoryEyebrow(slug: string) {
  switch (slug) {
    case 'start-here':
      return 'First run'
    case 'daily-warpath':
      return 'Daily reset 00:00 UTC'
    case 'black-market-contracts':
      return 'High XP contracts'
    case 'recon':
      return 'Knowledge checks'
    case 'reinforcements':
      return 'Recruiter growth'
    default:
      return 'War Missions'
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
    })),
  }
}

function statusLabel(status: QuestStatus) {
  if (status === 'verified') return 'Complete'
  if (status === 'ready') return 'Ready'
  if (status === 'pending' || status === 'started') return 'Metric check'
  if (status === 'review') return 'Review'
  if (status === 'rejected') return 'Rejected'
  if (status === 'revoked') return 'Revoked'
  if (status === 'expired') return 'Expired'
  return 'Locked'
}

function badgeCode(badge: ProfileBadge) {
  if (badge.iconKey === 'xp') return 'XP'
  if (badge.iconKey === 'streak') return 'ST'
  if (badge.iconKey === 'recruits') return 'RC'
  return badge.title
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
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

  return {
    total: badges.length,
    unlocked: badges.filter((badge) => badge.unlocked).length,
    byType,
  }
}

export default function WarMissionsPage() {
  const { section } = useParams()
  const [missionsData, setMissionsData] = useState<WarMissionsResponse | null>(null)
  const [badgesData, setBadgesData] = useState<BadgesResponse | null>(null)
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>([])
  const [prizePools, setPrizePools] = useState<PrizePool[]>([])
  const [prizeWinners, setPrizeWinners] = useState<PrizeWinner[]>([])
  const [loading, setLoading] = useState(true)
  const [authing, setAuthing] = useState(false)
  const [actionBusy, setActionBusy] = useState('')
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [nowMs, setNowMs] = useState(Date.now())

  const profile = missionsData?.profile || null
  const isConnected = Boolean(profile)

  const loadMissions = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/wm-quests-list', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const badgeResponse = await fetch('/api/wm-badges-list', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const leaderboardResponse = await fetch('/api/wm-leaderboard-current?period=weekly', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const prizesResponse = await fetch('/api/wm-prizes-public', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
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

  useEffect(() => {
    void loadMissions()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const categories = useMemo(() => {
    if (missionsData?.categories?.length) {
      return missionsData.categories.map((category) => mapApiCategory(category, isConnected))
    }
    return fallbackCategories
  }, [isConnected, missionsData])

  const visibleCategories = useMemo(() => {
    if (!section) return categories
    if (section === 'leaderboard' || section === 'rewards') return []
    return categories.filter((category) => category.slug === section)
  }, [categories, section])

  const stats = useMemo(() => {
    const pendingReview = categories.reduce((total, category) => {
      return total + category.quests.filter((quest) => quest.status === 'pending' || quest.status === 'review' || quest.status === 'started').length
    }, 0)

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

  const badges = useMemo(() => {
    return profile?.badges || badgesData?.badges || fallbackBadges
  }, [badgesData, profile])

  const badgeSummary = useMemo(() => {
    return profile?.badgeSummary || badgesData?.badgeSummary || summarizeFallbackBadges(badges)
  }, [badges, badgesData, profile])

  const unlockedBadges = useMemo(() => badges.filter((badge) => badge.unlocked), [badges])

  const badgeGroups = useMemo(() => {
    return badgeTypeOrder
      .map((type) => ({
        type,
        label: badgeTypeLabels[type],
        badges: badges.filter((badge) => badge.type === type),
      }))
      .filter((group) => group.badges.length > 0)
  }, [badges])

  const signIn = async () => {
    setAuthing(true)
    setError('')
    try {
      const { signer, address } = await connectWallet()
      const nonceResponse = await fetch(`/api/wm-auth-nonce?address=${encodeURIComponent(address)}`, {
        credentials: 'same-origin',
      })
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet sign-in failed.')
    } finally {
      setAuthing(false)
    }
  }

  const runQuestAction = async (quest: Quest) => {
    if (!profile) {
      await signIn()
      return
    }
    if (!quest.slug) return

    setActionBusy(quest.slug)
    setActionMessage('')
    setError('')

    try {
      if (quest.verificationType === 'docs_quiz') {
        await runQuiz(quest)
      } else if (quest.verificationType === 'recruiter_application_submitted') {
        await submitRecruiterApplication()
      } else if (quest.verificationType === 'wallet_connect') {
        await signIn()
      } else if (['x_follow', 'telegram_join', 'discord_join'].includes(quest.verificationType || '')) {
        await linkSocialForQuest(quest)
      } else {
        const submittedValue = window.prompt(`Submit proof for ${quest.title}`, quest.verificationType?.startsWith('x_') ? 'https://x.com/...' : '')
        if (submittedValue === null) return
        await submitQuest(quest.slug, submittedValue, { source: 'war_missions_ui' })
      }
      await loadMissions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quest action failed.')
    } finally {
      setActionBusy('')
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

  const linkSocialForQuest = async (quest: Quest) => {
    const provider = quest.verificationType === 'x_follow' ? 'x' : quest.verificationType === 'telegram_join' ? 'telegram' : 'discord'
    const username = window.prompt(`Enter your ${provider.toUpperCase()} username or ID:`)
    if (username === null) return
    const response = await fetch('/api/wm-social-link', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, username }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.ok) throw new Error(data?.error || 'Social link failed.')
    await submitQuest(quest.slug || data.questSlug, username, { provider, username, source: 'social_link_manual_review' })
    setActionMessage(`${provider.toUpperCase()} account linked and submitted for review.`)
  }

  const runQuiz = async (quest: Quest) => {
    const quizResponse = await fetch(`/api/wm-quiz-get?questSlug=${encodeURIComponent(quest.slug || '')}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    })
    const quizData = await quizResponse.json().catch(() => ({}))
    if (!quizResponse.ok || !quizData?.ok || !Array.isArray(quizData.questions)) throw new Error(quizData?.error || 'Quiz could not be loaded.')

    const answers: Record<string, string> = {}
    for (const question of quizData.questions) {
      const options = (question.answers || []).map((answer: { key: string; text: string }) => `${answer.key}: ${answer.text}`).join('\n')
      const answer = window.prompt(`${question.question}\n\n${options}\n\nEnter answer key:`)
      if (answer === null) return
      answers[question.id] = answer.trim()
    }

    const submitResponse = await fetch('/api/wm-quiz-submit', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questSlug: quest.slug, answers }),
    })
    const submitData = await submitResponse.json().catch(() => ({}))
    if (!submitResponse.ok || !submitData?.ok) throw new Error(submitData?.error || 'Quiz submission failed.')
    setActionMessage(submitData.passed ? `Quiz passed: ${submitData.score}/${submitData.passScore}.` : `Quiz failed: ${submitData.score}/${submitData.passScore}.`)
  }

  const submitRecruiterApplication = async () => {
    const xUsername = window.prompt('X username') || ''
    const telegramUsername = window.prompt('Telegram username') || ''
    const discordUsername = window.prompt('Discord username') || ''
    const motivation = window.prompt('Why should you be a recruiter?') || ''
    const response = await fetch('/api/wm-recruiter-apply', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xUsername, telegramUsername, discordUsername, motivation }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.ok) throw new Error(data?.error || 'Recruiter application failed.')
    setActionMessage('Recruiter application submitted.')
  }

  const questActionLabel = (quest: Quest) => {
    if (quest.status === 'verified') return 'Done'
    if (quest.status === 'locked') return 'Locked'
    if (quest.verificationType === 'docs_quiz') return 'Start quiz'
    if (quest.verificationType === 'recruiter_application_submitted') return 'Apply'
    if (quest.verificationType === 'wallet_connect') return 'Sign'
    return quest.status === 'review' || quest.status === 'pending' ? 'Update proof' : 'Submit'
  }

  const missionHeading = visibleCategories.length === 1 ? visibleCategories[0].title : 'Choose your mission path'

  return (
    <div className="war-missions-page">
      <div className="war-missions-bg" aria-hidden="true" />
      <div className="war-missions-overlay" aria-hidden="true" />

      <header className="war-missions-top">
        <Link to="/" className="war-missions-brand" aria-label="MemeWarzone War Missions home">
          <img src="/logo.png" alt="MemeWarzone" />
        </Link>
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
            <p>
              Complete quests, earn XP, build streaks, recruit verified soldiers, and qualify for weekly prizes before the full Warzone opens.
            </p>
            <div className="war-hero-actions">
              <button type="button" className="war-primary" onClick={() => void signIn()} disabled={authing}>
                {authing ? 'Waiting for signature...' : profile ? 'Wallet connected' : 'Connect wallet'}
              </button>
              <Link to="/recruiter/portal" className="war-secondary">Recruiter sign in</Link>
            </div>
            {error ? <div className="war-alert">{error}</div> : null}
            {actionMessage ? <div className="war-success">{actionMessage}</div> : null}
          </div>

          <aside className="war-status-card">
            <div className="war-status-card__label">Identity status</div>
            <div className="war-status-card__title">{profile ? 'Wallet verified' : 'Wallet required'}</div>
            <p>{profile ? `Profile ${shorten(profile.walletAddress)} is active. Take the Oath is awarded through the XP ledger.` : 'Wallet is the primary identity. Social accounts and quest completions attach to the wallet profile.'}</p>
            <div className="war-checklist">
              <span className={profile ? 'war-checklist__done' : ''}>Wallet signature</span>
              <span>X account</span>
              <span>Telegram</span>
              <span>Discord</span>
            </div>
            <div className="war-badge-strip" aria-label="Unlocked badges">
              {unlockedBadges.length > 0 ? (
                unlockedBadges.slice(0, 5).map((badge) => (
                  <span className={`war-badge-dot war-badge-dot--${badge.rarity}`} title={badge.title} key={badge.slug}>
                    {badgeCode(badge)}
                  </span>
                ))
              ) : (
                <span className="war-badge-strip__empty">No badges unlocked yet</span>
              )}
            </div>
          </aside>
        </section>

        <section className="war-stats" aria-label="Mission stats">
          {stats.map((stat) => (
            <div className="war-stat" key={stat.label}>
              <div className="war-stat__label">{stat.label}</div>
              <div className="war-stat__value">{stat.value}</div>
              <div className="war-stat__help">{stat.help}</div>
            </div>
          ))}
        </section>

        <section className="war-panel war-badges-panel" aria-label="War Missions badges">
          <div className="war-section-head">
            <div>
              <div className="war-kicker">Badge cabinet</div>
              <h2>{badgeSummary.unlocked} / {badgeSummary.total} badges unlocked</h2>
            </div>
            <p>Badges are off-chain achievements synced from verified quests, active XP, streaks, and recruiter milestones.</p>
          </div>

          <div className="war-badge-groups">
            {badgeGroups.map((group) => (
              <section className="war-badge-group" key={group.type}>
                <div className="war-badge-group__head">
                  <h3>{group.label}</h3>
                  <span>{badgeSummary.byType[group.type].unlocked} / {badgeSummary.byType[group.type].total}</span>
                </div>
                <div className="war-badge-grid">
                  {group.badges.map((badge) => (
                    <article className={`war-badge-card ${badge.unlocked ? 'war-badge-card--unlocked' : ''}`} key={badge.slug}>
                      <div className={`war-badge-medallion war-badge-medallion--${badge.rarity}`}>
                        {badgeCode(badge)}
                      </div>
                      <div>
                        <div className="war-badge-card__title">{badge.title}</div>
                        <div className="war-badge-card__text">{badge.description}</div>
                        <div className="war-badge-card__meta">{badge.unlocked ? 'Unlocked' : 'Locked'} | {badge.rarity}</div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>

        {visibleCategories.length > 0 ? (
          <section className="war-panel" id="missions">
            <div className="war-section-head">
              <div>
                <div className="war-kicker">Quest board</div>
                <h2>{missionHeading}</h2>
              </div>
              <p>{loading ? 'Loading mission data...' : missionsData?.categories?.length ? 'Live mission data from Supabase.' : 'Local mission scaffold shown until Supabase responds.'}</p>
            </div>

            <div className="mission-grid">
              {visibleCategories.map((category) => (
                <article className="mission-card" key={category.title}>
                  <div className="mission-card__top">
                    <div>
                      <div className="mission-card__eyebrow">{category.eyebrow}</div>
                      <h3>{category.title}</h3>
                    </div>
                    <span>{category.accent}</span>
                  </div>
                  <p>{category.description}</p>
                  <div className="quest-list">
                    {category.quests.map((quest) => (
                      <div className="quest-row" key={quest.slug || quest.title}>
                        <div>
                          <div className="quest-row__title">{quest.title}</div>
                          <div className="quest-row__text">{quest.description}</div>
                        </div>
                        <div className="quest-row__meta">
                          <strong>{quest.xp}</strong>
                          <span className={`quest-status quest-status--${quest.status}`}>{statusLabel(quest.status)}</span>
                          <button
                            type="button"
                            className="quest-action"
                            disabled={quest.status === 'locked' || quest.status === 'verified' || actionBusy === quest.slug}
                            onClick={() => void runQuestAction(quest)}
                          >
                            {actionBusy === quest.slug ? 'Working...' : questActionLabel(quest)}
                          </button>
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
            <div className="war-section-head">
              <div>
                <div className="war-kicker">Rewards</div>
                <h2>Prize pools and winners</h2>
              </div>
              <p>Published pools and approved winners are pulled from the prize workflow.</p>
            </div>
            <div className="war-rewards-grid">
              <div className="war-rewards-column">
                <h3>Active pools</h3>
                {prizePools.length === 0 ? (
                  <div className="leaderboard-empty">No public prize pools yet.</div>
                ) : prizePools.slice(0, 6).map((pool) => (
                  <article className="war-reward-row" key={pool.id}>
                    <strong>{pool.period_type} | {pool.status}</strong>
                    <span>{pool.reward_asset || 'Reward'} {pool.reward_amount ? Number(pool.reward_amount).toLocaleString() : ''}</span>
                  </article>
                ))}
              </div>
              <div className="war-rewards-column">
                <h3>Winners</h3>
                {prizeWinners.length === 0 ? (
                  <div className="leaderboard-empty">No approved winners yet.</div>
                ) : prizeWinners.slice(0, 6).map((winner) => (
                  <article className="war-reward-row" key={winner.id}>
                    <strong>Rank #{winner.rank || '-'}</strong>
                    <span>{winner.wallet_address ? shorten(winner.wallet_address) : 'Wallet pending'} | {winner.status}</span>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="war-two-col" id="leaderboard">
          <div className="war-panel war-panel--tight">
            <div className="war-kicker">Leaderboard preview</div>
            <h2>Weekly front line</h2>
            {leaderboardRows.length === 0 ? (
              <div className="leaderboard-empty">No ranked soldiers yet. XP will be calculated from the active XP ledger.</div>
            ) : (
              <div className="leaderboard-list">
                {leaderboardRows.slice(0, 8).map((row) => (
                  <div className="leaderboard-row" key={row.userId}>
                    <span>#{row.rank}</span>
                    <strong>{row.displayName || shorten(row.walletAddress)}</strong>
                    <em>{row.xpTotal.toLocaleString()} XP</em>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="war-panel war-panel--tight">
            <div className="war-kicker">Pending review</div>
            <h2>Admin watchlist</h2>
            <div className="review-list">
              <span>High-XP Black Market submissions</span>
              <span>Recruiter applications</span>
              <span>X bio link checks</span>
              <span>Duplicate content flags</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

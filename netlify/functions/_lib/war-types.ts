export type WarUser = {
  id: string
  wallet_address: string
  display_name: string | null
  avatar_url: string | null
  role: 'user' | 'recruiter' | 'admin'
  risk_score: number
  is_banned: boolean
  created_at: string
  updated_at: string
}

export type WarProfile = {
  id: string
  walletAddress: string
  displayName: string | null
  avatarUrl: string | null
  role: WarUser['role']
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
  badges: WarProfileBadge[]
  badgeSummary: WarBadgeSummary
}

export type WarBadgeType = 'identity' | 'mission' | 'xp' | 'streak' | 'recruiter' | 'manual'

export type WarBadgeRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export type WarBadgeTemplate = {
  id: string
  slug: string
  title: string
  description: string | null
  type: WarBadgeType
  rarity: WarBadgeRarity
  icon_key: string
  criteria: Record<string, unknown>
  display_order: number
  active: boolean
  created_at: string
  updated_at: string
}

export type WarUserBadge = {
  id: string
  user_id: string
  badge_template_id: string
  source: 'auto' | 'admin' | 'system'
  reason: string | null
  metadata: Record<string, unknown>
  awarded_at: string
  awarded_by: string | null
  revoked_at: string | null
}

export type WarProfileBadge = {
  slug: string
  title: string
  description: string | null
  type: WarBadgeType
  rarity: WarBadgeRarity
  iconKey: string
  criteria: Record<string, unknown>
  displayOrder: number
  unlocked: boolean
  awardedAt: string | null
  source: WarUserBadge['source'] | null
  reason: string | null
}

export type WarBadgeSummary = {
  total: number
  unlocked: number
  byType: Record<WarBadgeType, { total: number; unlocked: number }>
}

export type WarQuestTemplate = {
  id: string
  category_id: string
  slug: string
  title: string
  description: string | null
  xp_reward: number
  verification_type: string
  repeatable: boolean
  max_completions_per_day: number | null
  max_completions_per_week: number | null
  cooldown_seconds: number | null
  active: boolean
  metadata: Record<string, unknown>
  created_at: string
}

export type WarQuestInstance = {
  id: string
  quest_template_id: string
  period_type: 'once' | 'daily' | 'weekly' | 'season'
  period_start: string | null
  period_end: string | null
  xp_reward: number
  active: boolean
  metadata: Record<string, unknown>
  created_at: string
}

export type WarQuestCompletion = {
  id: string
  user_id: string
  quest_instance_id: string
  status: 'started' | 'pending' | 'verified' | 'rejected' | 'revoked' | 'review' | 'expired'
  submitted_value: string | null
  verification_payload: Record<string, unknown>
  rejection_reason: string | null
  verified_at: string | null
  created_at: string
  updated_at: string
}

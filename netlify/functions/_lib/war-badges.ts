import { normalizeAddress } from './http'
import { supabaseGet, supabasePatch, supabasePost } from './supabase'
import type {
  WarBadgeSummary,
  WarBadgeTemplate,
  WarBadgeType,
  WarProfileBadge,
  WarQuestCompletion,
  WarQuestTemplate,
  WarUser,
  WarUserBadge,
} from './war-types'

type CategoryRow = {
  id: string
  slug: string
}

type BadgeState = {
  user: WarUser
  xpTotal: number
  completedQuestSlugs: Set<string>
  categoryQuestSlugs: Map<string, string[]>
  maxStreak: number
  verifiedRecruitCount: number
}

const badgeTypeOrder: WarBadgeType[] = ['identity', 'mission', 'xp', 'streak', 'recruiter', 'manual']

export async function getBadgeCatalog() {
  return supabaseGet<WarBadgeTemplate[]>('/rest/v1/wm_badge_templates?select=*&active=eq.true&order=display_order.asc')
}

async function getUserByWalletOrId(input: { userId?: string; walletAddress?: string }) {
  if (input.userId) {
    const rows = await supabaseGet<WarUser[]>(`/rest/v1/wm_users?select=*&id=eq.${encodeURIComponent(input.userId)}&limit=1`)
    return rows[0] || null
  }

  const walletAddress = normalizeAddress(input.walletAddress || '')
  if (!walletAddress) return null
  const rows = await supabaseGet<WarUser[]>(`/rest/v1/wm_users?select=*&wallet_address=ilike.${encodeURIComponent(walletAddress)}&limit=1`)
  return rows[0] || null
}

async function getXpTotal(userId: string) {
  const rows = await supabaseGet<{ amount: number }[]>(`/rest/v1/wm_xp_ledger?select=amount&user_id=eq.${encodeURIComponent(userId)}&status=eq.active`)
  return rows.reduce((total, row) => total + Number(row.amount || 0), 0)
}

async function getCompletedQuestSlugs(userId: string) {
  const completions = await supabaseGet<Pick<WarQuestCompletion, 'quest_instance_id'>[]>(`/rest/v1/wm_quest_completions?select=quest_instance_id&user_id=eq.${encodeURIComponent(userId)}&status=eq.verified`)
  if (completions.length === 0) return new Set<string>()

  const instanceIds = Array.from(new Set(completions.map((completion) => completion.quest_instance_id)))
  const instances = await supabaseGet<{ id: string; quest_template_id: string }[]>(`/rest/v1/wm_quest_instances?select=id,quest_template_id&id=in.(${instanceIds.join(',')})`)
  if (instances.length === 0) return new Set<string>()

  const templateIds = Array.from(new Set(instances.map((instance) => instance.quest_template_id)))
  const templates = await supabaseGet<Pick<WarQuestTemplate, 'id' | 'slug'>[]>(`/rest/v1/wm_quest_templates?select=id,slug&id=in.(${templateIds.join(',')})`)
  const slugByTemplateId = new Map(templates.map((template) => [template.id, template.slug]))
  return new Set(instances.map((instance) => slugByTemplateId.get(instance.quest_template_id)).filter((slug): slug is string => Boolean(slug)))
}

async function getCategoryQuestSlugs() {
  const [categories, templates] = await Promise.all([
    supabaseGet<CategoryRow[]>('/rest/v1/wm_quest_categories?select=id,slug&active=eq.true'),
    supabaseGet<Pick<WarQuestTemplate, 'category_id' | 'slug'>[]>('/rest/v1/wm_quest_templates?select=category_id,slug&active=eq.true'),
  ])
  const slugByCategoryId = new Map(categories.map((category) => [category.id, category.slug]))
  const categoryQuestSlugs = new Map<string, string[]>()

  for (const template of templates) {
    const categorySlug = slugByCategoryId.get(template.category_id)
    if (!categorySlug) continue
    categoryQuestSlugs.set(categorySlug, [...(categoryQuestSlugs.get(categorySlug) || []), template.slug])
  }

  return categoryQuestSlugs
}

async function getMaxStreak(userId: string) {
  const rows = await supabaseGet<{ streak_count: number }[]>(`/rest/v1/wm_daily_progress?select=streak_count&user_id=eq.${encodeURIComponent(userId)}&order=streak_count.desc&limit=1`)
  return Number(rows[0]?.streak_count || 0)
}

async function getVerifiedRecruitCount(userId: string) {
  const rows = await supabaseGet<{ id: string }[]>(`/rest/v1/wm_referral_attributions?select=id&recruiter_user_id=eq.${encodeURIComponent(userId)}&status=in.(verified,locked)`)
  return rows.length
}

async function buildBadgeState(userId: string): Promise<BadgeState | null> {
  const user = await getUserByWalletOrId({ userId })
  if (!user) return null

  const [xpTotal, completedQuestSlugs, categoryQuestSlugs, maxStreak, verifiedRecruitCount] = await Promise.all([
    getXpTotal(user.id),
    getCompletedQuestSlugs(user.id),
    getCategoryQuestSlugs(),
    getMaxStreak(user.id),
    getVerifiedRecruitCount(user.id),
  ])

  return {
    user,
    xpTotal,
    completedQuestSlugs,
    categoryQuestSlugs,
    maxStreak,
    verifiedRecruitCount,
  }
}

function numberCriteria(criteria: Record<string, unknown>, key: string) {
  const value = criteria[key]
  return typeof value === 'number' ? value : Number(value || 0)
}

function stringCriteria(criteria: Record<string, unknown>, key: string) {
  const value = criteria[key]
  return typeof value === 'string' ? value : ''
}

function stringListCriteria(criteria: Record<string, unknown>, key: string) {
  const value = criteria[key]
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

function matchesBadgeCriteria(template: WarBadgeTemplate, state: BadgeState) {
  const criteria = template.criteria || {}

  const requiredQuestSlugs = stringListCriteria(criteria, 'quest_slugs')
  if (requiredQuestSlugs.length > 0 && !requiredQuestSlugs.every((slug) => state.completedQuestSlugs.has(slug))) return false

  const categorySlug = stringCriteria(criteria, 'category_slug')
  if (categorySlug) {
    const categorySlugs = state.categoryQuestSlugs.get(categorySlug) || []
    const completedInCategory = categorySlugs.filter((slug) => state.completedQuestSlugs.has(slug)).length
    if (criteria.all_category_quests === true && (categorySlugs.length === 0 || completedInCategory < categorySlugs.length)) return false
    const minVerified = numberCriteria(criteria, 'min_verified')
    if (minVerified > 0 && completedInCategory < minVerified) return false
  }

  const xpMin = numberCriteria(criteria, 'xp_min')
  if (xpMin > 0 && state.xpTotal < xpMin) return false

  const streakMin = numberCriteria(criteria, 'streak_min')
  if (streakMin > 0 && state.maxStreak < streakMin) return false

  const role = stringCriteria(criteria, 'role')
  if (role && state.user.role !== role) return false

  const verifiedRecruitsMin = numberCriteria(criteria, 'verified_recruits_min')
  if (verifiedRecruitsMin > 0 && state.verifiedRecruitCount < verifiedRecruitsMin) return false

  return true
}

export async function syncBadgesForUser(userId: string) {
  const [templates, state, existingRows] = await Promise.all([
    getBadgeCatalog(),
    buildBadgeState(userId),
    supabaseGet<WarUserBadge[]>(`/rest/v1/wm_user_badges?select=*&user_id=eq.${encodeURIComponent(userId)}`),
  ])

  if (!state) return { awarded: [], revoked: [] }

  const eligibleTemplateIds = new Set(templates.filter((template) => matchesBadgeCriteria(template, state)).map((template) => template.id))
  const existingByTemplateId = new Map(existingRows.map((row) => [row.badge_template_id, row]))
  const now = new Date().toISOString()
  const awarded: string[] = []
  const revoked: string[] = []

  const inserts = templates
    .filter((template) => eligibleTemplateIds.has(template.id) && !existingByTemplateId.has(template.id))
    .map((template) => ({
      user_id: userId,
      badge_template_id: template.id,
      source: 'auto',
      reason: 'badge_sync',
      metadata: { badge_slug: template.slug },
      awarded_at: now,
    }))

  if (inserts.length > 0) {
    await supabasePost('/rest/v1/wm_user_badges', inserts)
    awarded.push(...inserts.map((row) => String(row.metadata.badge_slug)))
  }

  for (const template of templates) {
    const existing = existingByTemplateId.get(template.id)
    if (!existing) continue

    if (eligibleTemplateIds.has(template.id) && existing.revoked_at) {
      await supabasePatch(`/rest/v1/wm_user_badges?id=eq.${existing.id}`, {
        source: existing.source === 'admin' ? existing.source : 'auto',
        reason: existing.source === 'admin' ? existing.reason : 'badge_sync',
        metadata: { ...(existing.metadata || {}), badge_slug: template.slug, resynced_at: now },
        revoked_at: null,
      })
      awarded.push(template.slug)
    }

    if (!eligibleTemplateIds.has(template.id) && existing.source === 'auto' && !existing.revoked_at) {
      await supabasePatch(`/rest/v1/wm_user_badges?id=eq.${existing.id}`, {
        reason: 'badge_sync_revoked',
        metadata: { ...(existing.metadata || {}), badge_slug: template.slug, revoked_by_sync_at: now },
        revoked_at: now,
      })
      revoked.push(template.slug)
    }
  }

  return { awarded, revoked }
}

export async function getBadgesForUser(userId?: string | null, sync = false) {
  if (userId && sync) await syncBadgesForUser(userId)

  const [templates, userBadges] = await Promise.all([
    getBadgeCatalog(),
    userId ? supabaseGet<WarUserBadge[]>(`/rest/v1/wm_user_badges?select=*&user_id=eq.${encodeURIComponent(userId)}`) : Promise.resolve([]),
  ])

  const activeBadgeByTemplateId = new Map(
    userBadges
      .filter((badge) => !badge.revoked_at)
      .map((badge) => [badge.badge_template_id, badge]),
  )

  const badges: WarProfileBadge[] = templates.map((template) => {
    const userBadge = activeBadgeByTemplateId.get(template.id)
    return {
      slug: template.slug,
      title: template.title,
      description: template.description,
      type: template.type,
      rarity: template.rarity,
      iconKey: template.icon_key,
      criteria: template.criteria || {},
      displayOrder: template.display_order,
      unlocked: Boolean(userBadge),
      awardedAt: userBadge?.awarded_at || null,
      source: userBadge?.source || null,
      reason: userBadge?.reason || null,
    }
  })

  return {
    badges,
    badgeSummary: summarizeBadges(badges),
  }
}

export function summarizeBadges(badges: WarProfileBadge[]): WarBadgeSummary {
  const byType = badgeTypeOrder.reduce((acc, type) => {
    acc[type] = { total: 0, unlocked: 0 }
    return acc
  }, {} as WarBadgeSummary['byType'])

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

export async function awardBadgeManually(input: {
  userId?: string
  walletAddress?: string
  badgeSlug: string
  reason: string
  adminUserId: string
}) {
  const user = await getUserByWalletOrId(input)
  if (!user) throw new Error('Target War Missions user was not found.')

  const templates = await supabaseGet<WarBadgeTemplate[]>(`/rest/v1/wm_badge_templates?select=*&slug=eq.${encodeURIComponent(input.badgeSlug)}&active=eq.true&limit=1`)
  const template = templates[0]
  if (!template) throw new Error('Badge template was not found.')

  const existingRows = await supabaseGet<WarUserBadge[]>(`/rest/v1/wm_user_badges?select=*&user_id=eq.${encodeURIComponent(user.id)}&badge_template_id=eq.${template.id}&limit=1`)
  const existing = existingRows[0]
  const now = new Date().toISOString()
  const metadata = { badge_slug: template.slug, manual_action_at: now }

  if (existing) {
    const rows = await supabasePatch<WarUserBadge[]>(`/rest/v1/wm_user_badges?id=eq.${existing.id}`, {
      source: 'admin',
      reason: input.reason,
      metadata,
      awarded_by: input.adminUserId,
      awarded_at: now,
      revoked_at: null,
    })
    return { user, badge: template, userBadge: rows[0] || existing }
  }

  const rows = await supabasePost<WarUserBadge[]>('/rest/v1/wm_user_badges', {
    user_id: user.id,
    badge_template_id: template.id,
    source: 'admin',
    reason: input.reason,
    metadata,
    awarded_by: input.adminUserId,
    awarded_at: now,
  })
  return { user, badge: template, userBadge: rows[0] }
}

export async function revokeBadgeManually(input: {
  userId?: string
  walletAddress?: string
  badgeSlug: string
  reason: string
  adminUserId: string
}) {
  const user = await getUserByWalletOrId(input)
  if (!user) throw new Error('Target War Missions user was not found.')

  const templates = await supabaseGet<WarBadgeTemplate[]>(`/rest/v1/wm_badge_templates?select=*&slug=eq.${encodeURIComponent(input.badgeSlug)}&limit=1`)
  const template = templates[0]
  if (!template) throw new Error('Badge template was not found.')

  const existingRows = await supabaseGet<WarUserBadge[]>(`/rest/v1/wm_user_badges?select=*&user_id=eq.${encodeURIComponent(user.id)}&badge_template_id=eq.${template.id}&limit=1`)
  const existing = existingRows[0]
  if (!existing) throw new Error('User does not have this badge yet.')

  const now = new Date().toISOString()
  const rows = await supabasePatch<WarUserBadge[]>(`/rest/v1/wm_user_badges?id=eq.${existing.id}`, {
    source: 'admin',
    reason: input.reason,
    metadata: { ...(existing.metadata || {}), badge_slug: template.slug, manual_revoked_at: now, manual_revoked_by: input.adminUserId },
    awarded_by: input.adminUserId,
    revoked_at: now,
  })

  return { user, badge: template, userBadge: rows[0] || existing }
}

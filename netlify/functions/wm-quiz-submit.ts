import { json, readBody } from './_lib/http'
import { readWarAuth, unauthorized } from './_lib/war-auth'
import { getTemplateBySlug } from './_lib/war-engine'
import { awardQuestForUser, buildWarProfile, getUserById } from './_lib/war-profile'
import { supabaseGet, supabasePost } from './_lib/supabase'
import { enforceRateLimit } from './_lib/rate-limit'
import { ensureCurrentQuestInstance } from './_lib/war-periods'

type QuizSubmitBody = {
  questSlug?: string
  answers?: Record<string, string>
}

type QuizQuestionRow = {
  id: string
  correct_answer_key: string
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' })

  const auth = readWarAuth(event)
  if (!auth) return unauthorized()

  try {
    const user = await getUserById(auth.userId)
    if (!user || user.wallet_address !== auth.address) return unauthorized('War Missions session is no longer valid.')
    if (user.is_banned) return json(403, { error: 'This wallet is excluded from War Missions.' })

    const body = readBody<QuizSubmitBody>(event) || {}
    const questSlug = String(body.questSlug || '').trim()
    const submittedAnswers = body.answers || {}
    if (!questSlug) return json(400, { error: 'Provide questSlug.' })

    const template = await getTemplateBySlug(questSlug)
    if (!template) return json(404, { error: 'Quest was not found.' })
    if (template.verification_type !== 'docs_quiz') return json(400, { error: 'This quest does not use a quiz.' })
    await enforceRateLimit({
      action: 'quiz_submit',
      key: `${user.id}:${questSlug}`,
      limit: 8,
      windowSeconds: 600,
    })

    const instance = await ensureCurrentQuestInstance(template)

    const recentFailed = await supabaseGet<{ id: string; created_at: string; passed: boolean }[]>(`/rest/v1/wm_quiz_attempts?select=id,created_at,passed&user_id=eq.${user.id}&quest_instance_id=eq.${instance.id}&order=created_at.desc&limit=1`)
    const cooldownSeconds = Number(template.cooldown_seconds || 0)
    if (recentFailed[0] && !recentFailed[0].passed && cooldownSeconds > 0) {
      const nextAttemptAt = new Date(recentFailed[0].created_at).getTime() + cooldownSeconds * 1000
      if (Date.now() < nextAttemptAt) return json(429, { error: 'Quiz retry cooldown is still active.', nextAttemptAt: new Date(nextAttemptAt).toISOString() })
    }

    const questionIds = Object.keys(submittedAnswers)
    if (questionIds.length === 0) return json(400, { error: 'Submit quiz answers.' })

    const rows = await supabaseGet<QuizQuestionRow[]>(`/rest/v1/wm_quiz_questions?select=id,correct_answer_key&id=in.(${questionIds.join(',')})&quest_template_id=eq.${template.id}&active=eq.true`)
    const correctById = new Map(rows.map((row) => [row.id, row.correct_answer_key]))
    const score = questionIds.reduce((total, questionId) => total + (correctById.get(questionId) === submittedAnswers[questionId] ? 1 : 0), 0)
    const passScore = Number(template.metadata?.pass_score || 3)
    const passed = score >= passScore

    await supabasePost('/rest/v1/wm_quiz_attempts', {
      user_id: user.id,
      quest_instance_id: instance.id,
      score,
      passed,
      answers: submittedAnswers,
    })

    if (passed) {
      await awardQuestForUser(user.id, questSlug, 'docs_quiz_passed', { score, pass_score: passScore, question_count: questionIds.length })
    }

    const profile = await buildWarProfile(user)
    return json(200, { ok: true, passed, score, passScore, profile })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

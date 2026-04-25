import { json } from './_lib/http'
import { readWarAuth, unauthorized } from './_lib/war-auth'
import { getTemplateBySlug } from './_lib/war-engine'
import { getUserById } from './_lib/war-profile'
import { supabaseGet } from './_lib/supabase'

type QuizQuestionRow = {
  id: string
  question: string
  answers: Record<string, string>
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5)
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' })

  const auth = readWarAuth(event)
  if (!auth) return unauthorized()

  try {
    const user = await getUserById(auth.userId)
    if (!user || user.wallet_address !== auth.address) return unauthorized('War Missions session is no longer valid.')
    if (user.is_banned) return json(403, { error: 'This wallet is excluded from War Missions.' })

    const questSlug = String(event.queryStringParameters?.questSlug || '').trim()
    if (!questSlug) return json(400, { error: 'Provide questSlug.' })

    const template = await getTemplateBySlug(questSlug)
    if (!template) return json(404, { error: 'Quest was not found.' })
    if (template.verification_type !== 'docs_quiz') return json(400, { error: 'This quest does not use a quiz.' })

    const rows = await supabaseGet<QuizQuestionRow[]>(`/rest/v1/wm_quiz_questions?select=id,question,answers&quest_template_id=eq.${template.id}&active=eq.true`)
    const questions = shuffle(rows).slice(0, 4).map((row) => ({
      id: row.id,
      question: row.question,
      answers: shuffle(Object.entries(row.answers || {}).map(([key, text]) => ({ key, text }))),
    }))

    return json(200, { ok: true, questSlug, questions, passScore: Number(template.metadata?.pass_score || 3) })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

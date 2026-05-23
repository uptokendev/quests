const DEFAULT_API_BASE_URL = 'https://memewarzonefrontend-production.up.railway.app'

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  }
}

function buildQuizTemplates(categories) {
  return categories
    .flatMap((category) => Array.isArray(category?.quests) ? category.quests : [])
    .filter((quest) => quest && quest.verificationType === 'docs_quiz')
    .map((quest) => ({
      id: quest.templateId || quest.slug,
      slug: quest.slug,
      title: quest.title,
      description: quest.description || '',
      xpReward: Number(quest.xpReward || 0),
      active: typeof quest?.metadata?.active === 'boolean' ? quest.metadata.active : true,
      metadata: quest.metadata && typeof quest.metadata === 'object' ? quest.metadata : {},
    }))
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return json(
      405,
      {
        ok: false,
        error: 'Quiz template updates are not available from this deploy yet.',
      },
      { Allow: 'GET' },
    )
  }

  const apiBaseUrl = process.env.WM_API_BASE_URL || DEFAULT_API_BASE_URL

  try {
    const upstream = await fetch(`${apiBaseUrl}/api/wm-quests-list`, {
      headers: {
        Accept: 'application/json',
        ...(event.headers.cookie ? { Cookie: event.headers.cookie } : {}),
      },
    })

    const payload = await upstream.json().catch(() => ({}))
    if (!upstream.ok || !payload?.ok || !Array.isArray(payload?.categories)) {
      return json(upstream.status || 502, {
        ok: false,
        error: payload?.error || 'Quiz templates unavailable.',
      })
    }

    return json(200, {
      ok: true,
      templates: buildQuizTemplates(payload.categories),
    })
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : 'Quiz templates unavailable.',
    })
  }
}

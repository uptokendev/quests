const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const SERVICE_ROLE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || '',
)

function requireConfig() {
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL is not configured.')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.')
}

function buildUrl(table, query = {}) {
  requireConfig()
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  }
  return url
}

async function request(table, { method = 'GET', query = {}, body, prefer } = {}) {
  const response = await fetch(buildUrl(table, query), {
    method,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      ...(prefer ? { prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    const message = data?.message || data?.error || `Supabase ${method} ${table} failed (${response.status})`
    const error = new Error(message)
    error.statusCode = response.status
    error.details = data
    throw error
  }

  return data
}

export async function selectRows(table, query = {}) {
  return request(table, { query })
}

export async function selectOne(table, query = {}) {
  const rows = await selectRows(table, { ...query, limit: query.limit || '1' })
  return Array.isArray(rows) ? rows[0] || null : null
}

export async function insertRow(table, body) {
  const rows = await request(table, {
    method: 'POST',
    body,
    prefer: 'return=representation',
  })
  return Array.isArray(rows) ? rows[0] || null : rows
}

export async function updateRows(table, query, body) {
  return request(table, {
    method: 'PATCH',
    query,
    body,
    prefer: 'return=representation',
  })
}

export async function updateOne(table, query, body) {
  const rows = await updateRows(table, query, body)
  return Array.isArray(rows) ? rows[0] || null : rows
}

export function getSupabaseConfig() {
  const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  const SUPABASE_SERVICE_ROLE_KEY = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || '',
  )

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase is not configured yet.')
  }

  return { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY }
}

function authHeaders() {
  const { SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig()
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  }
}

function buildPath(table, query = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value))
  }
  const qs = params.toString()
  return `/rest/v1/${table}${qs ? `?${qs}` : ''}`
}

export async function supabaseGet(path) {
  const { SUPABASE_URL } = getSupabaseConfig()
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'GET',
    headers: authHeaders(),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || 'Database read failed.')
  }

  return await response.json()
}

export async function supabasePost(path, body) {
  const { SUPABASE_URL } = getSupabaseConfig()
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || 'Database insert failed.')
  }

  return await response.json().catch(() => [])
}

export async function supabasePatch(path, body) {
  const { SUPABASE_URL } = getSupabaseConfig()
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'PATCH',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || 'Database update failed.')
  }

  return await response.json().catch(() => [])
}

export async function supabaseDelete(path) {
  const { SUPABASE_URL } = getSupabaseConfig()
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'DELETE',
    headers: {
      ...authHeaders(),
      Prefer: 'return=representation',
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || 'Database delete failed.')
  }

  return await response.json().catch(() => [])
}

export async function selectRows(table, query = {}) {
  return supabaseGet(buildPath(table, query))
}

export async function selectOne(table, query = {}) {
  const rows = await selectRows(table, { ...query, limit: query.limit || '1' })
  return Array.isArray(rows) ? rows[0] || null : null
}

export async function insertRow(table, body) {
  const rows = await supabasePost(buildPath(table), body)
  return Array.isArray(rows) ? rows[0] || null : rows
}

export async function updateRows(table, query, body) {
  return supabasePatch(buildPath(table, query), body)
}

export async function updateOne(table, query, body) {
  const rows = await updateRows(table, query, body)
  return Array.isArray(rows) ? rows[0] || null : rows
}

export function getSupabaseConfig() {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase is not configured yet.')
  }

  return {
    SUPABASE_URL: SUPABASE_URL.replace(/\/$/, ''),
    SUPABASE_SERVICE_ROLE_KEY,
  }
}

function authHeaders() {
  const { SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig()
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  }
}

export async function supabaseGet<T>(path: string) {
  const { SUPABASE_URL } = getSupabaseConfig()
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'GET',
    headers: authHeaders(),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || 'Database read failed.')
  }

  return (await response.json()) as T
}

export async function supabasePost<T = unknown>(path: string, body: Record<string, unknown> | Record<string, unknown>[]) {
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

  return (await response.json().catch(() => [])) as T
}

export async function supabasePatch<T = unknown>(path: string, body: Record<string, unknown>) {
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

  return (await response.json().catch(() => [])) as T
}

export async function supabaseDelete<T = unknown>(path: string) {
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

  return (await response.json().catch(() => [])) as T
}

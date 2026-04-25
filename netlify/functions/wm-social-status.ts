import { json } from './_lib/http'
import { readWarAuth } from './_lib/war-auth'
import { supabaseGet } from './_lib/supabase'
import { buildWarProfile, getUserById } from './_lib/war-profile'

type SocialAccountRow = {
  provider: 'x' | 'discord' | 'telegram'
  provider_user_id: string
  username: string | null
  last_verified_at: string | null
}

function isXOAuthConfigured() {
  return Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET && process.env.X_REDIRECT_URI)
}

export const handler = async (event: any) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' })

  const auth = readWarAuth(event)
  if (!auth) {
    return json(200, {
      ok: true,
      authenticated: false,
      xOAuthConfigured: isXOAuthConfigured(),
      profile: null,
      accounts: [],
    })
  }

  try {
    const user = await getUserById(auth.userId)
    if (!user || user.wallet_address !== auth.address) {
      return json(200, {
        ok: true,
        authenticated: false,
        xOAuthConfigured: isXOAuthConfigured(),
        profile: null,
        accounts: [],
      })
    }

    const accounts = await supabaseGet<SocialAccountRow[]>(`/rest/v1/wm_social_accounts?select=provider,provider_user_id,username,last_verified_at&user_id=eq.${encodeURIComponent(user.id)}&order=provider.asc`)
    const profile = await buildWarProfile(user)

    return json(200, {
      ok: true,
      authenticated: true,
      xOAuthConfigured: isXOAuthConfigured(),
      profile,
      accounts: accounts.map((account) => ({
        provider: account.provider,
        providerUserId: account.provider_user_id,
        username: account.username || account.provider_user_id,
        lastVerifiedAt: account.last_verified_at,
        createdAt: null,
      })),
    })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}

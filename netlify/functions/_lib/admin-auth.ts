import { normalizeAddress } from './http'

export function getAdminWalletAllowlist() {
  return String(process.env.WAR_MISSIONS_ADMIN_WALLETS || '')
    .split(',')
    .map((wallet) => normalizeAddress(wallet))
    .filter(Boolean)
}

export function isAdminWallet(address: string) {
  const normalized = normalizeAddress(address)
  return getAdminWalletAllowlist().includes(normalized)
}

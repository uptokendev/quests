import { BrowserProvider } from 'ethers'

export type WalletType = 'metamask' | 'binance' | 'injected'

type Eip1193Request = {
  method: string
  params?: unknown[] | object
}

type Eip1193Provider = {
  request: (args: Eip1193Request) => Promise<unknown>
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
  providers?: Eip1193Provider[]
  selectedAddress?: string
  providerInfo?: { name?: string; rdns?: string }
  info?: { name?: string; rdns?: string }
  metadata?: { name?: string; rdns?: string }
  name?: string
  _walletName?: string
  rdns?: string
  _rdns?: string
  _metamask?: unknown
  isMetaMask?: boolean
  isBinance?: boolean
  isBinanceChain?: boolean
  isCryptoCom?: boolean
  isCoinbaseWallet?: boolean
  isTrust?: boolean
  isTrustWallet?: boolean
  isRabby?: boolean
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider
    BinanceChain?: Eip1193Provider
    binanceChain?: Eip1193Provider
  }
}

const SELECTED_WALLET_KEY = 'mwz:selected_wallet'
const DISCONNECTED_KEY = 'mwz:wallet:disconnected'
const LEGACY_CONNECTED_KEY = 'mwz_wallet_connected'

function normalizeHexAddress(value?: string | null): string {
  const v = String(value ?? '').trim()
  return /^0x[a-fA-F0-9]{40}$/.test(v) ? v.toLowerCase() : ''
}

function getStoredWalletType(): WalletType | null {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(SELECTED_WALLET_KEY)
  return stored === 'metamask' || stored === 'binance' || stored === 'injected' ? stored : null
}

function clearWarRoomSessionCache() {
  if (typeof window === 'undefined') return
  try {
    const toDelete: string[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (!key) continue
      if (key.startsWith('mwz:warroom:') || key.startsWith('mwz:chat:') || key.startsWith('mwz:tokenchat:')) {
        toDelete.push(key)
      }
    }
    toDelete.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    // Ignore storage errors from private mode or locked-down browsers.
  }
}

function getProviderMeta(provider: Eip1193Provider) {
  const info = provider.providerInfo ?? provider.info ?? provider.metadata ?? {}
  const name = String(info.name ?? provider.name ?? provider._walletName ?? '').toLowerCase()
  const rdns = String(info.rdns ?? provider.rdns ?? provider._rdns ?? '').toLowerCase()
  return { name, rdns }
}

function isLikelyBinance(provider: Eip1193Provider) {
  const { name, rdns } = getProviderMeta(provider)
  return Boolean(provider.isBinance || provider.isBinanceChain || name.includes('binance') || rdns.includes('binance'))
}

function isLikelyCryptoDotCom(provider: Eip1193Provider) {
  const { name, rdns } = getProviderMeta(provider)
  return Boolean(provider.isCryptoCom || name.includes('crypto.com') || name.includes('defi wallet') || rdns.includes('crypto'))
}

function isLikelyCoinbase(provider: Eip1193Provider) {
  const { name, rdns } = getProviderMeta(provider)
  return Boolean(provider.isCoinbaseWallet || name.includes('coinbase') || rdns.includes('coinbase'))
}

function isLikelyTrust(provider: Eip1193Provider) {
  const { name, rdns } = getProviderMeta(provider)
  return Boolean(provider.isTrust || provider.isTrustWallet || name.includes('trust') || rdns.includes('trust'))
}

function isLikelyRabby(provider: Eip1193Provider) {
  const { name, rdns } = getProviderMeta(provider)
  return Boolean(provider.isRabby || name.includes('rabby') || rdns.includes('rabby'))
}

function isAllowedMetaMaskFamily(provider: Eip1193Provider) {
  if (!provider || typeof provider.request !== 'function') return false
  if (isLikelyBinance(provider) || isLikelyCryptoDotCom(provider) || isLikelyCoinbase(provider) || isLikelyTrust(provider)) {
    return false
  }
  const { name, rdns } = getProviderMeta(provider)
  return Boolean(provider.isMetaMask || provider._metamask || isLikelyRabby(provider) || name.includes('metamask') || rdns.includes('metamask'))
}

function dedupeProviders(candidates: Array<Eip1193Provider | undefined>) {
  const seen = new Set<Eip1193Provider>()
  const out: Eip1193Provider[] = []
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate) || typeof candidate.request !== 'function') continue
    seen.add(candidate)
    out.push(candidate)
  }
  return out
}

function getInjectedProviders() {
  if (typeof window === 'undefined') return []
  const ethereumProviders = Array.isArray(window.ethereum?.providers) ? window.ethereum.providers : []
  const providers = dedupeProviders([
    ...ethereumProviders,
    window.ethereum,
    window.BinanceChain,
    window.binanceChain,
  ])

  providers.sort((a, b) => {
    const score = (provider: Eip1193Provider) => {
      if (isLikelyBinance(provider)) return 50
      if (isAllowedMetaMaskFamily(provider) && !isLikelyRabby(provider)) return 40
      if (isLikelyRabby(provider)) return 35
      if (isLikelyCoinbase(provider)) return 20
      if (isLikelyCryptoDotCom(provider)) return 10
      return 0
    }
    return score(b) - score(a)
  })

  return providers
}

function pickInjected(wallet: WalletType | undefined, preferredType?: WalletType | null) {
  const target = wallet ?? preferredType ?? undefined
  const providers = getInjectedProviders()
  if (!providers.length) return null

  if (target === 'metamask') {
    return providers.find((provider) => isAllowedMetaMaskFamily(provider) && !isLikelyRabby(provider))
      ?? providers.find((provider) => isAllowedMetaMaskFamily(provider))
      ?? null
  }

  if (target === 'binance') {
    return providers.find((provider) => isLikelyBinance(provider)) ?? null
  }

  if (target === 'injected') {
    return providers.find((provider) => !isLikelyBinance(provider)) ?? providers[0] ?? null
  }

  return null
}

function resolveProvider(wallet?: WalletType) {
  const storedType = getStoredWalletType()
  const requestedType = wallet ?? storedType ?? 'injected'
  const selected =
    pickInjected(requestedType) ??
    (!wallet && requestedType !== 'injected' ? pickInjected('injected') : null) ??
    (!wallet ? pickInjected('metamask') ?? pickInjected('binance') : null)

  return { selected, requestedType }
}

async function choosePrimaryAccount(selectedProvider: Eip1193Provider, accounts: string[]) {
  const normalized = accounts.map((account) => normalizeHexAddress(account)).filter(Boolean)
  const selectedAddress = normalizeHexAddress(selectedProvider.selectedAddress)
  if (selectedAddress && normalized.includes(selectedAddress)) return selectedAddress

  try {
    const fromEthAccounts = await selectedProvider.request({ method: 'eth_accounts' })
    const active = Array.isArray(fromEthAccounts)
      ? fromEthAccounts.map((account) => normalizeHexAddress(String(account))).filter(Boolean)
      : []
    if (selectedAddress && active.includes(selectedAddress)) return selectedAddress
    if (active[0]) return active[0]
  } catch {
    // Continue with the account returned by eth_requestAccounts.
  }

  return normalized[0] ?? ''
}

export async function connectWallet(wallet?: WalletType) {
  if (typeof window === 'undefined') throw new Error('Wallet connect is only available in the browser.')

  const { selected, requestedType } = resolveProvider(wallet)
  if (!selected) {
    throw new Error('No matching wallet found. Please install MetaMask, Rabby, Binance Wallet, or another BSC-compatible EVM wallet.')
  }

  if (requestedType === 'metamask') {
    try {
      await selected.request({
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }],
      })
    } catch {
      // Some injected wallets do not support this permission API; eth_requestAccounts still handles connection.
    }
  }

  const accounts = await selected.request({ method: 'eth_requestAccounts' })
  const chosen = await choosePrimaryAccount(selected, Array.isArray(accounts) ? accounts.map(String) : [])
  if (!chosen) throw new Error('No wallet account returned.')

  const provider = new BrowserProvider(selected)
  const signer = await provider.getSigner(chosen)
  const network = await provider.getNetwork()

  window.localStorage.setItem(SELECTED_WALLET_KEY, requestedType)
  window.localStorage.removeItem(DISCONNECTED_KEY)
  window.localStorage.removeItem(LEGACY_CONNECTED_KEY)

  return {
    provider,
    signer,
    address: chosen,
    chainId: Number(network.chainId),
    walletType: requestedType,
  }
}

export async function disconnectWallet() {
  if (typeof window === 'undefined') return

  const { selected } = resolveProvider()
  if (selected?.request) {
    try {
      await selected.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }],
      })
    } catch {
      // Most injected wallets do not support revoking permissions programmatically.
    }
  }

  clearWarRoomSessionCache()
  window.localStorage.setItem(DISCONNECTED_KEY, '1')
  window.localStorage.removeItem(LEGACY_CONNECTED_KEY)
}

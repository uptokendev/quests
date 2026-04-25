import { BrowserProvider } from 'ethers'

export type WalletType =
  | 'metamask'
  | 'rabby'
  | 'coinbase'
  | 'binance'
  | 'trust'
  | 'okx'
  | 'phantom'
  | 'rainbow'
  | 'brave'
  | 'frame'
  | 'crypto-com'
  | 'injected'
  | (string & {})

type Eip1193Provider = {
  request: <T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<T>
  providers?: Eip1193Provider[]
  selectedAddress?: string | null
  providerInfo?: Record<string, unknown>
  info?: Record<string, unknown>
  metadata?: Record<string, unknown>
  name?: unknown
  _walletName?: unknown
  rdns?: unknown
  _rdns?: unknown
  isMetaMask?: boolean
  isBinance?: boolean
  isBinanceChain?: boolean
  isCryptoCom?: boolean
  isCoinbaseWallet?: boolean
  isTrust?: boolean
  isTrustWallet?: boolean
  isRabby?: boolean
  isOkxWallet?: boolean
  isOKExWallet?: boolean
  isPhantom?: boolean
  isBraveWallet?: boolean
  [key: string]: unknown
}

type Eip6963ProviderInfo = {
  uuid: string
  name: string
  icon: string
  rdns: string
}

type Eip6963ProviderDetail = {
  info: Eip6963ProviderInfo
  provider: Eip1193Provider
}

type DetectedWallet = {
  id: WalletType
  name: string
  description: string
  rdns: string
  icon?: string
  provider: Eip1193Provider
  source: 'eip6963' | 'legacy'
  score: number
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
const STYLE_ID = 'mwz-wallet-modal-styles'
const EIP6963_WALLETS = new Map<string, Eip6963ProviderDetail>()
let eip6963ListenerStarted = false

function normalizeHexAddress(value?: string | null): string {
  const v = String(value ?? '').trim()
  return /^0x[a-fA-F0-9]{40}$/.test(v) ? v.toLowerCase() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function nested(value: unknown, key: string): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value[key])) return {}
  return value[key]
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function getMeta(provider: Eip1193Provider, info?: Partial<Eip6963ProviderInfo>) {
  const providerInfo = nested(provider, 'providerInfo')
  const legacyInfo = nested(provider, 'info')
  const metadata = nested(provider, 'metadata')
  const name =
    info?.name ||
    asString(providerInfo.name) ||
    asString(legacyInfo.name) ||
    asString(metadata.name) ||
    asString(provider.name) ||
    asString(provider._walletName)
  const rdns =
    info?.rdns ||
    asString(providerInfo.rdns) ||
    asString(legacyInfo.rdns) ||
    asString(metadata.rdns) ||
    asString(provider.rdns) ||
    asString(provider._rdns)
  const icon = info?.icon || asString(providerInfo.icon) || asString(legacyInfo.icon) || asString(metadata.icon)
  return { name, rdns, icon, nameLower: name.toLowerCase(), rdnsLower: rdns.toLowerCase() }
}

function includesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle))
}

function sanitizeWalletId(value: string): WalletType {
  const sanitized = value
    .toLowerCase()
    .replace(/^com\./, '')
    .replace(/^io\./, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return (sanitized || 'injected') as WalletType
}

function classify(provider: Eip1193Provider, info?: Partial<Eip6963ProviderInfo>) {
  const meta = getMeta(provider, info)
  const name = meta.nameLower
  const rdns = meta.rdnsLower

  if (provider.isRabby || includesAny(name, ['rabby']) || includesAny(rdns, ['rabby'])) {
    return { id: 'rabby' as WalletType, name: meta.name || 'Rabby', description: 'Risk-aware EVM wallet with transaction previews.', score: 98 }
  }
  if (provider.isBinance || provider.isBinanceChain || includesAny(name, ['binance']) || includesAny(rdns, ['binance'])) {
    return { id: 'binance' as WalletType, name: meta.name || 'Binance Wallet', description: 'BNB Chain-native EVM wallet.', score: 96 }
  }
  if (provider.isCoinbaseWallet || includesAny(name, ['coinbase']) || includesAny(rdns, ['coinbase'])) {
    return { id: 'coinbase' as WalletType, name: meta.name || 'Coinbase Wallet', description: 'Coinbase self-custody EVM wallet.', score: 94 }
  }
  if (provider.isTrust || provider.isTrustWallet || includesAny(name, ['trust']) || includesAny(rdns, ['trust'])) {
    return { id: 'trust' as WalletType, name: meta.name || 'Trust Wallet', description: 'Mobile-first wallet with BNB Chain support.', score: 92 }
  }
  if (provider.isMetaMask || provider._metamask || includesAny(name, ['metamask']) || includesAny(rdns, ['metamask'])) {
    return { id: 'metamask' as WalletType, name: meta.name || 'MetaMask', description: 'Popular injected EVM browser wallet.', score: 90 }
  }
  if (provider.isOkxWallet || provider.isOKExWallet || includesAny(name, ['okx', 'okex']) || includesAny(rdns, ['okx', 'okex'])) {
    return { id: 'okx' as WalletType, name: meta.name || 'OKX Wallet', description: 'Multi-chain EVM wallet.', score: 88 }
  }
  if (provider.isPhantom || includesAny(name, ['phantom']) || includesAny(rdns, ['phantom'])) {
    return { id: 'phantom' as WalletType, name: meta.name || 'Phantom', description: 'Multi-chain wallet with EVM support.', score: 86 }
  }
  if (includesAny(name, ['rainbow']) || includesAny(rdns, ['rainbow'])) {
    return { id: 'rainbow' as WalletType, name: meta.name || 'Rainbow', description: 'Ethereum and EVM wallet.', score: 84 }
  }
  if (provider.isBraveWallet || includesAny(name, ['brave']) || includesAny(rdns, ['brave'])) {
    return { id: 'brave' as WalletType, name: meta.name || 'Brave Wallet', description: 'Built-in Brave browser wallet.', score: 82 }
  }
  if (includesAny(name, ['frame']) || includesAny(rdns, ['frame'])) {
    return { id: 'frame' as WalletType, name: meta.name || 'Frame', description: 'Desktop EVM wallet.', score: 80 }
  }
  if (provider.isCryptoCom || includesAny(name, ['crypto.com', 'defi wallet']) || includesAny(rdns, ['crypto'])) {
    return { id: 'crypto-com' as WalletType, name: meta.name || 'Crypto.com Wallet', description: 'Crypto.com DeFi EVM wallet.', score: 78 }
  }

  return {
    id: sanitizeWalletId(meta.rdns || meta.name || 'injected'),
    name: meta.name || 'Injected EVM Wallet',
    description: 'Detected EVM-compatible injected wallet.',
    score: 50,
  }
}

function dedupeProviders(candidates: Array<Eip1193Provider | null | undefined>) {
  const seen = new Set<Eip1193Provider>()
  const providers: Eip1193Provider[] = []
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate) || typeof candidate.request !== 'function') continue
    seen.add(candidate)
    providers.push(candidate)
  }
  return providers
}

function startEip6963Discovery() {
  if (typeof window === 'undefined' || eip6963ListenerStarted) return
  window.addEventListener('eip6963:announceProvider', (event: Event) => {
    const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail
    if (!detail?.provider || typeof detail.provider.request !== 'function') return
    const meta = getMeta(detail.provider, detail.info)
    const key = detail.info?.uuid || meta.rdns || meta.name || String(EIP6963_WALLETS.size + 1)
    EIP6963_WALLETS.set(key, detail)
  })
  eip6963ListenerStarted = true
}

function requestEip6963Providers() {
  if (typeof window === 'undefined') return
  startEip6963Discovery()
  window.dispatchEvent(new Event('eip6963:requestProvider'))
}

function legacyProviders() {
  if (typeof window === 'undefined') return []
  return dedupeProviders([
    ...(Array.isArray(window.ethereum?.providers) ? window.ethereum.providers : []),
    window.ethereum,
    window.BinanceChain,
    window.binanceChain,
  ])
}

function makeDetected(provider: Eip1193Provider, source: 'eip6963' | 'legacy', info?: Partial<Eip6963ProviderInfo>): DetectedWallet {
  const meta = getMeta(provider, info)
  const brand = classify(provider, info)
  return { ...brand, rdns: meta.rdns, icon: meta.icon, provider, source, score: brand.score + (source === 'eip6963' ? 8 : 0) }
}

function getDetectedWallets(): DetectedWallet[] {
  requestEip6963Providers()
  const eip6963 = Array.from(EIP6963_WALLETS.values()).map((detail) => makeDetected(detail.provider, 'eip6963', detail.info))
  const legacy = legacyProviders().map((provider) => makeDetected(provider, 'legacy'))
  const seenProviders = new Set<Eip1193Provider>()
  const seenKeys = new Set<string>()
  const seenIds = new Map<string, number>()
  const wallets: DetectedWallet[] = []

  for (const wallet of [...eip6963, ...legacy]) {
    if (seenProviders.has(wallet.provider)) continue
    const providerKey = wallet.rdns || `${wallet.name}:${wallet.source}`.toLowerCase()
    if (providerKey && seenKeys.has(providerKey) && wallet.source === 'legacy') continue
    const count = seenIds.get(wallet.id) ?? 0
    const id = count > 0 ? (`${wallet.id}-${count + 1}` as WalletType) : wallet.id
    seenProviders.add(wallet.provider)
    if (providerKey) seenKeys.add(providerKey)
    seenIds.set(wallet.id, count + 1)
    wallets.push({ ...wallet, id })
  }

  return wallets.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

function findWallet(walletId: WalletType | null | undefined) {
  const wallets = getDetectedWallets()
  if (!walletId) return wallets[0] ?? null
  return (
    wallets.find((wallet) => wallet.id === walletId) ||
    wallets.find((wallet) => wallet.id.startsWith(`${walletId}-`)) ||
    wallets.find((wallet) => classify(wallet.provider).id === walletId) ||
    null
  )
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function clearSessionCache() {
  try {
    const toDelete: string[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key?.startsWith('mwz:warroom:') || key?.startsWith('mwz:chat:') || key?.startsWith('mwz:tokenchat:')) toDelete.push(key)
    }
    toDelete.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    // Ignore storage errors.
  }
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `.mwz-wallet-modal{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.78);backdrop-filter:blur(14px);color:#f5f1e8}.mwz-wallet-modal__panel{position:relative;width:min(560px,100%);max-height:88vh;overflow:auto;border-radius:28px;border:1px solid rgba(246,211,124,.25);background:linear-gradient(180deg,rgba(18,14,16,.98),rgba(7,7,9,.96));box-shadow:0 30px 120px rgba(0,0,0,.7),0 0 0 1px rgba(240,106,26,.08)}.mwz-wallet-modal__header{padding:22px;border-bottom:1px solid rgba(246,211,124,.12)}.mwz-wallet-modal__eyebrow{display:inline-flex;margin-bottom:10px;border:1px solid rgba(246,211,124,.24);border-radius:999px;padding:6px 10px;color:#f6d37c;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;background:rgba(246,211,124,.08)}.mwz-wallet-modal__title{margin:0;font-size:26px;line-height:1.1}.mwz-wallet-modal__text{margin:9px 0 0;color:rgba(245,241,232,.72);line-height:1.55;font-size:14px}.mwz-wallet-modal__close{position:absolute;right:16px;top:16px;width:38px;height:38px;border-radius:999px;border:1px solid rgba(246,211,124,.18);color:rgba(245,241,232,.82);background:rgba(255,255,255,.04);cursor:pointer}.mwz-wallet-modal__body{padding:18px 22px 22px}.mwz-wallet-modal__row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.mwz-wallet-modal__status{color:rgba(245,241,232,.62);font-size:13px}.mwz-wallet-modal__refresh{min-height:36px;border-radius:12px;border:1px solid rgba(246,211,124,.18);color:rgba(245,241,232,.86);background:rgba(255,255,255,.04);cursor:pointer;padding:0 12px}.mwz-wallet-modal__list{display:grid;gap:10px}.mwz-wallet-modal__wallet{width:100%;display:flex;align-items:center;gap:12px;text-align:left;border-radius:20px;border:1px solid rgba(246,211,124,.16);background:rgba(255,255,255,.045);color:inherit;padding:14px;cursor:pointer;transition:transform .12s ease,border-color .12s ease,background .12s ease}.mwz-wallet-modal__wallet:hover{transform:translateY(-1px);border-color:rgba(246,211,124,.36);background:rgba(246,211,124,.08)}.mwz-wallet-modal__wallet:disabled,.mwz-wallet-modal__refresh:disabled,.mwz-wallet-modal__close:disabled{opacity:.6;cursor:wait;transform:none}.mwz-wallet-modal__icon{flex:0 0 auto;width:42px;height:42px;border-radius:16px;display:grid;place-items:center;border:1px solid rgba(246,211,124,.2);background:rgba(246,211,124,.1);color:#f6d37c;font-weight:900;overflow:hidden}.mwz-wallet-modal__icon img{width:100%;height:100%;object-fit:cover}.mwz-wallet-modal__name{font-weight:800}.mwz-wallet-modal__description{margin-top:3px;color:rgba(245,241,232,.6);font-size:13px;line-height:1.35}.mwz-wallet-modal__badge{margin-left:auto;border-radius:999px;border:1px solid rgba(246,211,124,.22);padding:4px 8px;color:#f6d37c;font-size:10px;letter-spacing:.1em;text-transform:uppercase}.mwz-wallet-modal__empty,.mwz-wallet-modal__directory{border-radius:18px;border:1px solid rgba(246,211,124,.14);background:rgba(255,255,255,.035);padding:14px;color:rgba(245,241,232,.72);font-size:14px;line-height:1.5}.mwz-wallet-modal__directory{margin-top:14px}.mwz-wallet-modal__directory a{color:#f6d37c;text-decoration:none;font-weight:800}`
  document.head.appendChild(style)
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const item = document.createElement(tag)
  if (className) item.className = className
  if (text) item.textContent = text
  return item
}

async function selectWalletInModal(): Promise<DetectedWallet> {
  injectStyles()
  requestEip6963Providers()
  await wait(250)

  return new Promise((resolve, reject) => {
    const overlay = node('div', 'mwz-wallet-modal')
    const panel = node('section', 'mwz-wallet-modal__panel')
    const header = node('div', 'mwz-wallet-modal__header')
    const close = node('button', 'mwz-wallet-modal__close', 'x') as HTMLButtonElement
    const body = node('div', 'mwz-wallet-modal__body')
    const status = node('div', 'mwz-wallet-modal__status')
    const refresh = node('button', 'mwz-wallet-modal__refresh', 'Refresh') as HTMLButtonElement
    const list = node('div', 'mwz-wallet-modal__list')
    const directory = node('div', 'mwz-wallet-modal__directory')

    const cleanup = () => {
      document.body.style.overflow = ''
      overlay.remove()
    }

    const render = () => {
      const wallets = getDetectedWallets()
      status.textContent = wallets.length ? `${wallets.length} wallet${wallets.length === 1 ? '' : 's'} detected` : 'No injected wallet detected yet'
      list.replaceChildren()

      if (!wallets.length) {
        list.appendChild(node('div', 'mwz-wallet-modal__empty', 'No wallet detected. Install an EVM wallet extension, unlock it, then refresh. On mobile, open MemeWarzone inside your wallet browser.'))
        return
      }

      wallets.forEach((wallet) => {
        const button = node('button', 'mwz-wallet-modal__wallet') as HTMLButtonElement
        button.type = 'button'
        const icon = node('div', 'mwz-wallet-modal__icon')
        if (wallet.icon) {
          const img = document.createElement('img')
          img.src = wallet.icon
          img.alt = ''
          img.onerror = () => {
            icon.textContent = wallet.name.slice(0, 1).toUpperCase() || 'W'
          }
          icon.appendChild(img)
        } else {
          icon.textContent = wallet.name.slice(0, 1).toUpperCase() || 'W'
        }
        const copy = node('div')
        copy.append(node('div', 'mwz-wallet-modal__name', wallet.name), node('div', 'mwz-wallet-modal__description', wallet.description))
        button.append(icon, copy, node('div', 'mwz-wallet-modal__badge', wallet.source === 'eip6963' ? 'detected' : 'legacy'))
        button.addEventListener('click', () => {
          cleanup()
          resolve(wallet)
        })
        list.appendChild(button)
      })
    }

    close.type = 'button'
    close.addEventListener('click', () => {
      cleanup()
      reject(new Error('Wallet connection cancelled.'))
    })
    refresh.type = 'button'
    refresh.addEventListener('click', async () => {
      requestEip6963Providers()
      await wait(350)
      render()
    })

    header.append(node('div', 'mwz-wallet-modal__eyebrow', '2026 wallet flow'), node('h2', 'mwz-wallet-modal__title', 'Connect a wallet'), node('p', 'mwz-wallet-modal__text', 'Pick an installed EVM wallet. MemeWarzone only requests your public address after you choose a wallet.'), close)
    const row = node('div', 'mwz-wallet-modal__row')
    row.append(status, refresh)
    directory.innerHTML = 'Need another wallet? Use trusted directories: <a href="https://www.bnbchain.org/en/wallets" target="_blank" rel="noreferrer">BNB Chain wallets</a> or <a href="https://ethereum.org/en/wallets/find-wallet/" target="_blank" rel="noreferrer">Ethereum wallet finder</a>.'
    body.append(row, list, directory)
    panel.append(header, body)
    overlay.appendChild(panel)
    document.body.style.overflow = 'hidden'
    document.body.appendChild(overlay)
    render()
  })
}

function isUserRejectedRequest(error: unknown) {
  if (!isRecord(error)) return false
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : ''
  return error.code === 4001 || message.includes('user rejected') || message.includes('user denied')
}

async function choosePrimaryAccount(provider: Eip1193Provider, accounts: string[]) {
  const normalized = accounts.map((account) => normalizeHexAddress(account)).filter(Boolean)
  const selectedAddress = normalizeHexAddress(provider.selectedAddress)
  if (selectedAddress && normalized.includes(selectedAddress)) return selectedAddress

  try {
    const active = normalizeAccounts(await provider.request({ method: 'eth_accounts' }))
    if (selectedAddress && active.includes(selectedAddress)) return selectedAddress
    if (active[0]) return active[0]
  } catch {
    // Use eth_requestAccounts response below.
  }

  return normalized[0] ?? ''
}

async function connectDetectedWallet(wallet: DetectedWallet) {
  try {
    await wallet.provider.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] })
  } catch (error) {
    if (isUserRejectedRequest(error)) throw error
  }

  const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' })
  const address = await choosePrimaryAccount(wallet.provider, normalizeAccounts(accounts))
  if (!address) throw new Error('No wallet account returned.')

  const provider = new BrowserProvider(wallet.provider)
  const signer = await provider.getSigner(address)
  const network = await provider.getNetwork()

  window.localStorage.setItem(SELECTED_WALLET_KEY, wallet.id)
  window.localStorage.removeItem(DISCONNECTED_KEY)
  window.localStorage.removeItem(LEGACY_CONNECTED_KEY)

  return { provider, signer, address, chainId: Number(network.chainId), walletType: wallet.id }
}

export async function connectWallet(wallet?: WalletType) {
  if (typeof window === 'undefined') throw new Error('Wallet connect is only available in the browser.')

  if (wallet) {
    requestEip6963Providers()
    await wait(250)
    const selected = findWallet(wallet)
    if (!selected) throw new Error('Wallet not detected. Install an EVM wallet or open MemeWarzone inside your wallet browser.')
    return connectDetectedWallet(selected)
  }

  const selected = await selectWalletInModal()
  return connectDetectedWallet(selected)
}

export async function disconnectWallet() {
  if (typeof window === 'undefined') return
  requestEip6963Providers()
  await wait(250)
  const storedType = window.localStorage.getItem(SELECTED_WALLET_KEY) as WalletType | null
  const selected = findWallet(storedType)?.provider

  if (selected) {
    try {
      await selected.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] })
    } catch {
      // Most injected wallets do not support explicit revoke.
    }
  }

  clearSessionCache()
  window.localStorage.setItem(DISCONNECTED_KEY, '1')
  window.localStorage.removeItem(LEGACY_CONNECTED_KEY)
}

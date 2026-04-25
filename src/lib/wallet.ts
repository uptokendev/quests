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

type Eip1193Request = {
  method: string
  params?: unknown[] | Record<string, unknown>
}

type Eip1193Provider = {
  request: <T = unknown>(args: Eip1193Request) => Promise<T>
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
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
  sortScore: number
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
const EIP6963_SUBSCRIBERS = new Set<() => void>()
let eip6963ListenerStarted = false

function normalizeHexAddress(value?: string | null): string {
  const v = String(value ?? '').trim()
  return /^0x[a-fA-F0-9]{40}$/.test(v) ? v.toLowerCase() : ''
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getNestedObject(value: unknown, key: string): Record<string, unknown> {
  if (!isObject(value)) return {}
  const nested = value[key]
  return isObject(nested) ? nested : {}
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function getFlag(provider: Eip1193Provider, key: string): boolean {
  return Boolean(provider[key])
}

function normalizeAccounts(accounts: unknown): string[] {
  if (!Array.isArray(accounts)) return []
  return accounts.map((account) => normalizeHexAddress(String(account))).filter(Boolean)
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

function getProviderMeta(provider: Eip1193Provider, info?: Partial<Eip6963ProviderInfo>) {
  const providerInfo = getNestedObject(provider, 'providerInfo')
  const legacyInfo = getNestedObject(provider, 'info')
  const metadata = getNestedObject(provider, 'metadata')

  const name =
    info?.name ||
    getString(providerInfo.name) ||
    getString(legacyInfo.name) ||
    getString(metadata.name) ||
    getString(provider.name) ||
    getString(provider._walletName)

  const rdns =
    info?.rdns ||
    getString(providerInfo.rdns) ||
    getString(legacyInfo.rdns) ||
    getString(metadata.rdns) ||
    getString(provider.rdns) ||
    getString(provider._rdns)

  return {
    name,
    nameLower: name.toLowerCase(),
    rdns,
    rdnsLower: rdns.toLowerCase(),
    icon: info?.icon || getString(providerInfo.icon) || getString(legacyInfo.icon) || getString(metadata.icon),
    uuid: info?.uuid || getString(providerInfo.uuid) || getString(legacyInfo.uuid),
  }
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

type WalletBrand = {
  id: WalletType
  name: string
  description: string
  score: number
}

function classifyWallet(provider: Eip1193Provider, info?: Partial<Eip6963ProviderInfo>): WalletBrand {
  const meta = getProviderMeta(provider, info)
  const { nameLower, rdnsLower } = meta

  if (getFlag(provider, 'isRabby') || includesAny(nameLower, ['rabby']) || includesAny(rdnsLower, ['rabby'])) {
    return { id: 'rabby', name: meta.name || 'Rabby', description: 'Risk-aware EVM wallet with transaction previews.', score: 98 }
  }

  if (getFlag(provider, 'isBinance') || getFlag(provider, 'isBinanceChain') || includesAny(nameLower, ['binance']) || includesAny(rdnsLower, ['binance'])) {
    return { id: 'binance', name: meta.name || 'Binance Wallet', description: 'BNB Chain-native EVM wallet.', score: 96 }
  }

  if (getFlag(provider, 'isCoinbaseWallet') || includesAny(nameLower, ['coinbase']) || includesAny(rdnsLower, ['coinbase'])) {
    return { id: 'coinbase', name: meta.name || 'Coinbase Wallet', description: 'Coinbase self-custody EVM wallet.', score: 94 }
  }

  if (getFlag(provider, 'isTrust') || getFlag(provider, 'isTrustWallet') || includesAny(nameLower, ['trust']) || includesAny(rdnsLower, ['trust'])) {
    return { id: 'trust', name: meta.name || 'Trust Wallet', description: 'Mobile-first wallet with BNB Chain support.', score: 92 }
  }

  if (getFlag(provider, 'isMetaMask') || getFlag(provider, '_metamask') || includesAny(nameLower, ['metamask']) || includesAny(rdnsLower, ['metamask'])) {
    return { id: 'metamask', name: meta.name || 'MetaMask', description: 'Popular injected EVM browser wallet.', score: 90 }
  }

  if (getFlag(provider, 'isOkxWallet') || getFlag(provider, 'isOKExWallet') || includesAny(nameLower, ['okx', 'okex']) || includesAny(rdnsLower, ['okx', 'okex'])) {
    return { id: 'okx', name: meta.name || 'OKX Wallet', description: 'Multi-chain EVM wallet.', score: 88 }
  }

  if (getFlag(provider, 'isPhantom') || includesAny(nameLower, ['phantom']) || includesAny(rdnsLower, ['phantom'])) {
    return { id: 'phantom', name: meta.name || 'Phantom', description: 'Multi-chain wallet with EVM support.', score: 86 }
  }

  if (includesAny(nameLower, ['rainbow']) || includesAny(rdnsLower, ['rainbow'])) {
    return { id: 'rainbow', name: meta.name || 'Rainbow', description: 'Ethereum and EVM wallet.', score: 84 }
  }

  if (getFlag(provider, 'isBraveWallet') || includesAny(nameLower, ['brave']) || includesAny(rdnsLower, ['brave'])) {
    return { id: 'brave', name: meta.name || 'Brave Wallet', description: 'Built-in Brave browser wallet.', score: 82 }
  }

  if (includesAny(nameLower, ['frame']) || includesAny(rdnsLower, ['frame'])) {
    return { id: 'frame', name: meta.name || 'Frame', description: 'Desktop EVM wallet.', score: 80 }
  }

  if (getFlag(provider, 'isCryptoCom') || includesAny(nameLower, ['crypto.com', 'defi wallet']) || includesAny(rdnsLower, ['crypto'])) {
    return { id: 'crypto-com', name: meta.name || 'Crypto.com Wallet', description: 'Crypto.com DeFi EVM wallet.', score: 78 }
  }

  const idSource = meta.rdns || meta.name || meta.uuid || 'injected'
  return {
    id: sanitizeWalletId(idSource),
    name: meta.name || 'Injected EVM Wallet',
    description: 'Detected EVM-compatible injected wallet.',
    score: 50,
  }
}

function dedupeProviders(candidates: Array<Eip1193Provider | null | undefined>) {
  const seen = new Set<Eip1193Provider>()
  const out: Eip1193Provider[] = []

  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate) || typeof candidate.request !== 'function') continue
    seen.add(candidate)
    out.push(candidate)
  }

  return out
}

function getLegacyInjectedProviders() {
  if (typeof window === 'undefined') return []
  return dedupeProviders([
    ...(Array.isArray(window.ethereum?.providers) ? window.ethereum.providers : []),
    window.ethereum,
    window.BinanceChain,
    window.binanceChain,
  ])
}

function startEip6963Discovery() {
  if (typeof window === 'undefined' || eip6963ListenerStarted) return

  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail
    if (!detail?.provider || typeof detail.provider.request !== 'function') return

    const meta = getProviderMeta(detail.provider, detail.info)
    const key = detail.info?.uuid || meta.rdns || meta.name || String(EIP6963_WALLETS.size + 1)
    EIP6963_WALLETS.set(key, detail)
    EIP6963_SUBSCRIBERS.forEach((subscriber) => subscriber())
  }

  window.addEventListener('eip6963:announceProvider', onAnnounce)
  eip6963ListenerStarted = true
}

function requestEip6963Providers() {
  if (typeof window === 'undefined') return
  startEip6963Discovery()

  try {
    window.dispatchEvent(new Event('eip6963:requestProvider'))
  } catch {
    // Ignore older browser event issues.
  }
}

function makeDetectedWallet(provider: Eip1193Provider, source: 'eip6963' | 'legacy', info?: Partial<Eip6963ProviderInfo>): DetectedWallet {
  const meta = getProviderMeta(provider, info)
  const brand = classifyWallet(provider, info)
  return {
    id: brand.id,
    name: brand.name,
    description: brand.description,
    rdns: meta.rdns,
    icon: meta.icon,
    provider,
    source,
    sortScore: brand.score + (source === 'eip6963' ? 8 : 0),
  }
}

function getDetectedWalletsSnapshot(): DetectedWallet[] {
  if (typeof window === 'undefined') return []

  requestEip6963Providers()

  const eip6963 = Array.from(EIP6963_WALLETS.values()).map((detail) => makeDetectedWallet(detail.provider, 'eip6963', detail.info))
  const legacy = getLegacyInjectedProviders().map((provider) => makeDetectedWallet(provider, 'legacy'))

  const seenProviders = new Set<Eip1193Provider>()
  const seenKeys = new Set<string>()
  const seenIds = new Map<string, number>()
  const wallets: DetectedWallet[] = []

  for (const wallet of [...eip6963, ...legacy]) {
    if (seenProviders.has(wallet.provider)) continue

    const providerKey = wallet.rdns || `${wallet.name}:${wallet.source}`.toLowerCase()
    if (providerKey && seenKeys.has(providerKey) && wallet.source === 'legacy') continue

    const existingIdCount = seenIds.get(wallet.id) ?? 0
    const id = existingIdCount > 0 ? (`${wallet.id}-${existingIdCount + 1}` as WalletType) : wallet.id

    seenProviders.add(wallet.provider)
    if (providerKey) seenKeys.add(providerKey)
    seenIds.set(wallet.id, existingIdCount + 1)
    wallets.push({ ...wallet, id })
  }

  return wallets.sort((a, b) => b.sortScore - a.sortScore || a.name.localeCompare(b.name))
}

function findDetectedWallet(walletId: WalletType | null | undefined) {
  const wallets = getDetectedWalletsSnapshot()
  if (!walletId) return wallets[0] ?? null

  return (
    wallets.find((wallet) => wallet.id === walletId) ||
    wallets.find((wallet) => wallet.id.startsWith(`${walletId}-`)) ||
    wallets.find((wallet) => classifyWallet(wallet.provider).id === walletId) ||
    null
  )
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function injectWalletModalStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
.mwz-wallet-modal { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(0,0,0,.78); backdrop-filter: blur(14px); color: #f5f1e8; }
.mwz-wallet-modal__panel { position: relative; width: min(560px, 100%); max-height: 88vh; overflow: auto; border-radius: 28px; border: 1px solid rgba(246,211,124,.25); background: linear-gradient(180deg, rgba(18,14,16,.98), rgba(7,7,9,.96)); box-shadow: 0 30px 120px rgba(0,0,0,.7), 0 0 0 1px rgba(240,106,26,.08); }
.mwz-wallet-modal__header { padding: 22px; border-bottom: 1px solid rgba(246,211,124,.12); }
.mwz-wallet-modal__eyebrow { display: inline-flex; margin-bottom: 10px; border: 1px solid rgba(246,211,124,.24); border-radius: 999px; padding: 6px 10px; color: #f6d37c; font-size: 11px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; background: rgba(246,211,124,.08); }
.mwz-wallet-modal__title { margin: 0; font-size: 26px; line-height: 1.1; }
.mwz-wallet-modal__text { margin: 9px 0 0; color: rgba(245,241,232,.72); line-height: 1.55; font-size: 14px; }
.mwz-wallet-modal__close { position: absolute; right: 16px; top: 16px; width: 38px; height: 38px; border-radius: 999px; border: 1px solid rgba(246,211,124,.18); color: rgba(245,241,232,.82); background: rgba(255,255,255,.04); cursor: pointer; }
.mwz-wallet-modal__body { padding: 18px 22px 22px; }
.mwz-wallet-modal__row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.mwz-wallet-modal__status { color: rgba(245,241,232,.62); font-size: 13px; }
.mwz-wallet-modal__refresh { min-height: 36px; border-radius: 12px; border: 1px solid rgba(246,211,124,.18); color: rgba(245,241,232,.86); background: rgba(255,255,255,.04); cursor: pointer; padding: 0 12px; }
.mwz-wallet-modal__list { display: grid; gap: 10px; }
.mwz-wallet-modal__wallet { width: 100%; display: flex; align-items: center; gap: 12px; text-align: left; border-radius: 20px; border: 1px solid rgba(246,211,124,.16); background: rgba(255,255,255,.045); color: inherit; padding: 14px; cursor: pointer; transition: transform .12s ease, border-color .12s ease, background .12s ease; }
.mwz-wallet-modal__wallet:hover { transform: translateY(-1px); border-color: rgba(246,211,124,.36); background: rgba(246,211,124,.08); }
.mwz-wallet-modal__wallet:disabled, .mwz-wallet-modal__refresh:disabled, .mwz-wallet-modal__close:disabled { opacity: .6; cursor: wait; transform: none; }
.mwz-wallet-modal__icon { flex: 0 0 auto; width: 42px; height: 42px; border-radius: 16px; display: grid; place-items: center; border: 1px solid rgba(246,211,124,.2); background: rgba(246,211,124,.1); color: #f6d37c; font-weight: 900; overflow: hidden; }
.mwz-wallet-modal__icon img { width: 100%; height: 100%; object-fit: cover; }
.mwz-wallet-modal__name { font-weight: 800; }
.mwz-wallet-modal__description { margin-top: 3px; color: rgba(245,241,232,.6); font-size: 13px; line-height: 1.35; }
.mwz-wallet-modal__badge { margin-left: auto; border-radius: 999px; border: 1px solid rgba(246,211,124,.22); padding: 4px 8px; color: #f6d37c; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; }
.mwz-wallet-modal__empty, .mwz-wallet-modal__error, .mwz-wallet-modal__directory { border-radius: 18px; border: 1px solid rgba(246,211,124,.14); background: rgba(255,255,255,.035); padding: 14px; color: rgba(245,241,232,.72); font-size: 14px; line-height: 1.5; }
.mwz-wallet-modal__error { display: none; margin-bottom: 12px; border-color: rgba(255,140,130,.35); color: #ffb0a8; background: rgba(255,140,130,.08); }
.mwz-wallet-modal__directory { margin-top: 14px; }
.mwz-wallet-modal__directory a { color: #f6d37c; text-decoration: none; font-weight: 800; }
  `.trim()
  document.head.appendChild(style)
}

function setChildren(parent: HTMLElement, children: Array<Node | string>) {
  parent.replaceChildren(...children.map((child) => (typeof child === 'string' ? document.createTextNode(child) : child)))
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (typeof text === 'string') node.textContent = text
  return node
}

async function chooseWalletFromModal(): Promise<DetectedWallet> {
  if (typeof document === 'undefined') throw new Error('Wallet connect is only available in the browser.')

  injectWalletModalStyles()
  requestEip6963Providers()
  await wait(250)

  return new Promise((resolve, reject) => {
    let busy = false
    const overlay = el('div', 'mwz-wallet-modal')
    const panel = el('section', 'mwz-wallet-modal__panel')
    const header = el('div', 'mwz-wallet-modal__header')
    const eyebrow = el('div', 'mwz-wallet-modal__eyebrow', '2026 wallet flow')
    const title = el('h2', 'mwz-wallet-modal__title', 'Connect a wallet')
    const text = el('p', 'mwz-wallet-modal__text', 'Pick an installed EVM wallet. MemeWarzone only requests your public address after you choose a wallet.')
    const close = el('button', 'mwz-wallet-modal__close', 'x')
    const body = el('div', 'mwz-wallet-modal__body')
    const errorBox = el('div', 'mwz-wallet-modal__error')
    const topRow = el('div', 'mwz-wallet-modal__row')
    const status = el('div', 'mwz-wallet-modal__status')
    const refresh = el('button', 'mwz-wallet-modal__refresh', 'Refresh')
    const list = el('div', 'mwz-wallet-modal__list')
    const directory = el('div', 'mwz-wallet-modal__directory')

    function cleanup() {
      document.body.style.overflow = ''
      overlay.remove()
    }

    function fail(message: string) {
      errorBox.textContent = message
      errorBox.style.display = 'block'
    }

    function setBusy(next: boolean) {
      busy = next
      close.toggleAttribute('disabled', busy)
      refresh.toggleAttribute('disabled', busy)
      list.querySelectorAll('button').forEach((button) => {
        ;(button as HTMLButtonElement).disabled = busy
      })
    }

    function walletInitial(name: string) {
      return name.trim().slice(0, 1).toUpperCase() || 'W'
    }

    function renderWallets() {
      const wallets = getDetectedWalletsSnapshot()
      status.textContent = wallets.length ? `${wallets.length} wallet${wallets.length === 1 ? '' : 's'} detected` : 'No injected wallet detected yet'
      errorBox.style.display = 'none'
      list.replaceChildren()

      if (!wallets.length) {
        const empty = el('div', 'mwz-wallet-modal__empty', 'No wallet detected. Install an EVM wallet extension, unlock it, then refresh. On mobile, open MemeWarzone inside your wallet browser.')
        list.appendChild(empty)
        return
      }

      wallets.forEach((wallet) => {
        const button = el('button', 'mwz-wallet-modal__wallet') as HTMLButtonElement
        button.type = 'button'

        const icon = el('div', 'mwz-wallet-modal__icon')
        if (wallet.icon) {
          const img = document.createElement('img')
          img.src = wallet.icon
          img.alt = ''
          img.onerror = () => {
            icon.textContent = walletInitial(wallet.name)
          }
          icon.appendChild(img)
        } else {
          icon.textContent = walletInitial(wallet.name)
        }

        const copy = el('div')
        const name = el('div', 'mwz-wallet-modal__name', wallet.name)
        const description = el('div', 'mwz-wallet-modal__description', wallet.description)
        setChildren(copy, [name, description])

        const badge = el('div', 'mwz-wallet-modal__badge', wallet.source === 'eip6963' ? 'detected' : 'legacy')
        setChildren(button, [icon, copy, badge])

        button.addEventListener('click', async () => {
          setBusy(true)
          errorBox.style.display = 'none'
          try {
            await connectDetectedWallet(wallet)
            cleanup()
            resolve(wallet)
          } catch (error) {
            fail(getErrorMessage(error))
            setBusy(false)
          }
        })

        list.appendChild(button)
      })
    }

    close.type = 'button'
    close.addEventListener('click', () => {
      if (busy) return
      cleanup()
      reject(new Error('Wallet connection cancelled.'))
    })

    refresh.type = 'button'
    refresh.addEventListener('click', async () => {
      if (busy) return
      requestEip6963Providers()
      await wait(350)
      renderWallets()
    })

    setChildren(header, [eyebrow, title, text, close])
    setChildren(topRow, [status, refresh])
    directory.innerHTML = 'Need another wallet? Use trusted directories: <a href="https://www.bnbchain.org/en/wallets" target="_blank" rel="noreferrer">BNB Chain wallets</a> or <a href="https://ethereum.org/en/wallets/find-wallet/" target="_blank" rel="noreferrer">Ethereum wallet finder</a>.'
    setChildren(body, [errorBox, topRow, list, directory])
    setChildren(panel, [header, body])
    setChildren(overlay, [panel])

    document.body.style.overflow = 'hidden'
    document.body.appendChild(overlay)
    renderWallets()
  })
}

function isUserRejectedRequest(error: unknown) {
  if (!isObject(error)) return false
  const code = error.code
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : ''
  return code === 4001 || message.includes('user rejected') || message.includes('user denied')
}

function getErrorMessage(error: unknown) {
  if (isObject(error) && typeof error.message === 'string') return error.message
  return String(error || 'Wallet connection failed.')
}

async function choosePrimaryAccount(selectedProvider: Eip1193Provider, accounts: string[]) {
  const normalized = accounts.map((account) => normalizeHexAddress(account)).filter(Boolean)
  const selectedAddress = normalizeHexAddress(selectedProvider.selectedAddress)
  if (selectedAddress && normalized.includes(selectedAddress)) return selectedAddress

  try {
    const fromEthAccounts = await selectedProvider.request<unknown>({ method: 'eth_accounts' })
    const active = normalizeAccounts(fromEthAccounts)
    if (selectedAddress && active.includes(selectedAddress)) return selectedAddress
    if (active[0]) return active[0]
  } catch {
    // Continue with the account returned by eth_requestAccounts.
  }

  return normalized[0] ?? ''
}

async function connectDetectedWallet(detectedWallet: DetectedWallet) {
  const selected = detectedWallet.provider

  try {
    await selected.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] })
  } catch (error) {
    if (isUserRejectedRequest(error)) throw error
    // Some injected wallets do not support this permission API. eth_requestAccounts is the fallback.
  }

  const accounts = await selected.request<unknown>({ method: 'eth_requestAccounts' })
  const chosen = await choosePrimaryAccount(selected, normalizeAccounts(accounts))
  if (!chosen) throw new Error('No wallet account returned.')

  const provider = new BrowserProvider(selected)
  const signer = await provider.getSigner(chosen)
  const network = await provider.getNetwork()

  window.localStorage.setItem(SELECTED_WALLET_KEY, detectedWallet.id)
  window.localStorage.removeItem(DISCONNECTED_KEY)
  window.localStorage.removeItem(LEGACY_CONNECTED_KEY)

  return {
    provider,
    signer,
    address: chosen,
    chainId: Number(network.chainId),
    walletType: detectedWallet.id,
  }
}

export async function connectWallet(wallet?: WalletType) {
  if (typeof window === 'undefined') throw new Error('Wallet connect is only available in the browser.')

  if (wallet) {
    requestEip6963Providers()
    await wait(250)
    const selectedWallet = findDetectedWallet(wallet)
    if (!selectedWallet) throw new Error('Wallet not detected. Install an EVM wallet or open MemeWarzone inside your wallet browser.')
    return connectDetectedWallet(selectedWallet)
  }

  const selectedWallet = await chooseWalletFromModal()
  return connectDetectedWallet(selectedWallet)
}

export async function disconnectWallet() {
  if (typeof window === 'undefined') return

  const storedType = window.localStorage.getItem(SELECTED_WALLET_KEY) as WalletType | null
  requestEip6963Providers()
  await wait(250)
  const selected = findDetectedWallet(storedType)?.provider

  if (selected?.request) {
    try {
      await selected.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] })
    } catch {
      // Most injected wallets do not support revoking permissions programmatically.
    }
  }

  clearWarRoomSessionCache()
  window.localStorage.setItem(DISCONNECTED_KEY, '1')
  window.localStorage.removeItem(LEGACY_CONNECTED_KEY)
}

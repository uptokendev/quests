import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { connectWallet } from '../lib/wallet'
import './WarMissionsPage.css'

type SignupRole = 'creator' | 'trader' | 'both'

const ROLE_KEY = 'mwz:squad:signup_role'
const RECRUITER_CODE_KEY = 'mwz:recruiter_code'
const ROLE_OPTIONS: Array<{ value: SignupRole; title: string; text: string }> = [
  { value: 'creator', title: 'Creator', text: 'I launch or manage projects' },
  { value: 'trader', title: 'Trader', text: 'I trade and participate' },
  { value: 'both', title: 'Both', text: 'I do both' },
]

function shortWallet(value: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : ''
}

function normalizeCode(value: string | null): string {
  return String(value || '').trim()
}

export default function RecruiterApplyPage() {
  const [params] = useSearchParams()
  const [role, setRole] = useState<SignupRole>('creator')
  const [wallet, setWallet] = useState('')
  const [authing, setAuthing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const recruiterCode = useMemo(() => {
    const fromUrl = normalizeCode(params.get('recruiterCode') || params.get('code') || params.get('ref'))
    if (fromUrl) return fromUrl
    if (typeof window === 'undefined') return ''
    return normalizeCode(window.localStorage.getItem(RECRUITER_CODE_KEY))
  }, [params])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedRole = window.localStorage.getItem(ROLE_KEY)
    if (storedRole === 'creator' || storedRole === 'trader' || storedRole === 'both') setRole(storedRole)
    if (recruiterCode) window.localStorage.setItem(RECRUITER_CODE_KEY, recruiterCode)
  }, [recruiterCode])

  const chooseRole = (nextRole: SignupRole) => {
    setRole(nextRole)
    window.localStorage.setItem(ROLE_KEY, nextRole)
  }

  const syncAttribution = async (address: string) => {
    if (!recruiterCode) return
    const response = await fetch('/api/attribution/wallet-connect', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: address, recruiterCode, role }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Referral attribution failed.')
  }

  const signIn = async () => {
    setAuthing(true)
    setError('')
    setNotice('')
    try {
      window.localStorage.setItem(ROLE_KEY, role)
      const { signer, address } = await connectWallet()
      const nonceResponse = await fetch(`/api/wm-auth-nonce?address=${encodeURIComponent(address)}`, { credentials: 'same-origin' })
      const nonceData = await nonceResponse.json().catch(() => ({}))
      if (!nonceResponse.ok || !nonceData?.message) throw new Error(nonceData?.error || 'Failed to request wallet challenge.')
      const signature = await signer.signMessage(nonceData.message)
      const verifyResponse = await fetch('/api/wm-auth-verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature, role }),
      })
      const verifyData = await verifyResponse.json().catch(() => ({}))
      if (!verifyResponse.ok || !verifyData?.ok) throw new Error(verifyData?.error || 'Wallet sign-in failed.')
      await syncAttribution(address)
      setWallet(address)
      setNotice(recruiterCode ? 'Signup role saved and recruiter attribution synced.' : 'Signup role saved. Join from a recruiter link to attach a squad.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet sign-in failed.')
    } finally {
      setAuthing(false)
    }
  }

  return (
    <div className="war-missions-page">
      <div className="war-missions-bg" aria-hidden="true" />
      <div className="war-missions-overlay" aria-hidden="true" />
      <header className="war-missions-top">
        <Link to="/" className="war-missions-brand" aria-label="MemeWarzone War Missions home"><img src="/logo.png" alt="MemeWarzone" /></Link>
        <nav className="war-missions-nav" aria-label="Signup navigation"><Link to="/recruiter/portal">Recruiter</Link><Link to="/profile/squad">Squad</Link><Link to="/missions">Missions</Link></nav>
      </header>
      <main className="war-missions-shell">
        <section className="war-hero">
          <div className="war-hero-copy">
            <div className="war-kicker">Squad Signup</div>
            <h1>What are you joining as?</h1>
            <p>Choose the role that should be stored on your squad membership before connecting your wallet.</p>
            <div className="war-hero-actions"><button type="button" className="war-primary" onClick={() => void signIn()} disabled={authing}>{authing ? 'Waiting for signature...' : wallet ? `Connected ${shortWallet(wallet)}` : 'Connect wallet'}</button><Link to="/profile/squad" className="war-secondary">Open squad rewards</Link></div>
            {error ? <div className="war-alert">{error}</div> : null}{notice ? <div className="war-success">{notice}</div> : null}
          </div>
          <aside className="war-status-card"><div className="war-status-card__label">Recruiter link</div><div className="war-status-card__title">{recruiterCode || 'No recruiter linked yet.'}</div><p>{recruiterCode ? 'This code will be sent with your wallet and selected role.' : 'Open this page from a recruiter link to join a squad.'}</p></aside>
        </section>
        <section className="war-stats" aria-label="Signup role choices">
          {ROLE_OPTIONS.map((option) => <button key={option.value} type="button" className="war-stat" style={{ textAlign: 'left', borderColor: role === option.value ? 'rgba(246, 211, 124, .75)' : undefined }} onClick={() => chooseRole(option.value)}><div className="war-stat__label">{role === option.value ? 'Selected' : 'Role'}</div><div className="war-stat__value">{option.title}</div><div className="war-stat__help">{option.text}</div></button>)}
        </section>
      </main>
    </div>
  )
}

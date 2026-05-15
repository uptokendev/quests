import { useEffect } from 'react'

const DEFAULT_COMMAND_CENTER_URL = 'https://memewarzonefrontend-production.up.railway.app/command/recruiter'

type ExternalRedirectProps = {
  to?: string
  label?: string
}

function getTargetUrl(to?: string) {
  const configured = String(import.meta.env.VITE_COMMAND_CENTER_RECRUITER_URL || '').trim()
  return to || configured || DEFAULT_COMMAND_CENTER_URL
}

export default function ExternalRedirect({ to, label = 'Command Center' }: ExternalRedirectProps) {
  const targetUrl = getTargetUrl(to)

  useEffect(() => {
    window.location.replace(targetUrl)
  }, [targetUrl])

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#070707', color: '#f5f1e8', padding: 24 }}>
      <section style={{ maxWidth: 560, border: '1px solid rgba(246,211,124,.22)', borderRadius: 24, padding: 24, background: 'rgba(255,255,255,.04)' }}>
        <p style={{ margin: '0 0 10px', color: '#f6d37c', fontSize: 12, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase' }}>Redirecting</p>
        <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>Opening {label}</h1>
        <p style={{ margin: '0 0 18px', color: 'rgba(245,241,232,.72)', lineHeight: 1.55 }}>
          Recruiter signup and management now live inside the MemeWarzone Command Center.
        </p>
        <a href={targetUrl} style={{ color: '#f6d37c', fontWeight: 800 }}>Continue to {label}</a>
      </section>
    </main>
  )
}

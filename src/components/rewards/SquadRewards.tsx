import { useState } from 'react'

export type SquadRole = 'creator' | 'trader' | 'both' | 'unknown' | 'legacy' | 'member' | null | undefined

export type RewardMember = {
  wallet: string
  role?: SquadRole
  joinedAt?: string | null
  source?: string | null
  status?: string | null
  earned?: string | null
}

export type RewardClaim = {
  canClaim: boolean
  disabledReason?: string | null
  alreadyClaimed: boolean
  claimableAmount: string
}

export type RewardEpoch = {
  id: string | number
  status: 'active' | 'ended' | string
  startsAt?: string | null
  endsAt?: string | null
  claimOpensAt?: string | null
}

export function normalizeSquadRole(role: SquadRole): 'creator' | 'trader' | 'both' | 'legacy' {
  if (role === 'creator') return 'creator'
  if (role === 'trader') return 'trader'
  if (role === 'both') return 'both'
  return 'legacy'
}

export function roleLabel(role: SquadRole): string {
  const normalized = normalizeSquadRole(role)
  if (normalized === 'creator') return 'Creator'
  if (normalized === 'trader') return 'Trader'
  if (normalized === 'both') return 'Both'
  return 'Legacy'
}

export function shortWallet(wallet: string): string {
  return wallet.length > 12 ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : wallet || '-'
}

export function formatDate(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

export function RoleBadge({ role }: { readonly role?: SquadRole }) {
  const normalized = normalizeSquadRole(role)
  return <span className={`quest-status quest-status--${normalized === 'legacy' ? 'pending' : 'verified'}`}>{roleLabel(role)}</span>
}

export function EpochStatusBadge({ epoch }: { readonly epoch?: RewardEpoch | null }) {
  const ended = epoch?.status === 'ended'
  return <span className={`quest-status quest-status--${ended ? 'verified' : 'started'}`}>{ended ? 'Epoch ended' : 'Epoch active'}</span>
}

export function RewardMetricCard({ label, value, help }: { readonly label: string; readonly value: string; readonly help?: string }) {
  return (
    <div className="war-stat">
      <div className="war-stat__label">{label}</div>
      <div className="war-stat__value">{value || '0'}</div>
      {help ? <div className="war-stat__help">{help}</div> : null}
    </div>
  )
}

function claimDisabledText(claim?: RewardClaim | null, walletConnected = true): string {
  if (!walletConnected) return 'Connect wallet to claim'
  if (!claim) return 'Claim unavailable'
  if (claim.disabledReason) return claim.disabledReason
  if (claim.alreadyClaimed) return 'Already claimed for this epoch'
  if (Number(claim.claimableAmount || 0) <= 0) return 'No rewards to claim yet'
  return 'Available when weekly epoch ends'
}

export function WeeklyClaimButton({ label, claim, walletConnected, onClaim }: {
  readonly label: string
  readonly claim?: RewardClaim | null
  readonly walletConnected: boolean
  readonly onClaim: () => Promise<void>
}) {
  const [claiming, setClaiming] = useState(false)
  const disabled = !walletConnected || !claim?.canClaim || claiming
  const helper = disabled ? claimDisabledText(claim, walletConnected) : `${claim?.claimableAmount || '0'} ready to claim`

  const submit = async () => {
    if (disabled) return
    setClaiming(true)
    try {
      await onClaim()
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div className="war-panel war-panel--tight">
      <div className="war-hero-actions">
        <button type="button" className="war-primary" onClick={() => void submit()} disabled={disabled}>
          {claiming ? 'Claiming...' : label}
        </button>
      </div>
      <p className="war-stat__help" style={{ marginTop: 10 }}>{helper}</p>
    </div>
  )
}

export function SquadMembersTable({ members, showEarned = false }: { readonly members: RewardMember[]; readonly showEarned?: boolean }) {
  return (
    <section className="war-panel">
      <div className="war-section-head"><div><div className="war-kicker">Squad Members</div><h2>Roster</h2></div><p>{members.length} member{members.length === 1 ? '' : 's'}</p></div>
      <div className="quest-list">
        {members.length === 0 ? <div className="leaderboard-empty">No squad members found yet.</div> : members.map((member) => (
          <div className="quest-row" key={`${member.wallet}:${member.joinedAt || member.source || ''}`}>
            <div><div className="quest-row__title">{shortWallet(member.wallet)}</div><div className="quest-row__text">Joined {formatDate(member.joinedAt)}{member.source ? ` - ${member.source}` : ''}{member.status ? ` - ${member.status}` : ''}</div></div>
            <div className="quest-row__meta">{showEarned && member.earned ? <strong>{member.earned}</strong> : null}<RoleBadge role={member.role} /></div>
          </div>
        ))}
      </div>
    </section>
  )
}

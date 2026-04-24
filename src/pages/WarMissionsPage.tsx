import { Link } from 'react-router-dom'
import './WarMissionsPage.css'

type Quest = {
  title: string
  description: string
  xp: string
  status: 'ready' | 'pending' | 'review' | 'locked'
}

type MissionCategory = {
  eyebrow: string
  title: string
  description: string
  accent: string
  quests: Quest[]
}

const categories: MissionCategory[] = [
  {
    eyebrow: 'First run',
    title: 'Start Here',
    accent: '4 onboarding quests',
    description: 'Connect wallet, link socials, and complete the basic soldier verification path.',
    quests: [
      { title: 'Intercept Global Comms', description: 'Follow MemeWarzone on X.', xp: '100 XP', status: 'ready' },
      { title: 'Access the Underground Comms', description: 'Join the official Telegram.', xp: '100 XP', status: 'ready' },
      { title: 'Report to Base Camp', description: 'Join the official Discord.', xp: '100 XP', status: 'ready' },
      { title: 'Take the Oath', description: 'Connect wallet and sign the oath message.', xp: '150 XP', status: 'ready' },
    ],
  },
  {
    eyebrow: 'Daily reset 00:00 UTC',
    title: 'Daily Warpath',
    accent: '850 XP daily max',
    description: 'Daily social and community activity with caps, quality checks, and streak tracking.',
    quests: [
      { title: 'Drop Frontline Propaganda', description: 'Submit a unique X post with at least 3 likes.', xp: '150 XP', status: 'pending' },
      { title: 'Provide Covering Fire', description: 'Submit 2 valuable replies, not one-line spam.', xp: '150 XP', status: 'pending' },
      { title: 'Relay the Battleplan', description: 'Submit a quote post with at least 50 impressions.', xp: '200 XP', status: 'pending' },
      { title: 'Maintain Radio Discipline', description: 'Meaningful Discord and/or Telegram activity.', xp: '100 XP', status: 'pending' },
    ],
  },
  {
    eyebrow: 'High XP contracts',
    title: 'Black Market Contracts',
    accent: 'highest tier only',
    description: 'Impression-based MemeWarzone posts with delayed checks and manual review on the top tier.',
    quests: [
      { title: 'Signal Leak', description: '500 impressions on a tagged X post.', xp: '500 XP', status: 'review' },
      { title: 'Broadcasting Static', description: '1,000 impressions on a tagged X post.', xp: '1,000 XP', status: 'review' },
      { title: 'Viral Contagion', description: '2,000 impressions on a tagged X post.', xp: '2,500 XP', status: 'review' },
      { title: 'Total Info-Dominance', description: '5,000 impressions and admin review.', xp: '7,500 XP', status: 'review' },
    ],
  },
  {
    eyebrow: 'Knowledge checks',
    title: 'Recon & Interrogation',
    accent: '3/4 to pass',
    description: 'Documentation quizzes for basics, leagues, treasury objectives, and safety rules.',
    quests: [
      { title: 'Read the Basics', description: 'Read docs and pass the quiz.', xp: '250 XP', status: 'locked' },
      { title: 'Leagues and Airdrop Briefing', description: 'Learn weekly and monthly competition loops.', xp: '300 XP', status: 'locked' },
      { title: 'Fees and Treasury Objectives', description: 'Understand the prize and revenue loops.', xp: '300 XP', status: 'locked' },
      { title: 'Security & Safety Recon', description: 'Learn safety rules and anti-farming policy.', xp: '350 XP', status: 'locked' },
    ],
  },
  {
    eyebrow: 'Recruiter growth',
    title: 'Operation: Reinforcements',
    accent: 'verified recruits only',
    description: 'Apply for recruiter, get approved, generate links, and build verified squads.',
    quests: [
      { title: 'Apply for Recruiter Program', description: 'Submit the recruiter application.', xp: '500 XP', status: 'ready' },
      { title: 'Get Accepted', description: 'Admin approves your recruiter profile.', xp: '2,000 XP', status: 'review' },
      { title: 'Assemble a Fireteam', description: 'Bring in 2 verified recruits.', xp: '1,000 XP', status: 'locked' },
      { title: 'Lead a Battalion', description: 'Bring in 20 verified recruits.', xp: '15,000 XP', status: 'locked' },
    ],
  },
]

const stats = [
  { label: 'Total XP', value: '0', help: 'Ledger backed' },
  { label: 'Daily streak', value: '0', help: 'UTC reset' },
  { label: 'Pending review', value: '0', help: 'Admin queue' },
  { label: 'Raffle tickets', value: '0', help: 'Weekly prizes' },
]

function statusLabel(status: Quest['status']) {
  if (status === 'ready') return 'Ready'
  if (status === 'pending') return 'Metric check'
  if (status === 'review') return 'Review'
  return 'Locked'
}

export default function WarMissionsPage() {
  return (
    <div className="war-missions-page">
      <div className="war-missions-bg" aria-hidden="true" />
      <div className="war-missions-overlay" aria-hidden="true" />

      <header className="war-missions-top">
        <Link to="/" className="war-missions-brand" aria-label="MemeWarzone War Missions home">
          <img src="/logo.png" alt="MemeWarzone" />
        </Link>
        <nav className="war-missions-nav" aria-label="War Missions navigation">
          <a href="#missions">Missions</a>
          <a href="#leaderboard">Leaderboard</a>
          <Link to="/recruiter/portal">Recruiter Portal</Link>
          <Link to="/admin/missions">Admin</Link>
        </nav>
      </header>

      <main className="war-missions-shell">
        <section className="war-hero">
          <div className="war-hero-copy">
            <div className="war-kicker">MemeWarzone Command</div>
            <h1>War Missions</h1>
            <p>
              Complete quests, earn XP, build streaks, recruit verified soldiers, and qualify for weekly prizes before the full Warzone opens.
            </p>
            <div className="war-hero-actions">
              <button type="button" className="war-primary">Connect wallet</button>
              <Link to="/recruiter/portal" className="war-secondary">Recruiter sign in</Link>
            </div>
          </div>

          <aside className="war-status-card">
            <div className="war-status-card__label">Identity status</div>
            <div className="war-status-card__title">Wallet required</div>
            <p>Wallet is the primary identity. Social accounts and quest completions attach to the wallet profile.</p>
            <div className="war-checklist">
              <span>Wallet signature</span>
              <span>X account</span>
              <span>Telegram</span>
              <span>Discord</span>
            </div>
          </aside>
        </section>

        <section className="war-stats" aria-label="Mission stats">
          {stats.map((stat) => (
            <div className="war-stat" key={stat.label}>
              <div className="war-stat__label">{stat.label}</div>
              <div className="war-stat__value">{stat.value}</div>
              <div className="war-stat__help">{stat.help}</div>
            </div>
          ))}
        </section>

        <section className="war-panel" id="missions">
          <div className="war-section-head">
            <div>
              <div className="war-kicker">Quest board</div>
              <h2>Choose your mission path</h2>
            </div>
            <p>Quest logic must come from Supabase seed data. This frontend is the first visual scaffold for the live engine.</p>
          </div>

          <div className="mission-grid">
            {categories.map((category) => (
              <article className="mission-card" key={category.title}>
                <div className="mission-card__top">
                  <div>
                    <div className="mission-card__eyebrow">{category.eyebrow}</div>
                    <h3>{category.title}</h3>
                  </div>
                  <span>{category.accent}</span>
                </div>
                <p>{category.description}</p>
                <div className="quest-list">
                  {category.quests.map((quest) => (
                    <div className="quest-row" key={quest.title}>
                      <div>
                        <div className="quest-row__title">{quest.title}</div>
                        <div className="quest-row__text">{quest.description}</div>
                      </div>
                      <div className="quest-row__meta">
                        <strong>{quest.xp}</strong>
                        <span className={`quest-status quest-status--${quest.status}`}>{statusLabel(quest.status)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="war-two-col" id="leaderboard">
          <div className="war-panel war-panel--tight">
            <div className="war-kicker">Leaderboard preview</div>
            <h2>Weekly front line</h2>
            <div className="leaderboard-empty">No ranked soldiers yet. XP will be calculated from the XP ledger once the quest engine is connected.</div>
          </div>

          <div className="war-panel war-panel--tight">
            <div className="war-kicker">Pending review</div>
            <h2>Admin watchlist</h2>
            <div className="review-list">
              <span>High-XP Black Market submissions</span>
              <span>Recruiter applications</span>
              <span>X bio link checks</span>
              <span>Duplicate content flags</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

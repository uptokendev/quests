# MemeWarzone Quests App

Standalone War Missions app for `quests.memewar.zone`.

## Current ownership

- `uptokendev/quests` `main` owns the War Missions user and admin surface.
- Recruiter signup lives in the main MemeWarzone Command Center flow.
- War Missions keeps the recruiter CTA, status-check, milestone visibility, and admin review surfaces.
- `uptokendev/MemeBattles` `dev` owns the runtime War Missions API gateway and backend integrations.

## Netlify settings

Use the existing repository, but create a separate Netlify site for the quest subdomain.

- Base directory: `quests`
- Build command: `npm run build`
- Publish directory: `dist`
- No Netlify Functions. The site stays static-only and `netlify.toml` proxies `/api/*` to the MemeWarzone Railway API gateway.

## Required environment variables

The quests site is a static frontend. Runtime secrets and backend integrations live on the MemeBattles / Railway API side.

Optional frontend override:

- `VITE_COMMAND_CENTER_RECRUITER_URL`

Wallet connect uses the same injected-wallet flow as the MemeBattles frontend: MetaMask/Rabby, Binance Wallet, or another BSC-compatible injected EVM wallet. It does not require a WalletConnect/Reown project ID.

## Asset note

The quests app expects these files in `quests/public` before production deploy:

- `logo.png`
- `hero-bg.png`

For now, copy them from the current landing app public folder so the visual style stays consistent.

## Routes

- `/`
- `/missions`
- `/missions/start-here`
- `/missions/daily-warpath`
- `/missions/black-market-contracts`
- `/missions/recon`
- `/missions/reinforcements`
- `/profile/missions`
- `/profile/squad`
- `/recruiter/apply`
- `/recruiter/portal`
- `/admin/missions`
- `/admin/missions/*`

## Active API endpoints

These routes are served by the MemeBattles `dev` API gateway and reached from quests through the existing `/api/*` proxy.

- `/api/wm-auth-nonce`
- `/api/wm-auth-verify`
- `/api/wm-profile`
- `/api/wm-quests-list`
- `/api/wm-quests-submit`
- `/api/wm-social-link`
- `/api/wm-social-status`
- `/api/wm-quiz-get`
- `/api/wm-quiz-load`
- `/api/wm-quiz-submit`
- `/api/wm-recruiter-apply`
- `/api/wm-recruiter-status`
- `/api/wm-recruiter-status-check`
- `/api/wm-referral-track`
- `/api/wm-leaderboard-current`
- `/api/wm-prizes-public`
- `/api/wm-badges-list`
- `/api/wm-admin-badge-award`
- `/api/wm-admin-review-completion`
- `/api/wm-admin-social-recheck`
- `/api/wm-admin-notifications-list`
- `/api/wm-admin-recruiter-review`
- `/api/wm-admin-user-action`
- `/api/wm-admin-quest-upsert`
- `/api/wm-admin-leaderboard-snapshot`
- `/api/wm-admin-prizes`
- `/api/wm-daily-rollover`

## Recruiter flow

- Open recruiter signup in Command Center.
- Return to War Missions and run recruiter status-check.
- Approved recruiter status unlocks recruiter XP and reinforcement milestones inside Quests.
- Referral and squad management remain Command Center concerns.

# MemeWarzone Quests App

Standalone War Missions app for `quests.memewar.zone`.

## Netlify settings

Use the existing repository, but create a separate Netlify site for the quest subdomain.

- Base directory: `quests`
- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

The app keeps all quest and admin pages on the same subdomain.

## Required environment variables

The quests site uses its own Netlify Functions under `quests/netlify/functions`.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WAR_MISSIONS_AUTH_SECRET`
- `WAR_MISSIONS_ADMIN_WALLETS`
- `WM_MAINTENANCE_SECRET`
- `WM_REQUIRED_X_TAG`
- `X_BEARER_TOKEN` or `TWITTER_BEARER_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `DISCORD_BOT_TOKEN`
- `WM_TELEGRAM_GROUP_ID`
- `WM_DISCORD_GUILD_ID`
- `WM_DISCORD_CHANNEL_IDS`

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

## API endpoints started

- `/api/wm-auth-nonce`
- `/api/wm-auth-verify`
- `/api/wm-profile`
- `/api/wm-quests-list`
- `/api/wm-quests-submit`
- `/api/wm-social-link`
- `/api/wm-quiz-get`
- `/api/wm-quiz-submit`
- `/api/wm-recruiter-apply`
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

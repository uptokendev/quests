# MemeWarzone Quests App

Standalone War Missions app for `quests.memewar.zone`.

## Netlify settings

Use the existing repository, but create a separate Netlify site for the quest subdomain.

- Base directory: `quests`
- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

The app keeps all quest and admin pages on the same subdomain.

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

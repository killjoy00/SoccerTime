# SoccerTime

A mobile-first, two-player Premier League fantasy game built for a family head-to-head season.

## Game format
- Exactly two managers
- 8-player exclusive squads: 1 GK, 2 DEF, 3 MID, 2 FWD
- Fresh snake draft every four Premier League Gameweeks
- All eight players score each week
- One 2x captain
- Weekly win/draw/loss table (3/1/0) plus Round champions
- Permanent draft and ownership history in Neon

## Stack
Next.js + TypeScript, Neon Postgres/Data API, Vercel, API-Football via GitHub Actions.

## Data
`.github/workflows/sync-football.yml` uses the repository's `SOCCER_API_KEY` (or compatible fallback secret name) to refresh `public/data/epl.json`. The key never reaches the browser.

## Family league
A private join code is seeded in the Neon project. Enter it once on each phone and choose Manager 1 or Manager 2; the device remembers the selection.
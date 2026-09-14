# Reliability operations pass — 2026-09-14

This pass hardens production workload identity, Gameweek automation, health verification, and deployment CI.

## Runtime identity

Server routes use `@vercel/oidc` to acquire the project OIDC token from Vercel runtime context. Database actions are production-only and continue to rely on Neon's external-JWT verification and workload-guarded RPCs.

## Gameweek cron

The production cron remains scheduled for `0 6 * * *` UTC. The route now emits start, no-op, finalize, and failure logs so scheduled runs are observable. It finalizes only after official FPL reports the active Gameweek as both finished and data-checked.

## Health checks

- `/api/health/db` validates Vercel workload identity -> Neon state access.
- `/api/health/e2e` validates the active league without writes: 16-pick completed draft, exclusive ownership, exact 1/2/3/2 rosters, valid captains, official FPL event/fixtures/live scoring, and move-history access.

## Deployment CI

The production workflow is bound to the exact Vercel team/project IDs, pins Vercel CLI, builds before deploy, uses `--prebuilt`, serializes production deployments, and fails explicitly when `VERCEL_TOKEN` is unavailable instead of silently skipping production.

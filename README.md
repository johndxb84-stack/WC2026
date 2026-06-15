# WC2026 Predictions

A responsive Next.js/TypeScript application for a private World Cup 2026 prediction game between Nicolas, Jean, and Anthony. The first milestone uses mock football data while preserving provider, database, settlement, and administration seams for a production API-backed version.

## Features in this milestone

- Daily player order rotation from `2026-06-15` with configurable timezone defaulting to `Asia/Dubai`.
- Responsive premium football dashboard with today's mock matches, current turn, submission statuses, hidden predictions, leaderboard cards, and match detail pages.
- Server-side domain logic for turn enforcement, kickoff locking, duplicate score rejection, reveal timing, scoring, and idempotent settlement.
- Prisma schema covering users, competitions, teams, football players, fixtures, daily orders, predictions, scoring, notifications, and audit logs.
- Mock provider abstraction implementing the intended football API surface.
- API route skeletons for prediction submission and result settlement.

## Local setup

```bash
npm install
cp .env.example .env
npx prisma generate
npm run dev
```

For a real database, set `DATABASE_URL`, run `npx prisma migrate dev`, then seed with `npx prisma db seed` after configuring Prisma seed execution for your package manager.

## Scripts

- `npm run dev` starts Next.js.
- `npm run build` creates a production build.
- `npm run test` runs Vitest unit tests.
- `npm run lint` runs Next linting.

## Provider integration

`lib/football-provider.ts` defines the provider interface. Add a concrete API-Football, Sportmonks, or Football-Data.org implementation behind `createFootballProvider`, keeping API keys in environment variables and preserving caching/rate-limit/retry behavior around provider calls.

## Worldwide shared predictions

The app persists submitted bets through `/api/predictions`. For real cross-device/cross-browser sync on Vercel, create a Vercel KV or Upstash Redis database and set `KV_REST_API_URL` plus `KV_REST_API_TOKEN` in Vercel environment variables. The API also accepts `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

If these variables are not configured, the API falls back to temporary server memory, which is useful for local demos but is not durable across deployments or serverless cold starts.

### Preventing lost bets during deployments

Bets are durable across deployments only when Vercel KV / Upstash Redis environment variables are configured. Without KV, Vercel serverless memory can reset on redeploys. The browser keeps a local backup and the dashboard includes a **Restore local backup** button that can push that browser's saved bets back into the shared store if a deployment or missing KV configuration clears the temporary server store.

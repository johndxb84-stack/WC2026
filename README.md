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

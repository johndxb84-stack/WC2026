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

The app persists submitted bets through `/api/predictions`. For real cross-device/cross-browser sync on Vercel, create a Vercel KV or Upstash Redis database and set `KV_REST_API_URL` plus `KV_REST_API_TOKEN` in Vercel environment variables. The API also accepts `KV_REST_REDIS_URL` plus `KV_REST_REDIS_TOKEN` when the Vercel integration is installed with a Redis-style custom prefix, or `UPSTASH_REDIS_REST_URL` plus `UPSTASH_REDIS_REST_TOKEN`.

If these variables are not configured, the API falls back to temporary server memory, which is useful for local demos but is not durable across deployments or serverless cold starts.

### Preventing lost bets during deployments

Bets are durable across deployments only when Vercel KV / Upstash Redis environment variables are configured. Without KV, Vercel serverless memory can reset on redeploys. The browser keeps a local backup and the dashboard includes a **Restore local backup** button that can push that browser's saved bets back into the shared store if a deployment or missing KV configuration clears the temporary server store.

### Vercel KV deployment checklist

If bets disappear after a Vercel deployment, the project is not actually writing to durable KV for that deployment. In Vercel:

1. Open the project, then go to **Storage** and create or connect a KV/Redis database to this project.
2. Confirm the KV environment variables are added to every environment you use: **Production**, **Preview**, and **Development**. Preview deployments from branches need Preview variables too.
3. Redeploy after the variables are added; old deployments do not automatically receive newly added environment variables.
4. Open the app and check the sync pill at the top of the dashboard. It must say **Synced globally**. If it says temporary server memory, the deployment still cannot see the KV variables.
5. If a temporary-memory deployment lost bets but the browser that submitted them still has a backup, click **Restore local backup** once after KV is configured.

### What values go in the KV variables?

Do not invent these values. Copy them from Vercel Storage/KV (or Upstash Redis):

- `KV_REST_API_URL`: the REST API URL shown by Vercel KV/Upstash, usually an `https://...upstash.io` URL.
- `KV_REST_API_TOKEN`: the REST API token/secret shown next to the REST URL.

If your Vercel integration created `KV_REST_REDIS_URL` / `KV_REST_REDIS_TOKEN` instead, those names are also supported. The important part is that the deployed app must have a matching REST URL and REST token pair.

In Vercel, add them under **Project Settings → Environment Variables** for the same environment you deploy to. If you are testing a branch preview URL, add them to **Preview** too. After saving them, redeploy the site and verify the dashboard says **Synced globally**.


### Backing up KV predictions

The simplest backup is from the deployed app: click **Download backup** on the dashboard. This downloads the current `/api/predictions` JSON, including submitted predictions, persistence mode, and reset metadata.

You can also open `https://YOUR_DOMAIN/api/predictions` in a browser and save the JSON response manually. Keep the file before major deployments, resets, or provider/scoring migrations.


## Automatic result sync and scoring

Automatic scoring is additive and does not overwrite submitted bets. Predictions remain in `wc2026:predictions:v1`; final results and calculated scores are stored separately by `/api/results`. The `/api/sync` endpoint is wired for Vercel Cron and calls the configured football provider. With the current mock provider, no official results are settled automatically until a real provider implementation and API key are configured.

For safety before enabling a real provider, download a backup of predictions from the dashboard. The leaderboard cards read settled totals from `/api/results`, so submitted bets stay intact while scoring can be recalculated from official results.


### Enabling live score fetching with API-Football

Set `FOOTBALL_PROVIDER=api-football`, add `API_FOOTBALL_KEY`, and map each app fixture id to the provider fixture id in `FOOTBALL_FIXTURE_ID_MAP`. Example:

```env
FOOTBALL_PROVIDER="api-football"
API_FOOTBALL_KEY="your-api-football-key"
FOOTBALL_FIXTURE_ID_MAP='{"match-14":"123456","match-16":"123457"}'
```

The Vercel Cron job calls `/api/sync`, which asks the provider for final results. Confirmed final results are posted to `/api/results` and settled without modifying existing bets.

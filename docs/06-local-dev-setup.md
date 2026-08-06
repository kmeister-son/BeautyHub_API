# 06 — Local dev setup

How to get all four pieces running together. There's no staging/prod
environment yet — "local" is the only environment that exists.

## Order of operations

The backend has to be up before any client is useful, since none of them
have meaningful offline modes (aside from each Flutter app's `test/`-only
mocks). Bring things up in this order:

1. **PostgreSQL** — running and reachable.
2. **`beautyhub-api`** — migrated, seeded, `npm run start:dev`.
3. Whichever client(s) you're actually working on.

## 1. PostgreSQL

The backend needs Postgres 16 reachable at the connection string in its
`.env`. Two ways to get there — both produce the same `DATABASE_URL`:

- **Docker**: `docker compose up -d` in `beautyhub-api` (a `docker-compose.yml`
  is committed — `postgres:16-alpine`, user `postgres` / password
  `beautyhub_dev` / db `beautyhub`, port 5432).
- **Native install**: a Postgres 16 service with matching credentials/db
  name. (On this team's primary dev machine, Postgres runs as a native
  Windows service rather than in Docker — either path works, just make sure
  whichever one you pick matches the `.env` connection string.)

## 2. `beautyhub-api`

```sh
cd beautyhub-api
npm install
cp .env.example .env        # then fill in JWT_SECRET, confirm DATABASE_URL
npx prisma migrate deploy   # or `migrate dev` if you're actively changing schema
npx prisma db seed          # idempotent — safe to re-run
npm run start:dev           # http://localhost:3000, Swagger at /docs
```

`.env.example` only lists `DATABASE_URL`, `JWT_SECRET`, `PORT`. Two more
vars are read in code but aren't in the template — add them if you need
non-default behavior: `SALON_TIMEZONE` (IANA name, defaults to
`Africa/Johannesburg`) and `NODE_ENV` (set to anything other than
`production` to get `devCode` echoed back from `/auth/forgot-password`,
since there's no real mailer wired up yet).

Seed data gives you an admin (`admin@beautyhub.app` / `admin_dev_password`),
a guest, and 8 seeded provider/owner accounts (`owner-velvet@beautyhub.app`
etc., all `provider_dev_password`) — see
[01 — Backend](./01-backend.md#6-running-it-locally) for the full list.
**Run the seed before running `npm run test:e2e`** — the e2e suite depends
on seed data being present and hits the real dev database, not a mock.

## 3. Customer app (`BeautyHub`)

```sh
cd BeautyHub
flutter pub get
flutter run
```

`lib/core/config/api_config.dart` decides the backend URL with this
priority: a `--dart-define=API_BASE_URL=...` you pass explicitly, then a
hardcoded per-platform default (Android: a LAN IP; iOS simulator:
`localhost:3000`). **The Android default is a plain IP literal in the source
file** — it has no way to auto-detect your machine's current address, so if
you're on a different network than whoever last committed that file, either
edit it or pass the dart-define:

```sh
flutter run --dart-define=API_BASE_URL=http://<your-lan-ip>:3000
```

This matters more than it sounds like — a stale IP here is the single most
likely reason `flutter run` launches fine but every screen shows "No
internet connection."

## 4. Vendor app (`beautyhub_vendor`)

```sh
cd beautyhub_vendor
flutter pub get
flutter run
```

Same `ApiConfig.baseUrl` pattern, **different default**: Android points at
`10.0.2.2:3000` (the emulator's alias for its host machine) rather than a
LAN IP. That default only works inside an **emulator** — for a physical
vendor-app device you need to either bridge over USB or point at your LAN IP
explicitly:

```sh
# USB bridge (re-run adb reverse every time you reconnect the cable):
adb reverse tcp:3000 tcp:3000
flutter run --dart-define=API_BASE_URL=http://localhost:3000

# or, over Wi-Fi, same pattern as the customer app:
flutter run --dart-define=API_BASE_URL=http://<your-lan-ip>:3000
```

Log in with one of the seeded `owner-*@beautyhub.app` accounts — this app
has no guest mode and no self-registration.

## 5. Admin app (`beautyhub-admin`)

```sh
cd beautyhub-admin
npm install
# no .env.example is committed — create .env.local yourself:
echo "NEXT_PUBLIC_API_URL=http://localhost:3000" > .env.local
npm run dev          # http://localhost:3001 (not 3000 — deliberately offset to avoid colliding with the API)
```

Log in with the seeded admin account. This app runs on plain `localhost`
only — there's no Android/iOS/LAN-IP concern, it's a normal Next.js dev
server.

## Running everything at once

Four terminals, in this order, each left running:

```sh
# 1
cd beautyhub-api && npm run start:dev

# 2 (once #1 is up)
cd beautyhub-admin && npm run dev

# 3
cd BeautyHub && flutter run

# 4
cd beautyhub_vendor && flutter run
```

## Common failure modes

| Symptom | Likely cause |
|---|---|
| Flutter app shows "No internet connection" on every screen, but the backend is clearly running | `ApiConfig.baseUrl`'s hardcoded IP/host doesn't match how your device actually reaches the backend — see §3/§4 |
| `npm run test:e2e` fails immediately in `beautyhub-api` | Seed hasn't been run, or was run against a different DB than the one the tests connect to |
| Admin app can log in but every list page is empty/errors | `NEXT_PUBLIC_API_URL` in `.env.local` doesn't match where the backend is actually listening |
| Vendor app login says "This account is not a salon owner" | You're testing with a customer/guest account instead of one of the seeded `owner-*` accounts — this app rejects non-provider roles client-side, by design |
| A fresh clone's Gradle/emulator setup silently ignores your configured cache locations | Environment variables like `GRADLE_USER_HOME`/`ANDROID_AVD_HOME`, if your team has moved them off the default drive, only apply to shells opened *after* they were set — an old terminal session won't see them |

## What's not set up yet

There's no CI/CD deploy step, no staging environment, and no seeded test
data beyond what `prisma/seed.ts` creates. Hosting (Railway, planned for the
backend) isn't provisioned. If a task references "the staging environment"
or "the prod database," that doesn't exist yet — check with whoever assigned
it.

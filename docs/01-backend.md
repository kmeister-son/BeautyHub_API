# 01 — Backend (`beautyhub-api`)

NestJS 11 + Prisma 6 + PostgreSQL. Single `src/` tree, no monorepo/libs.
Swagger is auto-generated and mounted at `GET /docs` when the server is
running — use that for interactive exploration; this page is the durable
reference.

No global route prefix — routes are `/auth/...`, `/salons/...`, not
`/api/...`.

## 1. Project structure

| Path | Responsibility |
|---|---|
| `src/main.ts` | Bootstraps Nest, global `ValidationPipe`, CORS, Swagger |
| `src/app.module.ts` | Root module; wires `ConfigModule`, `PrismaModule`, all feature modules, and registers `JwtAuthGuard` + `RolesGuard` as global guards |
| `src/auth/` | Registration, login, guest identity, password reset, "me" profile/account deletion. Owns JWT issuing, the Passport JWT strategy, and the `Public`/`Roles`/`CurrentUser` decorators |
| `src/salons/` | Public salon catalogue: list/search/filter, salon detail, availability lookup |
| `src/bookings/` | Customer-facing booking CRUD, plus the shared `AvailabilityService` also used by `salons` and `provider` |
| `src/provider/` | Authenticated-provider self-service: own salon, services, staff, bookings |
| `src/admin/` | Authenticated-admin back office: salons, users, all bookings |
| `src/prisma/` | `PrismaService`, wrapped in a `@Global()` module so every feature module gets it for free |
| `src/common/` | `geo.ts` (haversine distance), `mappers.ts` (Prisma row → wire JSON), `timezone.ts` (salon-wall-clock ↔ UTC conversion) |
| `prisma/schema.prisma` | Data model — see §2 |
| `prisma/migrations/` | 6 migrations, notably two enforcing no-double-booking via a Postgres exclusion constraint |
| `prisma/seed.ts` | Seeds 8 salons + services/staff/reviews, 1 admin, 1 guest, 8 provider/owner users, 1 historical booking |
| `test/` | Two e2e suites that run against the **real dev Postgres DB**, not mocked |

## 2. Data model (`prisma/schema.prisma`)

### Enums

| Enum | Values |
|---|---|
| `Role` | `CUSTOMER`, `PROVIDER`, `ADMIN` |
| `ServiceCategory` | `HAIRCUT`, `BARBER`, `NAILS`, `SPA`, `MAKEUP`, `SKINCARE` |
| `BookingStatus` | `PENDING`, `CONFIRMED`, `DECLINED`, `EXPIRED`, `CANCELLED` |

### Models

**`User`**

| Field | Type |
|---|---|
| `id` | `String @id @default(cuid())` |
| `email` | `String @unique` |
| `passwordHash` | `String?` (null for guests) |
| `name` | `String` |
| `role` | `Role @default(CUSTOMER)` |
| `isGuest` | `Boolean @default(false)` |
| `createdAt` | `DateTime @default(now())` |
| `salons` | `Salon[]` (owned salons, via `Salon.ownerId`) |
| `bookings` | `Booking[]` |
| `passwordResets` | `PasswordReset[]` |

**`PasswordReset`** — one-time 6-digit reset codes; only the newest
unused/unexpired row per user is honoured.

| Field | Type |
|---|---|
| `id` | `String @id @default(cuid())` |
| `user`/`userId` | `User` relation, cascades on delete |
| `codeHash` | `String` (bcrypt hash of the 6-digit code) |
| `expiresAt` | `DateTime` |
| `usedAt` | `DateTime?` |
| `createdAt` | `DateTime @default(now())` |

**`Salon`**

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id` | no default — caller supplies it (e.g. `salon-velvet`) |
| `owner`/`ownerId` | `User?` relation, nullable | detached (not deleted) when the owner account is deleted |
| `name`, `tagline`, `about`, `address` | `String` | |
| `latitude`, `longitude` | `Float @default(0)` | real coordinates for distance calc |
| `distanceKm` | `Float` | static fallback used when the client sends no location |
| `rating`, `reviewCount` | `Float` / `Int` | |
| `categories` | `ServiceCategory[]` | |
| `openHour`, `closeHour` | `Int` | salon-market **wall-clock** hour (0–23 / 1–24) |
| `isFeatured` | `Boolean` | |
| `coverSeed` | `Int` | deterministic gradient/ordering seed, ported from the original mock data |
| `autoConfirmBookings` | `Boolean @default(true)` | `false` ⇒ bookings land `PENDING`, need owner accept/decline |
| `services`, `staff`, `reviews`, `bookings` | relations | |

**`SalonService`**

| Field | Type |
|---|---|
| `id` | `String @id @default(cuid())` |
| `salon`/`salonId` | relation, `onDelete: Cascade` |
| `name`, `description` | `String` |
| `durationMinutes` | `Int` |
| `price` | `Decimal @db.Decimal(10,2)` |
| `category` | `ServiceCategory` |

**`StaffMember`**

| Field | Type |
|---|---|
| `id` | `String @id @default(cuid())` |
| `salon`/`salonId` | relation, `onDelete: Cascade` |
| `name`, `role` | `String` |
| `rating` | `Float` |
| `bookings` | `Booking[]` |

**`Review`**

| Field | Type |
|---|---|
| `id` | `String @id @default(cuid())` |
| `salon`/`salonId` | relation, `onDelete: Cascade` |
| `authorName` | `String` |
| `rating` | `Float` |
| `comment` | `String` |
| `date` | `DateTime` |

**`Booking`**

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `customer`/`customerId` | `User` relation | |
| `salon`/`salonId` | `Salon` relation | |
| `staff`/`staffId` | `StaffMember?` relation | nullable — "any professional" |
| `start`, `end` | `DateTime` | `end` is persisted, not derived, so the exclusion constraint can range over it |
| `totalDurationMinutes` | `Int` | |
| `totalPrice` | `Decimal @db.Decimal(10,2)` | |
| `status` | `BookingStatus @default(CONFIRMED)` | |
| `createdAt` | `DateTime @default(now())` | |
| `expiresAt` | `DateTime?` | only set when the salon requires approval |
| `respondedAt` | `DateTime?` | set when the owner accepts/declines |
| `salonName`, `salonAddress`, `coverSeed`, `serviceNames` (`String[]`), `staffName` | snapshot fields | frozen at booking time — bookings are historical receipts, immune to later provider edits |

Indexes: `Booking` on `[salonId, start]` and `[customerId, start]`.

### DB-level invariants (migrations, not visible in `schema.prisma` alone)

`CREATE EXTENSION btree_gist` plus an **exclusion constraint**
(`no_double_booking`) on `Booking`:

```sql
EXCLUDE USING gist (
  "salonId" WITH =,
  tsrange(start, "end") WITH &&
) WHERE (status IN ('PENDING', 'CONFIRMED'))
```

This is the *real* guarantee against overlapping bookings at a salon —
enforced by Postgres itself, so two concurrent `create()` calls cannot both
commit. Violating it raises Postgres error `23P01`, which
`BookingsService.create()` catches and rethrows as a 409 `ConflictException`.
(A comment in the migration notes that per-staff capacity would mean swapping
`salonId` for `coalesce(staffId, salonId)` — not implemented yet.)

## 3. Auth model

All identities — guest, customer, provider, admin — are JWTs signed with the
same `JWT_SECRET`. There is no separate token "kind"; what differs is the
`role`/`isGuest` state of the underlying `User` row.

| Identity | How obtained | Expiry | Notes |
|---|---|---|---|
| Guest | `POST /auth/guest` (public) | 3650 days | Creates a real `User` with `isGuest: true`, synthetic email, `role: CUSTOMER`, no password. Effectively a long-lived device identity |
| Registered customer | `POST /auth/register` or `/auth/login` | 30 days | `role: CUSTOMER` by default; bcrypt cost 10 |
| Provider | Same login endpoint; distinguished purely by `role: PROVIDER` on the row (set via seed/admin, no self-registration) | 30 days | Gated by `@Roles(Role.PROVIDER)` |
| Admin | Same login endpoint; `role: ADMIN` | 30 days | Gated by `@Roles(Role.ADMIN)` |

JWT payload (`JwtPayload`): `{ sub: userId, email, role }`. Every request
**re-fetches the `User` row by `sub`** in `JwtStrategy.validate()` — if the
user no longer exists, `UnauthorizedException` fires immediately, so a
deleted account is rejected in real time rather than trusting stale claims.

**Config**: `JWT_SECRET` is required (`ConfigService.getOrThrow`) — boot
fails without it, no fallback.

### Guards (`src/auth/guards/`)

| Guard | Registered as | Behavior |
|---|---|---|
| `JwtAuthGuard` | Global | Checks `@Public()` metadata first; if public, allows through. Otherwise requires a valid Bearer token (401 on missing/invalid/expired) |
| `RolesGuard` | Global, runs after `JwtAuthGuard` | Reads `@Roles(...)` metadata; no metadata = any authenticated user is fine; otherwise checks `request.user.role` is in the list, else 403 |

Both are registered globally via `APP_GUARD` — **every route requires a valid
JWT by default** unless explicitly marked `@Public()`. Role checks are
opt-in (`@Roles()`), auth is opt-out (`@Public()`).

### Decorators (`src/auth/decorators/`)

- `@Public()` — bypasses `JwtAuthGuard`.
- `@Roles(...roles: Role[])` — consumed by `RolesGuard`.
- `@CurrentUser()` — pulls `request.user` (`{ id, email, role }`).

### Password reset flow

`POST /auth/forgot-password` always returns `{ ok: true }` — it never reveals
whether the email exists (anti-enumeration). Outside `NODE_ENV=production` it
also returns `devCode` (the plaintext 6-digit code), since `MailerService` is
currently a stub that just logs — no real mail provider is wired up yet.
Codes: 6 digits, bcrypt-hashed at rest, 15-minute TTL, single-use.

### Account deletion

`DELETE /auth/me` (Apple Guideline 5.1.1(v) compliance) deletes the user's
bookings outright, detaches (doesn't delete) any salons they own
(`ownerId: null`), then deletes the `User` row — all in one transaction.

## 4. Every endpoint

Global `ValidationPipe({ whitelist: true, transform: true })` — unknown
body/query fields are stripped, and values are coerced to their declared
types.

### `auth` — base path `/auth`

| Method & path | Guard | Request | Response | Notes |
|---|---|---|---|---|
| `POST /auth/register` | Public | `{ email, password (≥8), name }` | `{ token, user: Profile }` | 409 if email taken |
| `POST /auth/login` | Public, 200 | `{ email, password }` | `{ token, user: Profile }` | 401 on mismatch |
| `POST /auth/guest` | Public | — | `{ token, user: Profile }` | fresh guest `User` every call |
| `POST /auth/forgot-password` | Public, 200 | `{ email }` | `{ ok: true }` (+`devCode` outside prod) | never errors on unknown email |
| `POST /auth/reset-password` | Public, 200 | `{ email, code (6 digits), password (≥8) }` | `{ ok: true }` | 400 "Invalid or expired code" |
| `GET /auth/me` | authenticated | — | `Profile` | |
| `DELETE /auth/me` | authenticated, 200 | — | `{ ok: true }` | permanently deletes the account |

`Profile`: `{ id, email, name, role: 'customer'|'provider'|'admin', isGuest }`.

### `salons` — base path `/salons`, controller-level `@Public()`

| Method & path | Request | Response | Notes |
|---|---|---|---|
| `GET /salons` | Query `{ category?, search?, lat?, lng? }` | `SalonJson[]` | `category` filters via array `has`; `search` is case-insensitive `contains` on name/tagline; ordered by `coverSeed asc` (stable catalogue order); `distanceKm` recomputed via haversine when `lat`/`lng` given, else falls back to the stored static value |
| `GET /salons/:id` | same query | `SalonJson` | 404 if not found |
| `GET /salons/:id/availability` | Query `{ date: YYYY-MM-DD, durationMinutes, staffId? }` | `string[]` (UTC ISO, 30-min grid) | delegates to shared `AvailabilityService`; 404/400 on bad salon/staff |

`SalonJson`: `{ id, ownerId, name, tagline, about, address, distanceKm, rating, reviewCount, categories: string[], openHour, closeHour, isFeatured, coverSeed, autoConfirmBookings, services: ServiceJson[], staff: StaffJson[], reviews: ReviewJson[] }`
— `ServiceJson: { id, name, description, durationMinutes, price: number, category }`,
`StaffJson: { id, name, role, rating }`,
`ReviewJson: { id, authorName, rating, comment, date: ISO }` (newest first).

### `bookings` — base path `/bookings`, every route requires auth

| Method & path | Request | Response | Notes |
|---|---|---|---|
| `GET /bookings` | — | `BookingJson[]` | flips the caller's own overdue-`PENDING` bookings to `EXPIRED` first; returns their bookings newest-`start`-first |
| `POST /bookings` | `{ salonId, start (UTC ISO), serviceNames: string[], serviceIds?, staffName?, staffId? }` | `BookingJson` (201) | see behavior below |
| `POST /bookings/:id/cancel` | — | 204 | 404 if not the caller's (unless caller is `ADMIN`, who can cancel anyone's) |

**`POST /bookings` behavior**: 404 if `salonId` unknown. Services are
resolved server-side by id or exact name against the salon's live rows —
**client-sent price/duration is never trusted**; totals are always
recomputed. 400 on unknown service/staff id or name. `end = start +
totalDurationMinutes`. Sweeps that salon's own lapsed `PENDING` bookings to
`EXPIRED` first. Inside a transaction: a friendly pre-check for overlaps
throws `ConflictException` ("That slot has just been taken.") — the *real*
guarantee is the DB exclusion constraint (`23P01`), also mapped to 409.
`autoConfirmBookings == true` (default) → created `CONFIRMED`, no expiry.
`false` → created `PENDING`, `expiresAt = now + 24h`, still holding the slot.
Salon/service/staff details are snapshotted onto the row.

`BookingJson`: `{ id, salonId, salonName, salonAddress, coverSeed, serviceNames: string[], staffName: string|null, start: ISO, totalDurationMinutes, totalPrice, status: 'pending'|'confirmed'|'declined'|'expired'|'cancelled', expiresAt: ISO|null }`.

### `provider` — base path `/provider`, `@Roles(PROVIDER)`

Every route is scoped to "the salon owned by the caller"
(`Salon.findFirst({ where: { ownerId } })`) — 404 "No salon is linked to this
provider account" if none.

| Method & path | Request | Response | Notes |
|---|---|---|---|
| `GET /provider/salon` | — | `SalonJson` | full salon incl. services/staff/reviews |
| `PATCH /provider/salon` | `{ name?, tagline?, about?, address?, openHour? (0-23), closeHour? (1-24), autoConfirmBookings? }` | `SalonJson` | partial update |
| `POST /provider/services` | `{ name, description, durationMinutes (int, ≥5), price (≥0), category }` | `ServiceJson` (201) | |
| `PATCH /provider/services/:id` | same, optional | `ServiceJson` | 404 if not caller's |
| `DELETE /provider/services/:id` | — | 204 | 404 if `count === 0` |
| `POST /provider/staff` | `{ name, role, rating? (0-5, default 5) }` | `StaffJson` (201) | |
| `PATCH /provider/staff/:id` | same, optional | `StaffJson` | 404 if not caller's |
| `DELETE /provider/staff/:id` | — | 204 | 404 if `count === 0` |
| `GET /provider/bookings` | Query `?date=YYYY-MM-DD` (salon wall-clock day, optional) | `(BookingJson & { customerName })[]` | sweeps lapsed first; `PENDING`+`CONFIRMED` only; `customerName` is `'Guest'` for guest customers |
| `POST /provider/bookings/:id/accept` | — | `BookingJson & { customerName }` (201) | see below |
| `POST /provider/bookings/:id/decline` | — | `BookingJson & { customerName }` (201) | see below |

**Accept/decline**: a guarded `updateMany` only transitions a row that is
still `PENDING` (and not past `expiresAt`), on the caller's own salon — this
makes a double-tap, a stale UI, or a race between two devices resolve to
exactly one winner. `count === 0` → 404 if the booking doesn't exist on this
salon at all, else 409 `"This request is no longer pending (<status>)."`.

### `admin` — base path `/admin`, `@Roles(ADMIN)`

| Method & path | Request | Response | Notes |
|---|---|---|---|
| `GET /admin/salons` | — | `SalonJson[]` | ordered by `name asc` |
| `POST /admin/salons` | `{ id (caller-supplied PK), name, tagline, about, address, distanceKm (≥0), categories: string[], openHour (0-23), closeHour (1-24), coverSeed (int, ≥0), ownerId? }` | `SalonJson` (201) | no lat/lng fields → defaults to `0, 0`; `rating`/`reviewCount` start at 0, `isFeatured` false |
| `PATCH /admin/salons/:id` | `{ name?, tagline?, about?, address?, distanceKm?, categories?, openHour?, closeHour?, isFeatured?, ownerId?\|null }` | `SalonJson` | 404 on Prisma `P2025` |
| `DELETE /admin/salons/:id` | — | 204 | 409 if the salon has any bookings; 404 on `P2025` |
| `GET /admin/users` | — | `UserJson[]` | ordered `createdAt asc`; `{ id, email, name, role, isGuest, createdAt: ISO }` |
| `PATCH /admin/users/:id` | `{ role?: 'customer'\|'provider'\|'admin', name? }` | `{ id, email, name, role }` | 404 on `P2025` |
| `GET /admin/bookings` | Query `{ salonId?, customerId?, status?: 'confirmed'\|'cancelled' }` | `AdminBookingJson[]` | `= BookingJson & { customerId, customerName, customerEmail }`, ordered `start desc`. **Note**: `status` only allow-lists `confirmed`/`cancelled` — you can't filter by `pending`/`declined`/`expired` through this param |

## 5. Cross-cutting conventions

### Error shaping

No custom `ExceptionFilter` exists. All errors are Nest's built-in
`HttpException` subclasses thrown directly from services:
`NotFoundException` (404), `BadRequestException` (400), `ConflictException`
(409), `UnauthorizedException` (401 — also thrown implicitly by the Passport
strategy), and implicit `ForbiddenException` (403) from `RolesGuard`. Nest's
default filter shapes these as `{ statusCode, message, error }`.
`ValidationPipe` turns `class-validator` failures into 400s with a `message`
array. Prisma "not found" (`P2025`) is caught in `admin.service.ts` and
remapped to `NotFoundException`; the Postgres exclusion violation (`23P01`)
is caught in `bookings.service.ts` and remapped to `ConflictException`.

### Timezone / UTC (`src/common/timezone.ts`) — load-bearing convention

- **Every instant on the wire** (booking `start`/`end`, availability slots)
  is UTC ISO-8601.
- **Wall-clock fields** — `Salon.openHour`/`closeHour`, and any
  `date=YYYY-MM-DD` query param — are the **salon market's local time**, not
  the server's and not UTC.
- v1 is single-market: `SALON_TIMEZONE` (IANA name, env var, default
  `Africa/Johannesburg`) is a **module-level constant read once at startup**,
  not per-salon. Going multi-market later means moving this onto the `Salon`
  row — contained, since every caller already funnels through
  `salonWallClockToUtc`.
- Implementation uses `Intl.DateTimeFormat` with a two-pass DST correction,
  verified by `timezone.spec.ts`. Production servers are assumed to run in
  UTC.

### Currency

**There is no currency field or formatting logic anywhere in the backend.**
`price`/`totalPrice` are plain `Decimal(10,2)` → plain JS `number` on the
wire. ZAR formatting is entirely a client-app concern — the API is
currency-agnostic by design.

### Global pipes/interceptors

- `ValidationPipe({ whitelist: true, transform: true })`, globally.
- `app.enableCors()` — wide open, no origin restriction.
- Swagger mounted at `GET /docs`, Bearer auth scheme configured.
- No global interceptors.
- Two global guards via `APP_GUARD`: `JwtAuthGuard` then `RolesGuard`.
- `PrismaModule` is `@Global()`.

## 6. Running it locally

See [06 — Local dev setup](./06-local-dev-setup.md) for the full walkthrough
across all four repos. Backend-specific quick reference:

| Script | Command |
|---|---|
| `npm run start:dev` | `nest start --watch` — the normal dev loop |
| `npm run build` | `nest build` |
| `npm run lint` | `eslint --fix` |
| `npm run test` | unit specs (Jest) |
| `npm run test:e2e` | e2e specs — **hits the real dev Postgres DB**, seed must have run first |

**Env vars** (`.env.example`): `DATABASE_URL`, `JWT_SECRET`, `PORT`. Two more
are read in code but not in the template: `SALON_TIMEZONE` (optional,
defaults to `Africa/Johannesburg`) and `NODE_ENV` (gates whether
`/auth/forgot-password` echoes `devCode`).

**Seed data** (`npx prisma db seed`) gives you, among other things:
- Admin: `admin@beautyhub.app` / `admin_dev_password`
- Guest: `guest@beautyhub.app`
- Providers: `owner-velvet@beautyhub.app`, `owner-kings@…`, `owner-lotus@…`,
  `owner-polished@…`, `owner-glowlab@…`, `owner-braided@…`, `owner-blush@…`,
  `owner-groom@…` — all `provider_dev_password`

> **The committed `README.md` is unmodified NestJS boilerplate** and doesn't
> reflect this project at all — don't rely on it beyond the generic `npm run`
> commands. This doc, `.env.example`, and `prisma/seed.ts` are the real
> source of truth for local setup.

# 04 — Admin app (`beautyhub-admin`)

Next.js 16 (App Router) + React 19 + TypeScript, built on **Refine**
(`@refinedev/core`/`antd`) for the CRUD scaffolding and **Ant Design** for
every UI component. Internal-only tool for platform staff. This is by far
the smallest of the four repos: **15 source files, ~440 lines total** — you
can read the whole thing in under 20 minutes. The leverage here is in
understanding Refine's `resources`/`dataProvider`/`authProvider` contract,
not this repo's own code.

> **`AGENTS.md`** (included by `CLAUDE.md` via `@AGENTS.md`) warns: *"This is
> NOT the Next.js you know... Read the relevant guide in
> `node_modules/next/dist/docs/` before writing any code."* This checks out —
> the repo genuinely runs Next.js 16.2.10 with a real vendored local docs
> folder at that path, newer than most training data. Nothing in the current
> code actually uses exotic new APIs (it's ordinary App Router: async server
> components, `redirect()`, route groups), but double-check against the
> vendored docs rather than assumed prior knowledge if the Next.js APIs feel
> unfamiliar.

## 1. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2.10, App Router only (no `pages/`) |
| UI runtime | React 19.2.4 |
| Admin scaffolding | Refine — `@refinedev/core` 5, `@refinedev/antd` 6, `@refinedev/nextjs-router` 7. Resource-based routing, data-provider abstraction, auth-provider abstraction, pre-built list/create/edit pages |
| Components | Ant Design 5 (`antd`, `@ant-design/icons`, SSR via `@ant-design/nextjs-registry`) — no Tailwind, no CSS Modules |
| State | None of your own — entirely delegated to Refine's hooks (`useTable`, `useForm`, `useList`, `useCustomMutation`), which wrap `@tanstack/react-query` internally as a transitive dependency. No explicit React Query setup anywhere in app code |
| Auth cookie | `js-cookie` |
| Tests | **None.** No Jest/Vitest/Playwright config, no test files, anywhere |

## 2. Every route

Routes live under `src/app`. A route group `(dashboard)` (invisible in the
URL) wraps every authenticated page behind one shared layout.

| Route | File | Renders | Auth |
|---|---|---|---|
| `/login` | `login/page.tsx` | Refine's built-in `<AuthPage type="login">` (register/forgot-password/remember-me all disabled) | No |
| `/` | `(dashboard)/page.tsx` | Dashboard — 4 stat cards: salon count, user count, confirmed-booking count, revenue (client-side sum of confirmed booking prices) | Yes |
| `/salons` | `(dashboard)/salons/page.tsx` | Table of all salons — name, address, category tags, rating, hours, featured badge, owner ID; edit/delete row actions | Yes |
| `/salons/create` | `.../salons/create/page.tsx` | Create form — id/slug, name, tagline, about, address, distance, categories, open/close hour, `coverSeed`, optional owner user ID | Yes |
| `/salons/edit/[id]` | `.../salons/edit/[id]/page.tsx` | Edit form — same fields, plus a Featured toggle | Yes |
| `/users` | `(dashboard)/users/page.tsx` | Table of all users — name, email, role tag, guest flag, joined date; edit action | Yes |
| `/users/edit/[id]` | `.../users/edit/[id]/page.tsx` | Edit form — email (read-only), name, role dropdown | Yes |
| `/bookings` | `(dashboard)/bookings/page.tsx` | Table of all bookings — salon, customer, services, staff, start time, price, status; status filter; Cancel action (confirmed only, w/ confirm popover) | Yes |

Two gaps worth knowing about, since they're easy to assume exist: **no
bookings create/edit page** (cancellation is a custom mutation button, not a
Refine edit form — by design, but undocumented anywhere in-app), and **no
user-create page** (new users originate from the mobile apps' own
registration/guest flows, never from here).

## 3. What an admin can actually do

1. **Log in.** Any account works credential-wise, but the app refuses the
   session client-side unless `role === "admin"` on the response — "This
   account does not have admin access."
2. **View the dashboard**: 4 numbers, nothing more (no charts, no trends).
3. **Manage salons, full CRUD**, including hand-entering a primary-key slug
   (`id`) and a numeric `coverSeed` — the create form's own tooltip explains
   it: *"Picks the gradient shown in the customer app until real photos
   exist."* Deleting a salon is blocked by the backend (409) if it has any
   bookings.
4. **Manage users**: browse everyone, edit display name + role (promote/demote
   between customer/provider/admin). No password reset, no email change, no
   ban/suspend, no create.
5. **Manage bookings**: browse every booking platform-wide, filter by
   confirmed/cancelled, and cancel a confirmed one. Nothing else — no
   create/edit/reschedule.

**What's explicitly *not* here**, since it's easy to assume it exists on a
platform like this: no salon-application approval workflow (salons go live
the instant an admin creates them — there's no "pending" concept modeled
anywhere), no per-salon services/staff management, no analytics beyond the 4
stat tiles, no payments/payouts, no review moderation, no platform settings.
This reads as a lean internal ops/support tool — fix a record, look someone
up, cancel a problem booking — not a vendor-approval or analytics platform.

## 4. Backend communication

`src/lib/api.ts` — `apiFetch<T>()`, a thin wrapper over `fetch`: prefixes
`API_URL`, sets `Content-Type`/`Authorization: Bearer <token>`, treats `204`
as `undefined`, and parses NestJS's `{ statusCode, message }` error shape
(joining array messages with `, `) into a custom `ApiError(message, statusCode)`.

`API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"`. The
admin app itself runs on **port 3001** (`next dev -p 3001`) specifically to
avoid colliding with the API on 3000.

Refine's `dataProvider` (`src/lib/data-provider.ts`) maps its generic
resources straight onto the backend's dedicated admin sub-API:

```
salons   -> /admin/salons     (GET list, POST create, PATCH :id, DELETE :id)
users    -> /admin/users      (GET list, PATCH :id)
bookings -> /admin/bookings   (GET list, ?salonId / ?customerId / ?status)
```

`/admin/*` on the backend requires a JWT with `role === ADMIN`
(`@Roles(Role.ADMIN)` + the global `JwtAuthGuard`) — see
[01 — Backend § admin](./01-backend.md#admin--base-path-admin-rolesadmin).
The **one exception**: booking cancellation goes through the general
`POST /bookings/:id/cancel` (shared with the customer app), not an
admin-prefixed route — the backend explicitly allows this for admins
(`user.role !== Role.ADMIN` is the only bar in the ownership check), so an
admin can cancel *anyone's* booking through the same endpoint a customer uses
for their own.

> **Scalability caveat worth flagging**: `getList` in `data-provider.ts`
> fetches the **entire, unpaginated** resource list on every page load and
> does pagination/sorting/most filtering **client-side**. Only booking
> filters (`salonId`, `customerId`, `status`) are pushed down as real
> query-string params. This is fine at seed-data scale; it will need
> revisiting before this handles production-scale tables.

## 5. Auth

Login POSTs to the same `/auth/login` every client uses (30-day JWT). The
admin app layers one **additional client-side gate**: even with valid
credentials, if `user.role !== "admin"` the session is refused and the token
is never stored.

**Session storage**: a plain (**non-httpOnly**) cookie, `beautyhub-admin-token`,
30-day expiry, `sameSite: lax`, set via `js-cookie` — JS-readable by design,
not a secure httpOnly cookie.

**Route protection is two layers, and both are explicitly commented in code
as UI-only, not a security boundary:**

1. **Server-side** (the real gate for page rendering): `(dashboard)/layout.tsx`
   is an async Server Component that reads the cookie via `next/headers`,
   **decodes the JWT payload without verifying its signature** (plain
   base64 decode, `src/lib/jwt.ts`), and checks `role === "admin"`
   case-insensitively. Fails → `redirect("/login")` before any dashboard UI
   renders. There's **no `middleware.ts`** — this check lives inside the
   layout component, not Next.js Middleware.
2. **Client-side**: Refine's `authProvider.check()` does the identical
   cookie-read/decode/role-check, used for `useIsAuthenticated` and to bounce
   back to `/login` on a 401/403 from any data-provider call
   (`authProvider.onError()`).

The code says this outright in a comment, and it's correct: **the backend's
`@Roles(ADMIN)` guard is the real authority.** Don't mistake either
JS-side check for a security boundary when reasoning about what's actually
protected — a forged or manually-crafted cookie would sail past both layers
here and only get stopped when it actually hits the backend.

## 6. Data fetching pattern

Overwhelmingly `"use client"` + Refine hooks: `useList` (dashboard stats),
`useTable` (list pages — pagination/sort/filter synced to the URL via
`syncWithLocation: true`), `useForm` (create/edit), `useCustomMutation` (the
ad-hoc booking-cancel button). All backed by React Query under Refine's
hood — no manual cache code anywhere in the app.

Server Components are used for exactly one thing: the auth gate in
`(dashboard)/layout.tsx`. There are **no Route Handlers** (`app/api/*`) — all
API traffic goes straight from the browser to `beautyhub-api`; the Next.js
server itself never proxies a data call.

## 7. Project structure

| Path | Responsibility |
|---|---|
| `src/app/layout.tsx` | Root shell, wraps in `Suspense` + `Providers` |
| `src/app/providers.tsx` | Client provider tree: antd SSR registry → `ConfigProvider` (Refine Blue theme) → antd `App` → `<Refine>` itself (resources, router/data/auth/notification providers all wired here) |
| `src/app/login/page.tsx` | Public login page |
| `src/app/(dashboard)/` | `layout.tsx` (server auth gate), `shell.tsx` (client sidebar chrome), `title.tsx`, `page.tsx` (dashboard), `salons/`, `users/`, `bookings/` |
| `src/lib/api.ts` | `apiFetch`, `API_URL`, `ApiError`, `formatMoney` |
| `src/lib/auth-provider.ts` | Refine `AuthProvider` (login/logout/check/onError/getIdentity) |
| `src/lib/auth-check-server.ts` | Server-only `isAdminAuthenticated()` for the layout gate |
| `src/lib/data-provider.ts` | Refine `DataProvider` — resource↔`/admin/*` mapping, client-side pagination/filter/sort |
| `src/lib/jwt.ts` | `decodeJwt()` — non-verifying base64 payload decode |
| `public/` | Still the unmodified `create-next-app` default assets — no custom branding yet |

No `src/components/`, `src/hooks/`, `src/types/`, `src/utils/`, or test
directory of any kind.

## 8. Running it locally

```json
"dev":   "next dev -p 3001"
"build": "next build"
"start": "next start -p 3001"
"lint":  "eslint"
```

Only env var read: `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:3000`).
**No `.env.example` is committed** — only a gitignored `.env.local`. Worth
adding one as onboarding polish; a new engineer currently has nothing to
copy from.

To run: get `beautyhub-api` up and seeded (with at least one `ADMIN` user —
`admin@beautyhub.app` / `admin_dev_password` from the seed script), then:

```sh
npm install
npm run dev        # http://localhost:3001
```

> **`README.md` is entirely unmodified `create-next-app` boilerplate** —
> Geist font links, "Deploy on Vercel," nothing project-specific. It doesn't
> mention the backend dependency, Refine, Ant Design, or port 3001. Don't
> trust it; this doc is the source of truth.

## 9. Maturity

Two commits in the git history (`Initial commit from Create Next App` →
`Build admin dashboard on Next.js + Refine + Ant Design`) — this is a
from-scratch, single-pass build, not something iterated on over time. Treat
it accordingly: no tests, no `.env.example`, boilerplate README, default
favicon/branding, and the scalability shortcut in §4. None of that is a
crisis for an internal tool at current scale, but it's exactly the kind of
thing worth fixing opportunistically the next time you're in this repo for a
feature, rather than assuming someone already got to it.

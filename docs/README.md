# BeautyHub engineering docs

Welcome. BeautyHub (business name **StylistsHub**, code hasn't caught up yet) is
a multi-vendor salon/barber marketplace for South Africa — "Uber for beauty."
This is the documentation hub for the whole system: one shared backend and
three clients built by (and for) a very small team.

Start with the [**overview**](./00-overview.md) — it explains how the four
repos fit together and is the fastest way to get oriented. After that, read
whichever app you're actually going to touch.

| Doc | Covers |
|---|---|
| [00 — Overview](./00-overview.md) | The four repos, how they relate, data flow, who's who |
| [01 — Backend (beautyhub-api)](./01-backend.md) | Every endpoint, the Prisma schema, auth model |
| [02 — Customer app (BeautyHub)](./02-customer-app.md) | Routes, screens, entities, state management |
| [03 — Vendor app (beautyhub_vendor)](./03-vendor-app.md) | Routes, screens, entities, the booking-request flow |
| [04 — Admin app (beautyhub-admin)](./04-admin-app.md) | Routes, what an admin can do, Refine/Ant Design stack |
| [05 — Conventions & gotchas](./05-conventions-and-gotchas.md) | Cross-cutting rules that aren't obvious from any one repo |
| [06 — Local dev setup](./06-local-dev-setup.md) | Running all four pieces together on your machine |

## The one-paragraph version

A customer books an appointment at a salon through the **customer app**
(Flutter, iOS+Android). The salon owner manages their listing, services,
staff, and incoming bookings through the **vendor app** (Flutter,
Android-first). Internal staff administer the whole platform — salons, users,
bookings — through the **admin app** (a small Next.js web tool). All three
talk to one **NestJS + Postgres backend**, `beautyhub-api`, which is the only
thing that touches the database.

## Repo map

| Repo | Path (this machine) | Stack | Who uses it |
|---|---|---|---|
| `beautyhub-api` | `D:\Mobile_Apps\beautyhub-api` | NestJS 11, Prisma 6, PostgreSQL | Everyone — the shared backend |
| `BeautyHub` | `D:\Mobile_Apps\BeautyHub` | Flutter, Riverpod (no codegen), go_router | Customers |
| `beautyhub_vendor` | `D:\Mobile_Apps\beautyhub_vendor` | Flutter, Riverpod (no codegen), go_router | Salon/barbershop owners |
| `beautyhub-admin` | `D:\Mobile_Apps\beautyhub-admin` | Next.js 16 (App Router), Refine, Ant Design | Internal staff |

## Where things stand (2026-08)

This is a pre-revenue MVP, not a mature product — a few things worth knowing
up front so nothing here reads as more finished than it is:

- **No production deployment yet.** Everything runs locally. Railway is the
  planned host for the backend; nothing is provisioned.
- **No payments.** Stripe integration is an open TODO on the customer app;
  Stripe has no direct South Africa merchant support, so Paystack (Stripe-owned)
  is the likely path — not yet decided.
- **No vendor photos.** Salons render as a deterministic gradient
  (`Salon.coverSeed`) instead of a real photo anywhere in the system. There's
  no image upload/CDN pipeline at all yet.
- **Admin app has no approval workflow.** Salons go live the instant an admin
  creates them; there's no "pending vendor application" concept anywhere in
  the code.
- **Push notifications are planned, not built.** See
  [03 — Vendor app § Booking-request flow](./03-vendor-app.md) for why this is
  the next priority.

None of that should stop you from shipping — just don't assume a feature
exists because it would make sense to exist. Grep first.

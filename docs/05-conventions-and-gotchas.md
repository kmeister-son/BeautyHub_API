# 05 — Conventions & gotchas

Rules that span repo boundaries. None of these are obvious from reading any
one codebase in isolation — they only show up once you compare all four.

## Timezone / UTC — the rule that will bite you first

**Every instant that crosses the network is UTC ISO-8601.** Booking
`start`/`end`, availability slot strings, timestamps in general — all UTC on
the wire, always.

**Wall-clock fields are the one deliberate exception**, and they're in the
**salon market's local time**, never UTC and never the server's own
timezone:
- `Salon.openHour` / `Salon.closeHour`
- The `date=YYYY-MM-DD` query param on `GET /salons/:id/availability` and
  `GET /provider/bookings`

The conversion between the two lives in exactly one place on the backend —
`src/common/timezone.ts`'s `salonWallClockToUtc()` — and is DST-aware via
`Intl.DateTimeFormat`. v1 is single-market: the timezone is one process-wide
`SALON_TIMEZONE` env var (default `Africa/Johannesburg`), not per-salon.
Going multi-market means moving this onto the `Salon` row — contained,
because every caller already funnels through the one helper.

**On each Flutter client**, `.toLocal()` is called in exactly one place:
`lib/data/api/api_mappers.dart`. If you ever see a raw `DateTime.parse(...)`
without `.toLocal()` anywhere else in either Flutter app, or a manual
timezone offset calculation outside `common/timezone.ts` on the backend,
that's a bug waiting to happen, not a new pattern to follow.

## Currency — ZAR, and the backend doesn't know it

The API is **currency-agnostic on purpose**. `SalonService.price` and
`Booking.totalPrice` are plain `Decimal(10,2)` → plain JS `number` on the
wire — no currency code, no formatting, nothing backend-side names "ZAR"
anywhere.

Every client formats independently, and there are now **three separate
formatter implementations** doing the same job:

| Client | Where | Approach |
|---|---|---|
| Customer app | `lib/core/utils/formatters.dart`, `Formatters.money()` | `NumberFormat.currency(locale: 'en_ZA', symbol: 'R', ...)` |
| Vendor app | `lib/core/utils/formatters.dart`, `Formatters.money()` | Same shape, independently maintained copy |
| Admin app | `src/lib/api.ts`, `formatMoney` | Its own implementation |

**If currency or locale ever changes, it's a three-repo edit**, not a
one-line config change. There's no shared package backing this. Both
Flutter apps' formatter files carry a comment that Stripe integration (still
pending) must read `currencyCode`/`Formatters.currencyCode` rather than
hardcoding `'ZAR'` a second time — worth keeping that discipline if you're
the one wiring up payments, since Stripe itself doesn't support South Africa
directly (Paystack, Stripe-owned, is the likely path, not yet decided).

## Auth tokens — one shape, three very different client behaviors

All identities across the whole system are JWTs signed with the same
`JWT_SECRET`, with the same payload shape (`{ sub, email, role }`). What
differs entirely is **what each client does when a call comes back 401**:

| Client | On 401 for a *registered* identity | On 401 for a *guest* |
|---|---|---|
| Customer app | Clears token, throws `SessionExpiredException` — never silently re-mints a signed-in user | Clears token, **silently re-mints a new guest + retries once** |
| Vendor app | Clears token, throws `UnauthenticatedException` — no retry, no guest concept exists at all | n/a — this app has no guest identity |
| Admin app | Clears cookie, redirects to `/login` via `authProvider.onError()` | n/a |

**Neither Flutter app has a global "force back to login" interceptor** for a
dead *registered* session. The customer and vendor apps both only guarantee
a redirect from their respective splash screens on the *next* launch — a
screen already open mid-session when the token dies will show an inline
error, not auto-navigate. If you're debugging a report of "the app just sits
there showing an error after being backgrounded overnight," this is why —
it's a known architectural gap in both Flutter apps, not a regression to
chase.

The admin app is the only client with a real centralized 401 handler
(`authProvider.onError()`), because Refine provides that hook for free — but
its route protection is explicitly documented in its own code comments as
**UI-only**. The actual authorization boundary everywhere is the backend's
`@Roles()` guard, full stop. Never reason about what's "protected" by
looking at client-side checks alone.

## Errors are typed, and no screen shows a raw exception — but nothing propagates automatically

Both Flutter apps map every backend error through **one function** each
(`friendlyErrorMessage` — separately implemented per app, same shape) before
it ever reaches a widget. The admin app maps through its own `ApiError`
class. All three parse the same underlying NestJS error shape
(`{ statusCode, message }`, where `message` can be a string or an array of
validation messages), but **there is no shared error-mapping code** between
them.

**Consequence**: if you add a new backend error case — a new `ConflictException`
message, a new 4xx status a client should special-case — you need to
separately teach up to three clients about it. Nothing on the backend side
propagates that automatically. When you're adding backend error handling,
check whether any client needs a matching update before calling the work
done.

## Photos don't exist — anywhere

There is no image upload, no CDN, no photo pipeline in any of the four
repos. Every salon "photo" — customer app salon cards, vendor app storefront
preview, booking cards — is actually `SalonCover`, a deterministic gradient
picked by `Salon.coverSeed % 8` from a fixed 8-gradient palette, with an
emoji overlay. `Booking.coverSeed` is snapshotted from the salon at booking
time specifically so a booking card can render the same gradient without a
live salon lookup. The admin app's salon-create form has a `coverSeed` field
with a tooltip that says this outright: *"Picks the gradient shown in the
customer app until real photos exist."*

If you're asked to "add photo upload," this is greenfield in all four repos
— there's no partial implementation anywhere to build on.

## No shared code between the two Flutter apps

The customer and vendor apps independently re-implement near-identical
infrastructure: theme (`AppColors`, gradient palette), `Formatters`,
`SalonCover`, the `ApiClient`/`ApiException` shape, the Riverpod-without-codegen
house style. This is a deliberate choice for two small, independently
deployable apps this early — not an oversight. Don't go looking for a shared
Dart package; there isn't one. If you fix a formatting bug in one app (like
the vendor app's stray "Price ($)" label, see
[03 — Vendor app](./03-vendor-app.md)), it does **not** fix the same class of
bug in the other — check both.

## Booking data is a receipt, not a live reference

`Booking` (customer app) and `VendorBooking` (vendor app) both snapshot
`salonName`, `salonAddress`, `coverSeed`, `serviceNames` (as strings, not
IDs), and `staffName` (as a string, not an ID) at creation time. This is
intentional: editing or deleting a service/staff member later must never
retroactively change what a past booking says it was. If you're adding a
feature that touches booking display and find yourself wanting to join back
to a live `SalonService`/`StaffMember` row for "fresher" data, that's
probably the wrong instinct — the snapshot is the point.

## Approval workflows don't exist yet

Nowhere in the system — not the admin app, not the backend schema — is
there a "pending vendor application" or "salon approval" concept. An admin
creates a salon and it's live immediately; there's no intermediate state.
If a task references "approving a new salon" or "vendor onboarding review,"
check with whoever assigned it — it may be describing a feature that doesn't
exist yet, not one you're missing in the code.

## Dev credentials (seeded via `beautyhub-api`'s `prisma/seed.ts`)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@beautyhub.app` | `admin_dev_password` |
| Guest | `guest@beautyhub.app` | — (no password, guest identity) |
| Provider (e.g.) | `owner-velvet@beautyhub.app` | `provider_dev_password` |

Full list of seeded owner accounts in
[01 — Backend § Running it locally](./01-backend.md#6-running-it-locally).
The vendor app's mock repository (test-only) separately accepts *any* email
starting with `owner-` — don't confuse that mock convenience with what the
real seeded accounts actually are.

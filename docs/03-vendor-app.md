# 03 — Vendor app (`beautyhub_vendor`)

Flutter, Riverpod (no codegen), go_router. Android-first (iOS follows once
Apple Developer enrollment lands). Used by salon/barbershop owners to run
their business. Talks to `beautyhub-api`'s `/provider/*` endpoints, which are
implicitly scoped to "the salon owned by the caller" — the app never passes
a salon ID on any provider-scoped call.

> Every claim in this app's `CLAUDE.md` was checked against the code while
> writing this doc and holds up, with one addition worth flagging: CLAUDE.md
> says a 401 mid-session "routes to `/login`" — that's only fully true from
> the **splash screen's** perspective. See §6 for the nuance.

## 1. Routes (`lib/core/router/app_router.dart`)

| Path | Screen | Navigator | Params |
|---|---|---|---|
| `/` | `SplashScreen` | root | — |
| `/login` | `LoginScreen` | root | — |
| `/forgot-password` | `ForgotPasswordScreen` | root | pushed (not `go`'d) so back returns to login |
| `/schedule` | `ScheduleScreen` | shell tab 0 | — |
| `/services` | `ServicesScreen` | shell tab 1 | — |
| `/staff` | `StaffScreen` | shell tab 2 | — |
| `/salon` | `SalonScreen` | shell tab 3 | — |
| `/services/edit` | `ServiceEditorScreen` | root, full-screen | query `id` (absent = create) |
| `/staff/edit` | `StaffEditorScreen` | root, full-screen | query `id` (absent = create) |
| `/salon/edit` | `SalonEditorScreen` | root, full-screen | — |

`VendorShell` hosts a 4-destination `NavigationBar`: Schedule, Services, Team
(`/staff`), My salon. Services and Staff tab bodies coexist in the shell's
`IndexedStack`, which is why their FABs need distinct `heroTag`s
(`'add-service-fab'` / `'add-staff-fab'`) — grep for `heroTag` if you add a
fourth FAB and hit a Hero-animation collision.

## 2. Screens by feature folder (7 folders: `auth, salon, schedule, services, shell, splash, staff`)

### `features/auth/`
No self-registration anywhere — no `/register` route, no signup screen file.
The login footer says it outright: *"Vendor accounts are created when your
salon joins BeautyHub. Contact partners@beautyhub.app to get listed."*

- **Login** — validates client-side, calls `signIn`. On success, invalidates
  `currentVendorProvider` + `vendorSalonProvider`, then `go('/schedule')`.
  401 → "Incorrect email or password."; any other `ApiException` shows
  `e.message` verbatim (this is how the 403 "not a salon owner" message
  surfaces — see §6); anything else → "Could not reach BeautyHub. Check your
  connection."
- **Forgot password** — same two-step pattern as the customer app.

### `features/salon/`
`vendor_providers.dart` hosts the two providers everything else depends on
(`currentVendorProvider`, `vendorSalonProvider` — see §5). `salon_screen.dart`
is the storefront/account tab: cover + rating + tagline + hours, an
appearance card (theme mode), an account card with sign-out. `salon_editor_screen.dart`
edits name/tagline/about/address/hours, and hosts the single most important
toggle in the app:

> **`SwitchListTile` — "Confirm bookings instantly."** This is
> `Salon.autoConfirmBookings`. Its subtitle spells out the consequence
> directly to the owner: *"Every booking arrives as a request you accept or
> decline. Requests expire after a day."* See §9.

### `features/schedule/`
`schedule_providers.dart`: `scheduleDateProvider` (`StateProvider<DateTime>`,
defaults to today) and `scheduleProvider` (`FutureProvider<List<VendorBooking>>`,
keyed on the date). `schedule_screen.dart` is the owner's day view — see §9
for the full behavior, since this screen *is* the booking-request feature.

### `features/services/` and `features/staff/`
Simple CRUD lists scoped to the owner's one salon. Both editors follow the
same shape: create/edit form, delete behind a confirm dialog reassuring the
owner that *"Existing bookings keep their receipt"* (past bookings snapshot
`serviceNames`/`staffName` as strings, not live foreign keys — deleting the
source row doesn't touch history). Staff `role` is free text, not an enum
(e.g. "Senior stylist"). Staff `rating` is **not editable** in this app — it
defaults to 5 on creation and is presumably meant to be review-derived
eventually, though nothing currently connects `Review` rows to a specific
staff member anywhere in the UI.

> **Known cosmetic bug**: `service_editor_screen.dart`'s price field is
> labeled **"Price ($)"** even though the value actually renders as ZAR
> (`Formatters.money()` is correct) everywhere it's displayed. Leftover from
> a USD-first build (`617308f "Switch currency formatting from USD to South
> African rand"`) — the formatter was fixed everywhere except this one label.
> Harmless but worth fixing if you're in that file.

### `features/shell/` and `features/splash/`
`vendor_shell.dart` is purely presentational. `splash_screen.dart` holds for
a minimum 2 seconds while resolving `getCurrentUser()` in parallel; **any**
exception (offline, server down) is swallowed and treated as signed-out —
"land on login, which shows real errors" per the code comment. Routes to
`/schedule` if a provider user resolves, else `/login`.

## 3. Domain entities (`lib/domain/entities/`)

| Entity | Key fields |
|---|---|
| `Salon` | same shape as the customer app's (`name, tagline, about, address, distanceKm, rating, reviewCount, categories, openHour, closeHour, isFeatured, coverSeed, autoConfirmBookings, services, staff, reviews`). `distanceKm` isn't really meaningful for a vendor viewing their own salon — it's carried over from the shared shape |
| `SalonService` | `id, name, description, durationMinutes, price, category` |
| `StaffMember` | `id, name, role, rating`. Computed: `initials` |
| `Review` | `id, authorName, rating, comment, date` — read-only, no vendor UI surfaces individual reviews (only the salon's aggregate `rating`/`reviewCount`) |
| `UserProfile` | `id, email, name, role`. Computed: `isProvider` |
| `VendorBooking` | `id, customerName, serviceNames: List<String>, staffName: String?, start, totalDurationMinutes, totalPrice, status, expiresAt`. Computed: `end`, `isPast`, `isPending` |
| `BookingStatus` | `pending, confirmed, declined, expired, cancelled` |

## 4. Repository contracts (`lib/domain/repositories/`)

```dart
abstract interface class VendorAuthRepository {
  Future<UserProfile?> getCurrentUser();
  Future<UserProfile> signIn({required String email, required String password});
  Future<void> signOut();
  Future<void> requestPasswordReset(String email);
  Future<void> resetPassword({required String email, required String code, required String newPassword});
}

abstract interface class VendorRepository {
  // Everything a signed-in provider can do to the salon they own;
  // every call is scoped server-side to that salon.
  Future<Salon> getSalon();
  Future<Salon> updateSalon({String? name, String? tagline, String? about, String? address, int? openHour, int? closeHour, bool? autoConfirmBookings});
  Future<SalonService> createService({required String name, required String description, required int durationMinutes, required double price, required ServiceCategory category});
  Future<SalonService> updateService(String id, {...});
  Future<void> deleteService(String id);
  Future<StaffMember> createStaff({required String name, required String role});
  Future<StaffMember> updateStaff(String id, {...});
  Future<void> deleteStaff(String id);
  Future<List<VendorBooking>> getBookings(DateTime date); // whole day, salon-local
  Future<VendorBooking> acceptBooking(String id);          // throws if no longer pending
  Future<VendorBooking> declineBooking(String id);
}
```

### Endpoint map (real implementation)

| HTTP | Path | Method |
|---|---|---|
| `GET` | `/auth/me` | `getCurrentUser` |
| `POST` | `/auth/login` | `signIn` (unauthenticated) |
| `POST` | `/auth/forgot-password` | `requestPasswordReset` |
| `POST` | `/auth/reset-password` | `resetPassword` |
| `GET` | `/provider/salon` | `getSalon` |
| `PATCH` | `/provider/salon` | `updateSalon` |
| `POST`/`PATCH`/`DELETE` | `/provider/services[/:id]` | service CRUD |
| `POST`/`PATCH`/`DELETE` | `/provider/staff[/:id]` | staff CRUD |
| `GET` | `/provider/bookings?date=YYYY-MM-DD` | `getBookings` |
| `POST` | `/provider/bookings/:id/accept` \| `/decline` | accept/decline |

Both `ApiVendorRepository` (real) and `MockVendorRepository` (test-only, one
seeded salon "Velvet & Vine") exist. The mock deliberately mirrors the real
API's guard semantics: `MockVendorAuthRepository` throws 401 for a wrong
password and 403 for any email that doesn't start with `owner-`;
`MockVendorRepository._respond` throws `StateError` if you try to
accept/decline a booking that's no longer pending — same shape as the real
409, so widget tests exercise the actual race condition.

## 5. State management pattern

Same house style as the customer app — plain `Provider`/`FutureProvider`/
`StateProvider`, no codegen, no `StateNotifier`/`AsyncNotifier` anywhere — but
**simpler**: this app uses **no `.family` and no `.autoDispose`** at all.
Every provider is a plain global `final` top-level variable.

```dart
// core/di/providers.dart
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());
final vendorAuthRepositoryProvider = Provider<VendorAuthRepository>(
  (ref) => ApiVendorAuthRepository(ref.watch(apiClientProvider)));
final vendorRepositoryProvider = Provider<VendorRepository>(
  (ref) => ApiVendorRepository(ref.watch(apiClientProvider)));

// features/salon/presentation/providers/vendor_providers.dart
final currentVendorProvider = FutureProvider<UserProfile?>(
  (ref) => ref.watch(vendorAuthRepositoryProvider).getCurrentUser());
final vendorSalonProvider = FutureProvider<Salon>(
  (ref) => ref.watch(vendorRepositoryProvider).getSalon());

// features/schedule/presentation/providers/schedule_providers.dart
final scheduleDateProvider = StateProvider<DateTime>((ref) {
  final now = DateTime.now();
  return DateTime(now.year, now.month, now.day);
});
final scheduleProvider = FutureProvider<List<VendorBooking>>(
  (ref) => ref.watch(vendorRepositoryProvider).getBookings(ref.watch(scheduleDateProvider)));
```

Mutations call `ref.read(vendorRepositoryProvider).someMethod(...)` directly
from a `ConsumerStatefulWidget` handler, then `ref.invalidate(vendorSalonProvider)`
(or `scheduleProvider`) to force a refetch — that invalidate call *is* the
entire cache strategy, no manual patching. Pull-to-refresh uses
`ref.refresh(xProvider.future)` directly.

`themeModeProvider` (`core/theme/theme_mode_provider.dart`) is explicitly
**not persisted** — resets to `ThemeMode.system` every cold start; the doc
comment flags this as a known gap ("persist it once real storage lands").

## 6. Auth in detail

**Login-only — no guest, no self-registration.** Exact sequence:

1. `LoginScreen` validates email format + non-empty password.
2. `VendorAuthRepository.signIn(email, password)` → `POST /auth/login`,
   **unauthenticated**.
3. Response mapped to `UserProfile`.
4. **Client-side role gate**: if `!user.isProvider`, throws
   `ApiException(403, "This account is not a salon owner. Use the BeautyHub
   customer app to book appointments.")` — critically, this check happens
   **before** `adoptToken` is called, so a customer's valid token is never
   persisted even though the backend call itself succeeded.
5. If the role check passes, the JWT is persisted to `shared_preferences`
   (`beautyhub_vendor_token`) and cached in memory.
6. On success: invalidate `currentVendorProvider` + `vendorSalonProvider`,
   `go('/schedule')`.

**On 401 for any *other* authenticated request**: `ApiClient` clears the
token and throws `UnauthenticatedException` (a 401 `ApiException` subclass).
**There is no global redirect on this.** `ApiVendorAuthRepository.getCurrentUser()`
explicitly catches it and returns `null` — which is what lets `SplashScreen`
correctly land on `/login` on the *next* launch. But a screen that's already
open mid-session and hits a 401 on some other call just shows the error text
inline (e.g. the schedule screen renders "Could not load the schedule.\n$e")
— the app doesn't force-navigate. In practice this means a session that dies
mid-use can leave stale UI with error banners until the owner manually signs
out via the salon tab. Worth knowing before you go looking for a
"redirect-on-401" interceptor that doesn't exist.

## 7. Backend connectivity

**`lib/core/config/api_config.dart`**:
1. `--dart-define=API_BASE_URL=...` if given.
2. Android (non-web): `http://10.0.2.2:3000` — the special alias the Android
   *emulator* uses to reach its host machine.
3. Else: `http://localhost:3000`.

Note this is a **different default than the customer app** (which points at
a LAN IP for physical-device testing). For a physical vendor-app device, you
need `adb reverse tcp:3000 tcp:3000` plus
`flutter run --dart-define=API_BASE_URL=http://localhost:3000` (documented in
`DeployChecklist.md`, since `10.0.2.2` only resolves inside the emulator).

**`ApiClient`** mirrors the customer app's shape but with one deliberate
difference: it **never mints a guest**. If `authenticated: true` is requested
and no token is stored, it throws `UnauthenticatedException` *before* making
the network call at all.

## 8. Running the app

```sh
flutter pub get
flutter run
flutter analyze         # zero issues, CI-enforced
flutter test             # test/unit/api_client_test.dart, mock_vendor_repository_test.dart, test/widget/vendor_flow_test.dart
```

**Physical device** (per `DeployChecklist.md`, added 2026-07-30):
```sh
# in beautyhub-api: npm run start:dev (Postgres must already be up)
adb reverse tcp:3000 tcp:3000        # re-run this every USB session
flutter run --dart-define=API_BASE_URL=http://localhost:3000
```
A Wi-Fi-only variant is also documented: `adb tcpip 5555` then
`adb connect <ip>:5555`.

**Deps worth noting as absent**: no `firebase_core`/`firebase_messaging` yet
(push notifications are planned, not built — see §9), no crash
reporting/analytics, no image-picker (no photo upload pipeline anywhere),
no `freezed`/`json_serializable` (mapping is hand-written).

**`DeployChecklist.md` highlights**: Play Store listing resolved as a full
public listing (not closed track) as of 2026-07-29 — that pulls in Google's
"App access" declaration requiring **working demo provider credentials**,
since this app is login-only and reviewers can't self-register. Release
signing/keystore done. **#1 open blocker**: backend hosting (Railway, shared
with the customer app) — release builds need a real `--dart-define=API_BASE_URL`.

## 9. Booking-requests vetting flow — the single most important business logic in this app

Shipped together across both Flutter repos on the same day: this repo's
`5d6951f "Add booking request accept/decline to the vendor schedule"` and the
customer app's `2dba7e4 "Show booking requests honestly when a salon vets its
bookings"`.

**The switch**: `Salon.autoConfirmBookings` (default `true`), toggled in
`SalonEditorScreen`.
- **`true`** — a customer's booking confirms instantly, no vendor action
  needed.
- **`false`** — every incoming booking arrives `status: pending` with a
  24-hour `expiresAt`. The customer app is honest about this the whole way
  through: the button says "Request booking" not "Book now," the
  confirmation sheet says "Request sent!," and the customer's bookings list
  shows "Awaiting salon" with a withdraw action. Declined/expired requests
  explain themselves and offer to find another time. None of this overpromises
  a confirmation the salon hasn't actually granted.

**On the vendor side** (`ScheduleScreen`): pending bookings for the selected
day sit in a **requests section above** the day's confirmed appointments, and
are **explicitly excluded from the day's revenue/appointment-count totals**
until accepted — a code comment spells out why: *"Requests the owner still
has to answer sit above the day itself; they hold their slot but aren't part
of the day's takings yet."*

Each `_RequestCard` shows time, customer, services, staff (if assigned),
price, and a live expiry countdown ("Expires in 3h" / "Expired," computed
client-side from `expiresAt - now` on every rebuild), with **Decline**/
**Accept** buttons. Tapping either:
1. Calls `acceptBooking(id)` / `declineBooking(id)`.
2. Shows a confirming snackbar.
3. **Unconditionally** `ref.invalidate(scheduleProvider)` — whether the call
   succeeded or failed — so the list always re-fetches ground truth from the
   server rather than trusting optimistic local state.

This matters because of a genuine race the repository contract calls out
explicitly: *"Throws if it is no longer pending — it may have lapsed or been
answered from another device."* Two owners (or an owner and the 24-hour
expiry sweep) can race to answer the same request; the backend's guarded
`updateMany` (see [01 — Backend § provider](./01-backend.md#provider--base-path-provider-rolesprovider))
resolves it to exactly one winner and everyone else gets a 409 that the UI
surfaces as a snackbar, then reconciles via the unconditional refetch.

**What's next, and isn't built yet**: `notification.md` (same day, this
repo) lays out why push notifications are the next priority — right now an
owner has no way to know a request arrived until they happen to open the
app, and a customer waits up to 24h for a silent expiry if nobody responds.
The plan: FCM, Android-first (iOS blocked on Apple Developer enrollment), a
`DeviceToken` table added to `beautyhub-api`, and three triggers
(booking-created → owner, accept/decline → customer, pending-lapses-to-EXPIRED
→ customer, discovered via the existing lazy sweep rather than a scheduler).
**None of this exists in code yet** — no Firebase dependency in `pubspec.yaml`,
no notification-handling code anywhere in `lib/`.

# 02 — Customer app (`BeautyHub`)

Flutter, Riverpod 2.6.1 (**no codegen**), go_router. iOS + Android. Talks to
`beautyhub-api` as a guest or registered customer. Market: South Africa,
currency ZAR.

> **Correction to `CLAUDE.md`**: it describes the DI bindings as "currently
> in-memory mocks with simulated latency." That's stale — `core/di/providers.dart`
> binds the **real** `ApiSalonRepository`/`ApiBookingRepository`/`ApiAuthRepository`,
> which hit a live `beautyhub-api` over HTTP. The mocks (`Mock*Repository`,
> seeded by `data/mock/mock_salons.dart`) still exist, but only as
> `ProviderScope` overrides inside `test/` — no production code path reaches
> them. Treat that CLAUDE.md line as describing the *test-time* DI seam, not
> production behavior. `README.md` has the same staleness (still describes
> mocks as live, omits auth entirely) — `DeployChecklist.md` is the most
> current source of truth in this repo.

## 1. Routes (`lib/core/router/app_router.dart`)

Single `GoRouter`, `initialLocation: '/'`, one shared root navigator key.

| Path | Screen | Navigator | Params |
|---|---|---|---|
| `/` | `SplashScreen` | root | — auto-navigates to `/home` after a 3s timer |
| `/home` | `HomeScreen` | shell tab 0 | — |
| `/bookings` | `BookingsScreen` | shell tab 1 | — |
| `/profile` | `ProfileScreen` | shell tab 2 | — |
| `/login` | `LoginScreen` | root, full-screen | — |
| `/signup` | `SignupScreen` | root, full-screen | — |
| `/forgot-password` | `ForgotPasswordScreen` | root, full-screen | — |
| `/salon/:id` | `SalonDetailsScreen` | root, full-screen | path `id` |
| `/salon/:id/book` | `BookingScreen` | root, full-screen, nested | path `id`; query `services` = comma-separated `SalonService.id`s |

The shell (`AppShell`) is a Material 3 `NavigationBar` with 3 destinations
(Explore/Bookings/Profile). Tapping the already-active tab resets it to its
initial location (`goBranch(index, initialLocation: index == currentIndex)`).
Salon details and booking sit on the root navigator so they render
full-screen, no bottom bar. Login/signup swap via `pushReplacement` (so back
doesn't bounce between them); forgot-password uses `push`/`pop`.

## 2. Screens by feature folder

### `features/auth/`
`login_screen.dart`, `signup_screen.dart`, `forgot_password_screen.dart`.
Shared validators in `auth_validators.dart`. Provider: `currentUserProvider`
(`FutureProvider<UserProfile>`).

- **Login** — email/password. On success: `ref.invalidate(currentUserProvider)`
  and `ref.invalidate(bookingsProvider)` (bookings belong to the identity —
  must reload too), then pop. 401 special-cased to "Incorrect email or
  password."; everything else goes through `friendlyErrorMessage`.
- **Signup** — name/email/password, same invalidate-and-pop. `ConflictException`
  (409, email taken) special-cased to a message pointing at sign-in.
- **Forgot password** — one screen, two steps gated by a local `_codeSent`
  bool: request code → enter code + new password. "Send a new code" resets
  step 1.

### `features/booking/`
`booking_screen.dart`. Provider: `availableSlotsProvider` —
`FutureProvider.autoDispose.family<List<DateTime>, SlotQuery>`, where
`SlotQuery` is a Dart **record** `({String salonId, String? staffId, DateTime day, int durationMinutes})`
chosen specifically so record structural equality gives the family key
equality for free (documented in a code comment).

Takes `salonId` + `serviceIds` from the route. Lets the user pick a
professional (chip row incl. "Any professional"), a date from a 14-day strip,
and a time slot from `availableSlotsProvider`. Shows a running summary
(price via `Formatters.money`, duration via `Formatters.duration`). If
`salon.autoConfirmBookings == false`, shows an inline notice and the button
reads **"Request booking"** instead of "Confirm booking" — see
[03 — Vendor app § Booking-request flow](./03-vendor-app.md#booking-requests-vetting-flow-the-single-most-important-business-logic-in-this-app)
for the other half of this feature. On confirm: `createBooking(...)` with
`status` pre-set client-side to match what the salon's setting implies (a
comment notes: "The API decides this from the salon's own setting; sending
the expected status keeps the mocks honest in tests"), invalidate
`bookingsProvider`, show a non-dismissible result sheet, then `go('/bookings')`.

**The canonical example of screen-specific exception handling** (referenced
directly in `CLAUDE.md`): on `ConflictException` (the slot got taken between
load and submit), the screen invalidates `availableSlotsProvider`, clears the
selected slot, and shows a bespoke SnackBar telling the user to pick again —
it doesn't just show the generic friendly message.

### `features/bookings/`
`bookings_screen.dart`. Provider: `bookingsProvider` (`FutureProvider<List<Booking>>`).

Two tabs, Upcoming/History, split from one list via `Booking.isUpcoming` /
`!isUpcoming`. Each `_BookingCard` shows the salon cover gradient, services, a
color-coded `_StatusChip` (Upcoming = primary, Completed = green, Awaiting
salon/No answer = orange, Declined/Cancelled = red), date/time, price, staff
name if any, and — for bookings needing rebooking (declined/expired) — a
"Find another time" link back to the salon. Cancel: confirm dialog →
`cancelBooking(id)` → invalidate `bookingsProvider`.

### `features/home/`
`home_screen.dart` + `category_chips.dart`, `salon_card.dart` (featured
carousel), `salon_list_tile.dart` (compact row).

Providers:
- `salonsProvider` (`FutureProvider<List<Salon>>`) — watches
  `deviceLocationProvider().valueOrNull` **without blocking on it**, refetches
  in place once location resolves.
- `searchQueryProvider`, `selectedCategoryProvider` — plain `StateProvider`s.
- `filteredSalonsProvider`, `featuredSalonsProvider` — plain `Provider`s
  deriving from the above without re-fetching.

Search + category chips + a "Featured" carousel and "Near you" list when
browsing; a flat "N results" list when filtering. Pull-to-refresh:
`ref.refresh(salonsProvider.future)`.

### `features/profile/`
`profile_screen.dart` (reads providers directly, no dedicated providers file).

Identity card (guest → sign-in/create-account buttons; signed-in →
name/email), a "coming soon" menu (payment methods, saved addresses,
favourites, notifications — none implemented, just a SnackBar), an appearance
card (`SegmentedButton<ThemeMode>` → `themeModeProvider`), and — signed-in
only — sign out / delete account. Both invalidate `currentUserProvider` and
`bookingsProvider` afterward.

### `features/salon/`
`salon_details_screen.dart` + `widgets/service_tile.dart`. Provider:
`salonProvider` — `FutureProvider.autoDispose.family<Salon, String>(salonId)`.

Salon header (cover gradient, rating, distance, address, hours, about),
toggleable service list, a horizontally-scrollable staff row, and reviews.
A sticky bottom bar appears once ≥1 service is selected, showing the running
total and a "Book now" button that navigates to `/salon/:id/book` with the
selected service ids as a query param.

### `features/shell/` and `features/splash/`
`app_shell.dart` is purely presentational. `splash_screen.dart` is a plain
`StatefulWidget` (not `ConsumerWidget` — no Riverpod use at all), a 3-second
timer, then `go('/home')`.

## 3. Domain entities (`lib/domain/entities/`)

| Entity | Key fields |
|---|---|
| `Salon` | `id, name, tagline, about, address, distanceKm, rating, reviewCount, categories: List<ServiceCategory>, openHour, closeHour, isFeatured, coverSeed, autoConfirmBookings (default true), services, staff, reviews`. Computed: `startingPrice` |
| `SalonService` | `id, name, description, durationMinutes, price, category` |
| `ServiceCategory` | enum: `haircut, barber, nails, spa, makeup, skincare` + `label`. Emoji mapping lives in `formatters.dart`, **not** on the enum — keeps `domain/` Flutter-free |
| `StaffMember` | `id, name, role, rating`. Computed: `initials` |
| `Review` | `id, authorName, comment, rating, date` |
| `Booking` | `id, salonId, salonName, salonAddress, coverSeed, serviceNames: List<String>, staffName: String? (null = any professional), start, totalDurationMinutes, totalPrice, status, expiresAt`. Computed: `end`, `isPending`, `isUpcoming`, `needsRebooking` |
| `BookingStatus` | enum: `pending, confirmed, declined, expired, cancelled` |
| `UserProfile` | `id, email, name, isGuest` |

## 4. Repository contracts (`lib/domain/repositories/`)

```dart
abstract class AuthRepository {
  Future<UserProfile> getCurrentUser();
  Future<UserProfile> signIn({required String email, required String password});
  Future<UserProfile> signUp({required String name, required String email, required String password});
  Future<void> signOut();
  Future<void> deleteAccount();                      // Apple 5.1.1(v) compliance
  Future<void> requestPasswordReset(String email);    // always "succeeds" — no account-probing
  Future<void> resetPassword({required String email, required String code, required String newPassword});
}

abstract interface class BookingRepository {
  Future<List<Booking>> getBookings();
  Future<List<DateTime>> getAvailableSlots({required String salonId, required DateTime day, required int durationMinutes, String? staffId});
  Future<Booking> createBooking(Booking booking);
  Future<void> cancelBooking(String bookingId);
}

abstract interface class SalonRepository {
  Future<List<Salon>> getSalons({double? lat, double? lng});
  Future<Salon> getSalonById(String id, {double? lat, double? lng});
}
```

### Both a real and a mock implementation exist for every contract

| Contract | Real (bound in production) | Mock (`test/`-only override) |
|---|---|---|
| `SalonRepository` | `ApiSalonRepository` — `GET /salons`, `GET /salons/:id` | `MockSalonRepository` — `data/mock/mock_salons.dart`, 450ms latency |
| `BookingRepository` | `ApiBookingRepository` — `GET /bookings`, `GET /salons/:id/availability`, `POST /bookings`, `POST /bookings/:id/cancel` | `MockBookingRepository` — in-memory, deterministic pseudo-random slots, 350ms latency |
| `AuthRepository` | `ApiAuthRepository` — `GET /auth/me`, `POST /auth/login`, `POST /auth/register`, `DELETE /auth/me`, `POST /auth/forgot-password`, `POST /auth/reset-password` | `MockAuthRepository` — starts as guest, accepts any well-formed credentials, fixed reset code `'123456'`, 350ms latency |

**`ApiClient`** (`lib/data/api/api_client.dart`):
- Thin JSON wrapper over `package:http`, 15s timeout.
- Lazily mints a **guest** identity via `POST /auth/guest` on first
  authenticated call, persists the JWT in `shared_preferences`
  (`beautyhub_guest_token`) plus a `beautyhub_token_is_registered` flag (the
  JWT itself carries no such claim).
- `adoptToken(token)` after login/register; `clearToken()` on sign-out/delete/
  session-expiry.
- **401 handling is asymmetric by design**: a *registered* user's expired
  token → clear + throw `SessionExpiredException` (never silently re-minted —
  that would strand a signed-in user in an empty anonymous account). A
  *guest* token → clear + transparently re-mint + retry once.
- 409 → `ConflictException` with the backend's message. Other non-2xx →
  `ApiException(statusCode, message)`.

**`ApiMappers`** (`lib/data/api/api_mappers.dart`) is the **one place**
DateTimes get `.toLocal()`, per the datetime convention in
[05 — Conventions](./05-conventions-and-gotchas.md).

## 5. State management pattern

Confirmed Riverpod 2.6.1, no codegen anywhere. Four flavors in use:

1. **`FutureProvider`** (+ `.family`/`.autoDispose`) — the dominant pattern
   for anything read from a repository: `currentUserProvider`,
   `salonsProvider`, `bookingsProvider`, `salonProvider(id)`,
   `availableSlotsProvider(SlotQuery)`, `deviceLocationProvider`.
2. **`StateProvider`** — simple local UI state widgets both read and mutate:
   `searchQueryProvider`, `selectedCategoryProvider`, `themeModeProvider`.
3. **Plain `Provider`** — DI bindings (`core/di/providers.dart`) and derived
   `AsyncValue` transforms (`filteredSalonsProvider`, `featuredSalonsProvider`).
4. **No `StateNotifier`/`AsyncNotifier` anywhere.** Mutations call repository
   methods directly from `ConsumerStatefulWidget` handlers (local `setState`
   for `_submitting`/`_error`), then explicitly `ref.invalidate(...)` to force
   a refetch. There's no controller layer between UI and DI.

Representative example (`home_providers.dart`):

```dart
final salonsProvider = FutureProvider<List<Salon>>((ref) async {
  final location = ref.watch(deviceLocationProvider).valueOrNull;
  return ref.watch(salonRepositoryProvider).getSalons(lat: location?.lat, lng: location?.lng);
});

final filteredSalonsProvider = Provider<AsyncValue<List<Salon>>>((ref) {
  final salonsAsync = ref.watch(salonsProvider);
  final salons = salonsAsync.valueOrNull; // keep showing the old list during a refetch
  if (salons == null) return salonsAsync.whenData((s) => s);
  final filtered = salons.where(/* category + text match */).toList()
    ..sort((a, b) => a.distanceKm.compareTo(b.distanceKm));
  return AsyncValue.data(filtered);
});
```

House style: raw fetch lives in one `FutureProvider`; filtering/sorting lives
in a separate plain `Provider` watching it; fall back to `valueOrNull` so the
UI doesn't flash a spinner during a background refetch.

## 6. Error handling

Typed exceptions (`lib/domain/exceptions/`, pure Dart):
- `ConflictException(String message)` — 409s; message is backend-authored
  and shown verbatim.
- `SessionExpiredException` — only for a *registered* user's dead token,
  never a guest's.

Plus `ApiException(int statusCode, String message)` in the API layer (not
`domain/` — it's not a domain concept).

**`friendlyErrorMessage`** (`lib/core/utils/error_messages.dart`) is the
single exception→text mapping every screen uses instead of interpolating
`'$e'`:

| Error type | Message shown |
|---|---|
| `SessionExpiredException` | "Your session has expired. Please sign in again." |
| `ConflictException` | the exception's own message |
| `TimeoutException` | "The server is taking too long to respond. Please try again." |
| `SocketException` / `http.ClientException` | "No internet connection. Check your network and try again." |
| `ApiException`, status ≥ 500 | "Something went wrong on our side. Please try again in a moment." |
| `ApiException`, other | the exception's own message |
| anything else | "Something went wrong. Please try again." |

No screen renders a raw exception — confirmed by grep, only
`friendlyErrorMessage(e)` appears in `catch`/`error:` branches. On top of
that baseline, three screens add bespoke handling: booking (see §2), login
(401 → specific copy), signup (409 → specific copy).

**Known gap**: there's no global interceptor that force-navigates to
`/login` on `SessionExpiredException` — a screen already open just shows the
inline error text. Only the splash screen's own check naturally routes a
dead session to `/login` on next launch.

## 7. Formatters (`lib/core/utils/formatters.dart`)

The single place currency/locale can change — `abstract final class Formatters`:

- `currencyCode = 'ZAR'`, symbol `'R'`, locale `'en_ZA'`.
- `money(double)` — `"R250"` for whole numbers, `"R1 234,50"`-style
  (space-grouped, comma-decimal) for fractional.
- `duration(int minutes)` — `"45 min"` / `"1h"` / `"1h 30min"`.
- `day` / `dayLong` / `time` / `distance` — see source for exact formats.

Also here (deliberately, to keep the domain enum Flutter-free):
`extension ServiceCategoryX on ServiceCategory { String get emoji }`.

> Doc comment worth knowing about: "Payment integrations (Stripe) must use
> `currencyCode` so charges stay in the same currency as displayed prices" —
> relevant since Stripe has no direct South Africa merchant support; Paystack
> (Stripe-owned) is the likely alternative, not yet decided.

## 8. Theme (`lib/core/theme/app_theme.dart`)

Seed color `0xFF7C3AED` (deep violet) feeds `ColorScheme.fromSeed`. Both
light and dark themes must set two custom tokens widgets depend on
app-wide — `onSurfaceVariant` and `surfaceContainerLowest` — the doc comment
calls this out explicitly as an easy thing to break when touching the theme.

**No vendor photos exist anywhere in the system.** `SalonCover`
(`lib/core/widgets/salon_cover.dart`) renders `AppColors.coverGradient(seed)`
— one of 8 fixed two-stop gradients, chosen by `seed % 8` — with a centered
emoji, everywhere a photo would normally go. `Salon.coverSeed` is carried
onto `Booking.coverSeed` at creation time so a booking card can render the
same gradient without a live salon lookup.

## 9. Running the app

**Key deps**: `flutter_riverpod ^2.6.1`, `go_router ^14.8.1`, `http ^1.2.2`
(the only network dependency), `geolocator ^13.0.2`, `shared_preferences ^2.3.3`,
`intl ^0.20.2`. Notably absent: no codegen packages, no image-loading
library, no crash-reporting/analytics SDK, no `flutter_stripe` yet.

**`lib/core/config/api_config.dart`** — `ApiConfig.baseUrl`:
1. `--dart-define=API_BASE_URL=...` if given.
2. Android (non-web): `http://192.168.0.152:3000` — the dev machine's LAN IP.
   **This is brittle** — if the router reassigns the host's IP, this needs
   updating (or pass the dart-define). Likely first-week friction point.
3. Else (iOS simulator): `http://localhost:3000`.

No production URL is baked in anywhere — Railway hosting isn't provisioned
yet.

```sh
flutter pub get
flutter run             # needs an emulator/simulator + beautyhub-api running locally
flutter analyze         # must stay at zero issues — enforced in CI
flutter test            # unit + widget tests
```

**Tests**: 12 total (unit: API client, error messages, formatters, mock
booking repo; widget: auth flow, booking flow, home screen). Widget tests
override the 3 DI providers with the in-memory mocks via
`ProviderScope(overrides: [...])`.

**CI**: `.github/workflows/ci.yml` runs `flutter analyze` + `flutter test` on
push/PR to `main`, then a `build-android` job produces a signed release
`.aab` as a workflow artifact (not yet auto-published). `codemagic.yaml`
builds an **unsigned** iOS binary on a Mac mini M2 instance — proves the iOS
pipeline compiles; real signing/TestFlight is blocked on Apple Developer
Program enrollment.

**Known gaps** (per `DeployChecklist.md`): no real Terms/Privacy pages, no
Play Console Data Safety form / App Store privacy label yet, app
icon/launch screen still Flutter defaults, no crash reporting, no build
flavors beyond the one `API_BASE_URL` dart-define, seeded salon coordinates
are Cape Town placeholders pending real vendor addresses.

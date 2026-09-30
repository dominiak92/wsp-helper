# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, Copilot, …) working in this repository. `CLAUDE.md` imports this file — **edit here, not there**.

> **Keep this file current.** When adding or significantly changing a feature (new page/route, table, Netlify function, business-logic library, or cross-cutting convention), update the relevant section of this file **in the same change**. This is the primary always-loaded context — stale docs slow every future session. Keep it lean: put deep, area-specific detail in `docs/*.md` and link it from here.
>
> This app is **live in production** (used by firefighters at WSP OSPWL Wędrzyn), so prefer additive, backward-compatible changes and be careful with Supabase migrations.

## Commands

```bash
npm run dev          # start Vite dev server
npm run build        # tsc + vite build → dist/
npm run lint         # ESLint (max-warnings 0, strict)
npm test             # Vitest, single run (src/**/*.test.ts)
npm run test:watch   # Vitest in watch mode
npm run preview      # preview production build
```

Netlify functions can be tested locally with `netlify dev` (requires Netlify CLI).

### Node version

This project runs on **Node 18** (see [.nvmrc](.nvmrc) → `18.16.0`; Netlify also builds with 18). Other local projects (e.g. `duty-manager`) use Node 22, so switch before working here. Node is managed with **nvm-windows**; the active version is symlinked at `C:\nvm4w\nodejs` (which must be on `PATH`):

```powershell
nvm use 18.16.0   # switch to this project's Node
nvm list          # show installed versions
```

If a shell reports `node: not found`, no version is currently active (mid-switch) — run `nvm use 18.16.0`. When invoking nvm from a non-interactive shell, it needs `NVM_HOME=C:\Users\<user>\AppData\Local\nvm` and `NVM_SYMLINK=C:\nvm4w\nodejs` set, and Git Bash may need `C:\nvm4w\nodejs` prepended to `PATH` explicitly.

## Definition of done

A change is not finished until all of these pass:

1. `npm run lint` — zero warnings (the config fails on any).
2. `npm test` — all tests green. When changing logic in `src/lib/`, add or update the co-located `*.test.ts`.
3. `npm run build` — type-check + production build.
4. This file (or the relevant `docs/*.md`) is updated if the change affects anything documented here.
5. Database changes follow [Database changes](#database-changes) below.

There is no CI — Netlify deploys `main` on push and only runs `npm run build`. Lint and tests are your responsibility before committing.

## Conventions

- **Language** — all UI text is **Polish**. Identifiers, commit messages and PR text are **English**. Code comments are mixed; match the surrounding file.
- **Commits** — Conventional Commits with a feature scope: `feat(schedule): …`, `fix(map): …`, `chore(…): …`.
- **Imports** — relative paths (`../lib/crew`). The `@` → `src/` alias exists in Vite but is unused; don't mix styles.
- **Business logic** lives in `src/lib/` as pure, framework-free functions, with tests next to them (`duty.test.ts`, `hours.test.ts`, `crew.test.ts`, `geo.test.ts`). Pages/components call into it; keep new logic out of JSX files when it can be tested.
- **Component files** export only components (the `react-refresh/only-export-components` rule, and lint fails on warnings). Put helpers/constants in a `.ts` file.
- **Page size** — pages are already large (`FireMapPage` ~2.1k lines, `MobileHomePage` ~0.9k). Put new sub-components in `src/components/<area>/` rather than growing the page file.
- **Leaflet** stays inside the lazily-loaded map chunk — see [docs/fire-map.md](docs/fire-map.md).
- **Styling** — Tailwind with the custom tokens below; dark UI throughout (the `/schedule` "paper sheet" is the one light exception).
- **Line endings** — Windows checkout with `core.autocrlf=true` (CRLF on disk, LF in the repo).

## Architecture overview

**WSP Helper** is a fire-station management PWA for WSP OSPWL Wędrzyn (military fire station). Stack: React 18 + TypeScript + Vite + Tailwind + Supabase + Netlify + Leaflet (fire map).

### Routing & layouts

`App.tsx` defines two layout trees:

- **`DashboardLayout`** — sidebar + topbar; requires `role === 'admin'`. Regular users (`role === 'user'`) are redirected to `/mobile` by the layout guard.
- **`MobileLayout`** — minimal mobile-first shell for regular firefighters (read-only views + message-to-duty-officer feature).

Auth is handled by `src/lib/auth.tsx` (`AuthProvider` / `useAuth`). Login uses Supabase email auth with a synthetic domain: `${login}@wsp.internal`. The `displayName` is resolved asynchronously from the `personnel` table after login.

### Supabase tables

| Table | Purpose |
|---|---|
| `personnel` | Firefighter roster (id, name, roles[], preferred_vehicle_id, absence, login, `is_soldier`, `hours_seed`, `rank`). `is_soldier=true` marks a soldier (żołnierz) — the only people counted in the hours calculator; `hours_seed` is their carried-in hours balance at the start of tracking; `rank` is a free-text stopień/funkcja shown on the schedule page |
| `duty_assignments` | Serialised `ShiftAssignment` JSON keyed by `duty_date` (YYYY-MM-DD) |
| `announcements` | Single row (id=1) with a shared text note shown on dashboard and mobile |
| `duty_messages` | Messages sent from mobile users to the duty officer; confirmed with `read_at`. Both the admin (dashboard) **and the day's duty officer** (the user in the current assignment's `dutyOfficerIds`, on mobile home) can read all messages and confirm them — confirming fires a `confirmed` push to the sender. Relies on permissive RLS (any authenticated user can read/update). Self-reported absences (see mobile home "Zgłoś nieobecność") also flow through this table as a plain message (`🚫 Zgłoszenie nieobecności …` / `↩️ Wycofanie …`) + `new_message` push — no schema change. |
| `push_subscriptions` | Web Push subscriptions (user_login, user_role, subscription JSON) |
| `weather_cache` | Single row (id=1) written by the weather cron (see Weather below), read by the Netlify function |
| `calendar_events` | Upcoming events shown on mobile home (id, event_date, label) |
| `map_features` | Persistent fire-map objects (water points, units, POIs, fire roads). `geometry` jsonb is point or line; `confirmed=false` marks an approximate position read off the paper map |
| `map_alerts` | Pulsing alert points on the fire map, visible to everyone, auto-expire after 2h (`expires_at`) |
| `live_locations` | Live shared user positions on the fire map (one row per `user_login`, expires after 30 min) |
| `work_hours` | Duty hours backing the full schedule page. One row per `(person_id, date)` with a `code` (`24`/`8`/`W`/`WH`/`8W`/`L4`/`UN`/`oddelegowanie`). Can be bulk-imported from saved `duty_assignments` via the "Z obsad" button (`importFromAssignments`) |

**Where the schema lives:**

- [supabase/schema.sql](supabase/schema.sql) — DDL for `personnel`, `duty_assignments`, `map_features`, `map_alerts`, `live_locations`, `work_hours` (bootstrap snapshot; **not** safe to re-run against production).
- [supabase/migrations/](supabase/migrations/) — every schema change from now on; see its README.
- `announcements`, `duty_messages`, `push_subscriptions`, `weather_cache`, `calendar_events` exist only in the production database — their DDL was never committed (TODO: dump from Supabase and add as a baseline migration).
- `src/lib/database.types.ts` — hand-written row types for some tables. It is **not** wired into `createClient` (the client is untyped) and nothing imports it; treat it as reference only.

### Database changes

The Supabase project is production. Nobody runs migrations automatically — changes are applied by hand in the Supabase SQL editor. So:

1. Write the change as a new, idempotent file in `supabase/migrations/` (`YYYYMMDDHHMM_short_name.sql`, using `if not exists` / `add column if not exists`).
2. Prefer additive changes (new nullable columns, new tables). Old clients (cached PWA) keep running against the new schema, so never rename/drop a column the current client reads.
3. Mirror the change in `schema.sql` and the table above.
4. Tell the user the migration must be applied manually **before** the code that needs it is deployed.

### Security model (known risk)

All tables in `schema.sql` use fully public RLS policies (`using (true)`) and the anon key ships in the client bundle, so anyone who extracts it can read and write roster, assignment and map data without logging in. Login only gates the UI. This is an accepted trade-off for now — don't make it worse (no secrets or personal data beyond what's already stored), and flag it if a change would benefit from real RLS.

### Critical: how absences work

**`personnel.absence` in the database is NOT used for day-specific logic.** Absences are stored inside each `ShiftAssignment` as `absenceMap: Record<personId, AbsenceType>`. When any page loads personnel + a duty assignment, it reconstructs `person.absence` at runtime from the loaded assignment's `absenceMap`:

```ts
absence: (loadedAssignment?.absenceMap?.[row.id] ?? null) as AbsenceType | null
```

This means the same person can have different absences on different duty dates. Never rely on `personnel.absence` from the DB directly; always load the assignment for the target date first.

### 8h presence

Someone can be present only 8h on a duty day: their id is in `ShiftAssignment.partial8hIds` (set with the "8h" toggle in the crew generator's personnel panel; pages mirror it into `person.partial8h`). They still occupy a normal slot and count as available, and `hours.ts` credits them `8` instead of `24`. This must be **clearly visible** wherever the day's crew is shown: use `Badge8h` next to names and `Partial8hCard` (list of 8h people with their slot) from [src/components/Partial8h.tsx](src/components/Partial8h.tsx) — both main pages (`/dashboard`, `/mobile`) show the card under "Stan obsady" plus a "w tym N na 8h" hint on the available counter. Logic helpers: `partial8hPersons`, `slotLabel` in `crew.ts`. Re-rolling a crew must go through `regenerateCrew` (not bare `generateCrew`) so 8h flags, dinner, guests and self-absences survive.

### Business logic libraries

- **`src/lib/duty.ts`** — duty-day calendar math. Duty cycle is every 4 days anchored to `2026-05-01`; billing cycle is every 28 days anchored to `2026-04-21`. `currentOrNextDutyDate()` is the primary entry point used across pages; `nextDutyKeys(count, from?)` lists upcoming duty days. Key-based helpers (`YYYY-MM-DD`): `addDaysKey`, `isDutyDayKey`, `isBillingStartKey`, `billingPeriodStartKey` (start day of the 28-day billing period containing a date — the "yellow column").
- **`src/lib/hours.ts`** — schedule hour-code logic. `HourCode` = `24`/`8`/`W`/`WH`/`8W`/`L4`/`UN`/`oddelegowanie`; `HOUR_VALUES` maps each to credited hours (`24`→24, `8`/`8W`→8, full-day leave `W`/`L4`/`UN`/`oddelegowanie`→24, **`WH` (wolna służba)→0** since it draws down the overtime bank). `WORKED_CODES` (`24`,`8`) vs `LEAVE_CODES` split feeds the ZAPL./URL. columns. `deriveDayCodes(assignment, knownIds)` turns one `ShiftAssignment` into per-person codes (present → `24`/`8`, `absenceMap` → leave code); `buildWorkHoursRows` maps many assignments to `work_hours` rows for import. (`NORM`/`computePeriods` remain for optional 28-day norm math but are not currently surfaced in the UI.)
- **`src/lib/workHours.ts`** — Supabase CRUD for `work_hours` used by the schedule page: `fetchWorkHours()` (→ `personId → date → code` map), `setWorkHour(personId, date, code|null)`, and `importFromAssignments()` (reads all `duty_assignments`, upserts derived codes, returns the rows).
- **`src/lib/crew.ts`** — personnel types (`Person`, `ShiftAssignment`, `VehicleAssignment`), the `generateCrew()` auto-assignment algorithm, and all drag-and-drop helpers (`applyDrop`, slot key format below). There are four crew vehicles (`CREW_VEHICLE_IDS`): `gba`, `gcba532`, `gcba1060` are auto-staffed (`AUTO_CREW_VEHICLE_IDS`); the airport truck `gcba850` is staffed manually only. `parseShiftAssignment` normalises saved JSON (adds vehicles missing from older saves, derives a missing shift commander). `DEFAULT_PERSONNEL` is a hardcoded fallback for development; real data always comes from Supabase. `regenerateCrew(personnel, prev)` wraps `generateCrew` for "Losuj/Nowe losowanie" and carries over day state the generator doesn't own (guests, `partial8hIds`, `dinner`, still-valid `selfAbsences`). Self-reported absences use `applySelfAbsence` / `withdrawSelfAbsence`: the former records the person's prior slot in `ShiftAssignment.selfAbsences` (`personId → CrewSlot`) and pulls them via `removePersonFromAssignment` + sets `absenceMap`; the latter restores them to that slot (`restorePersonToSlot`, falling back to reserve if taken). `selfAbsences` distinguishes user-reported absences (undoable on mobile) from admin-set ones.
- **`src/lib/incident.ts`** — generates incident report text in two formats: `MON` (military internal) and `Civilian`. `generateDescription(form)` is the public API.
- **`src/lib/mapFeatures.ts`** — CRUD + types for persistent fire-map objects (`MapFeature`, `FeatureKind` = `water | unit | poi | road`, point/line geometry). `KIND_META` maps each kind to colour/emoji; `POI_ICONS` is the emoji picker for important points. `SEED_FEATURES` / `seedFeatures()` one-time import the approximate positions read off the paper map.
- **`src/lib/liveMap.ts`** — CRUD for the two ephemeral fire-map layers: `map_alerts` (pulsing alert points, 2h TTL) and `live_locations` (shared user positions, 30 min TTL). Polled every ~10 s by `FireMapPage`.
- **`src/lib/geo.ts`** / **`src/lib/mapServices.ts`** — fire-map math and external map APIs; see [docs/fire-map.md](docs/fire-map.md).

### Drag-and-drop slot key format (crew generator)

```
v:{vehicleId}:commander
v:{vehicleId}:driver
v:{vehicleId}:rescuer:{index}
special:shift-commander
special:duty-officer:{index}
unassigned:{personId}   ← source (specific person)
unassigned              ← target (drop zone)
```

### Weather — two independent sources

There are two separate weather widgets that pull from completely different APIs:

1. **Fire threat widget** (`WeatherWidget` on dashboard, `WeatherCollapsible` on mobile in `src/components/mobile/`) — calls `/.netlify/functions/weather`, which reads `weather_cache` from Supabase. Data is populated by the GitHub Actions workflow [.github/workflows/weather-cache.yml](.github/workflows/weather-cache.yml) running [scripts/fetch-weather.mjs](scripts/fetch-weather.mjs) (morning ≈ 9:00 and afternoon ≈ 13:00 slots, each with retries; needs repo secrets `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`). The app itself never writes to this table. Returns `{ morning, afternoon }` readings with fire threat level (0–5), temperature, humidity, litter moisture, wind.

2. **Hourly forecast widget** (`DailyWeatherCard` on dashboard, `DailyWeatherCollapsible` on mobile, both exported from `src/components/DailyWeatherWidget.tsx`) — fetches directly from the Open-Meteo free API (no key) for coordinates 52.433°N 15.117°E (Sulęcin). Filters to today's hours only and auto-scrolls to current hour.

### Fire map (`FireMapPage`)

`src/pages/FireMapPage.tsx` is one imperative Leaflet map (no React wrapper) shared by `/map` and `/mobile/map`, lazy-loaded to keep Leaflet out of the main bundle. It shows persistent features (`map_features`), shared live layers (alerts, live locations), search + routing (Overpass / Nominatim / OSRM), BDL forest compartments, wind + scale, duty-officer reports, and a car-style live navigation mode (track-up rotation via `leaflet-rotate`, off-route re-routing).

**Before touching the map, read [docs/fire-map.md](docs/fire-map.md)** — it documents the module split, the `window.__wsp*` popup bridge, and several non-obvious invariants (hand-typed-only autocomplete, GPS-derived heading, navigation exit rules, ref-based callbacks).

### Pages summary

| Route | Layout | Description |
|---|---|---|
| `/dashboard` | Dashboard | Duty overview, crew assignment, fire threat, hourly weather, messages, announcement |
| `/crew-generator` | Dashboard | Generate/edit/save duty assignments with drag-and-drop; navigates by duty date via `?date=` query param |
| `/duty-calendar` | Dashboard | Calendar view of duty days and billing cycles; manages `calendar_events` |
| `/schedule` | Dashboard | Full duty-hours schedule for the **whole shift** (soldiers + civilians), styled like the paper harmonogram: light "sheet" with monthly blocks per quarter, rank + name rows sorted by rank (highest soldier rank first → civilian ratownik → kier. rat.), day columns 1–31 (billing-start day highlighted yellow). Cells editable (click → pick a `HourCode`, saved to shared `work_hours`); "Z obsad" imports from saved `duty_assignments`; whole-row hover. Same grid on all sizes, made mobile-friendly by sticky scrolling: the name column is sticky-left (narrower on mobile) and the day-number header row is sticky-top with the month abbreviation pinned in the top-left corner, so the person and month stay visible while scrolling. **Summation differs by group**: civilians get monthly ZAPL./URL./SUMA in-grid; soldiers' monthly totals are left blank and instead a `SoldierSummary` panel on top totals each **28-day billing period** vs the 160h norm (with +/− diff). Soldier ranks are set in the crew generator ("Żołnierz" toggle + rank select). See `SchedulePage.tsx` |
| `/garage` | Dashboard | Garage bay view showing crew assignment per vehicle for the current duty date |
| `/incident-generator` | Dashboard | Generate formatted incident report text (MON or Civilian format) |
| `/vademecum` | Dashboard | Static page: important phone numbers, vehicles list, alarm procedure checklist (local state only, no DB), duty report schedule |
| `/map` | Dashboard | Interactive fire map (see [docs/fire-map.md](docs/fire-map.md)) |
| `/mobile` | Mobile | Personal assignment, message to duty officer, **self-report absence** ("Zgłoś nieobecność" — pick an upcoming duty day + absence type; pulls the user from that day's crew, sets `absenceMap`, notifies duty officer; "Cofnij" restores their prior slot), crew summary, weather, upcoming absences. Page state/data loading lives in `MobileHomePage.tsx`; its panels are in `src/components/mobile/` (`WeatherCollapsible`, `CrewAbsencesCollapsible`, `VehicleReadinessStrip`, `FullAssignmentCollapsible`, `ReportAbsencePanel`) |
| `/mobile/calendar` | Mobile | Duty calendar for mobile users |
| `/mobile/crew-generator` | Mobile | Mobile crew view — **editable** (absences, crew changes, "Losuj"), saves to `duty_assignments` |
| `/mobile/map` | Mobile | Same `FireMapPage` as `/map` |

### Netlify functions

- **`netlify/functions/weather.js`** — reads `weather_cache` from Supabase and returns `{ morning, afternoon }`. Has backward-compat handling for old flat format (single reading without morning/afternoon keys).
- **`netlify/functions/push-notify.js`** — sends Web Push via `web-push` (VAPID). `type: 'new_message'` fans out to all `admin`/`officer` role subscribers **plus the day's duty officer(s)** — resolved server-side via `resolveDutyOfficerLogins` (current/next duty date in Europe/Warsaw → `duty_assignments.dutyOfficerIds` → `personnel.login`) and OR-ed into the subscription filter by `user_login`. `type: 'confirmed'` targets a specific `targetLogin`. The notification `url` stays `/dashboard`; a duty-officer user clicking it is redirected to `/mobile` by the layout guard (where the "Wiadomości od załogi" panel lives). Dead subscriptions (410/404) are auto-deleted from Supabase.
- **`netlify/functions/bdl-tiles.js`** — XYZ tile proxy for the BDL (Bank Danych o Lasach) ArcGIS "Oddziały" layer. Computes each `{z}/{x}/{y}` tile's Web Mercator bbox and requests a 256×256 `/export` image so Leaflet tiles align natively. The layer is only visible from ~zoom 12+, so distant tiles come back empty by design.
- **`netlify/functions/bdl-compartment.js`** — searches a forest compartment by number (`?nr=`) within the OSPWL area, returns matching compartment polygon rings (`compartment_cd LIKE 'nr%'`, then exact-match filtered). Used by the fire-map compartment search.
- **`netlify/functions/bdl-compartments.js`** — returns one large pre-rendered `/export` PNG of the OSPWL forest-compartment grid (`imageOverlay` alternative to tiles); bbox is calibrated against ground-truth points to align with the Leaflet overlay.

### Tailwind custom tokens

Defined in `tailwind.config.js`:

- `brand-{50…900}` — sky-blue primary colour
- `surface-{950…500}` — dark-grey background scale used for cards and panels
- `alert-{red,amber,green}` — semantic alert colours

### Environment variables

Copy [.env.example](.env.example) to `.env.local` for local development.

| Variable | Used by |
|---|---|
| `VITE_SUPABASE_URL` | client + Netlify functions |
| `VITE_SUPABASE_ANON_KEY` | client + Netlify functions |
| `VITE_VAPID_PUBLIC_KEY` | client (push subscription) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Netlify push-notify function |
| `VAPID_SUBJECT` | Netlify push-notify function |
| `SUPABASE_SERVICE_KEY` | Netlify push-notify function (falls back to anon key); weather cron (GitHub secret) |
| `SUPABASE_URL` / `SLOT` | weather cron only (`scripts/fetch-weather.mjs`, set by the workflow) |

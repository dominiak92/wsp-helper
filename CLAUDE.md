# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Keep this file current.** When adding or significantly changing a feature (new page/route, table, Netlify function, business-logic library, or cross-cutting convention), update the relevant section of this file **in the same change**. This is the primary always-loaded context — stale docs slow every future session. This app is **live in production** (used by firefighters at WSP OSPWL Wędrzyn), so prefer additive, backward-compatible changes and be careful with Supabase migrations.

## Commands

```bash
npm run dev        # start Vite dev server
npm run build      # tsc + vite build → dist/
npm run lint       # ESLint (max-warnings 0, strict)
npm run preview    # preview production build
```

No test suite is configured. Netlify functions can be tested locally with `netlify dev` (requires Netlify CLI).

## Architecture overview

**WSP Helper** is a fire-station management PWA for WSP OSPWL Wędrzyn (military fire station). Stack: React 18 + TypeScript + Vite + Tailwind + Supabase + Netlify + Leaflet (fire map).

### Routing & layouts

`App.tsx` defines two layout trees:

- **`DashboardLayout`** — sidebar + topbar; requires `role === 'admin'`. Regular users (`role === 'user'`) are redirected to `/mobile` by the layout guard.
- **`MobileLayout`** — minimal mobile-first shell for regular firefighters (read-only views + message-to-duty-officer feature).

Auth is handled by `src/lib/auth.tsx` (`AuthProvider` / `useAuth`). Login uses Supabase email auth with a synthetic domain: `${login}@wsp.internal`. The `displayName` is resolved asynchronously from the `personnel` table after login.

### Supabase tables

Defined in `src/lib/database.types.ts`. Additional table used but not typed there:

| Table | Purpose |
|---|---|
| `personnel` | Firefighter roster (id, name, roles[], preferred_vehicle_id, absence, login) |
| `duty_assignments` | Serialised `ShiftAssignment` JSON keyed by `duty_date` (YYYY-MM-DD) |
| `announcements` | Single row (id=1) with a shared text note shown on dashboard and mobile |
| `duty_messages` | Messages sent from mobile users to the duty officer; confirmed with `read_at`. Both the admin (dashboard) **and the day's duty officer** (the user in the current assignment's `dutyOfficerIds`, on mobile home) can read all messages and confirm them — confirming fires a `confirmed` push to the sender. Relies on permissive RLS (any authenticated user can read/update). Self-reported absences (see mobile home "Zgłoś nieobecność") also flow through this table as a plain message (`🚫 Zgłoszenie nieobecności …` / `↩️ Wycofanie …`) + `new_message` push — no schema change. |
| `push_subscriptions` | Web Push subscriptions (user_login, user_role, subscription JSON) |
| `weather_cache` | Single row (id=1) written by a GitHub Actions cron, read by the Netlify function |
| `calendar_events` | Upcoming events shown on mobile home (id, event_date, label) — not in database.types.ts |
| `map_features` | Persistent fire-map objects (water points, units, POIs, fire roads). `geometry` jsonb is point or line; `confirmed=false` marks an approximate position read off the paper map |
| `map_alerts` | Pulsing alert points on the fire map, visible to everyone, auto-expire after 2h (`expires_at`) |
| `live_locations` | Live shared user positions on the fire map (one row per `user_login`, expires after 30 min) |

Tables `personnel`, `duty_assignments`, `map_features`, `map_alerts`, and `live_locations` are defined in [supabase/schema.sql](supabase/schema.sql) with fully public RLS policies (no auth required on the DB level).

### Critical: how absences work

**`personnel.absence` in the database is NOT used for day-specific logic.** Absences are stored inside each `ShiftAssignment` as `absenceMap: Record<personId, AbsenceType>`. When any page loads personnel + a duty assignment, it reconstructs `person.absence` at runtime from the loaded assignment's `absenceMap`:

```ts
absence: (loadedAssignment?.absenceMap?.[row.id] ?? null) as AbsenceType | null
```

This means the same person can have different absences on different duty dates. Never rely on `personnel.absence` from the DB directly; always load the assignment for the target date first.

### Business logic libraries

- **`src/lib/duty.ts`** — duty-day calendar math. Duty cycle is every 4 days anchored to `2026-05-01`; billing cycle is every 28 days anchored to `2026-04-21`. `currentOrNextDutyDate()` is the primary entry point used across pages.
- **`src/lib/crew.ts`** — personnel types (`Person`, `ShiftAssignment`, `VehicleAssignment`), the `generateCrew()` auto-assignment algorithm, and all drag-and-drop helpers (`applyDrop`, slot key format below). The three crew vehicles are `gba`, `gcba532`, `gcba1060`. `DEFAULT_PERSONNEL` is a hardcoded fallback for development; real data always comes from Supabase. Self-reported absences use `applySelfAbsence` / `withdrawSelfAbsence`: the former records the person's prior slot in `ShiftAssignment.selfAbsences` (`personId → CrewSlot`) and pulls them via `removePersonFromAssignment` + sets `absenceMap`; the latter restores them to that slot (`restorePersonToSlot`, falling back to reserve if taken). `selfAbsences` distinguishes user-reported absences (undoable on mobile) from admin-set ones.
- **`src/lib/incident.ts`** — generates incident report text in two formats: `MON` (military internal) and `Civilian`. `generateDescription(form)` is the public API.
- **`src/lib/mapFeatures.ts`** — CRUD + types for persistent fire-map objects (`MapFeature`, `FeatureKind` = `water | unit | poi | road`, point/line geometry). `KIND_META` maps each kind to colour/emoji; `POI_ICONS` is the emoji picker for important points. `SEED_FEATURES` / `seedFeatures()` one-time import the approximate positions read off the paper map.
- **`src/lib/liveMap.ts`** — CRUD for the two ephemeral fire-map layers: `map_alerts` (pulsing alert points, 2h TTL) and `live_locations` (shared user positions, 30 min TTL). Polled every ~10 s by `FireMapPage`.

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

1. **Fire threat widget** (`WeatherWidget` on dashboard, `WeatherCollapsible` on mobile) — calls `/.netlify/functions/weather`, which reads `weather_cache` from Supabase. Data is populated by an external GitHub Actions cron at 09:00 and 13:00; the app never writes to this table. Returns `{ morning, afternoon }` readings with fire threat level (0–5), temperature, humidity, litter moisture, wind.

2. **Hourly forecast widget** (`DailyWeatherCard` on dashboard, `DailyWeatherCollapsible` on mobile, both exported from `src/components/DailyWeatherWidget.tsx`) — fetches directly from the Open-Meteo free API (no key) for coordinates 52.433°N 15.117°E (Sulęcin). Filters to today's hours only and auto-scrolls to current hour.

### Fire map (`FireMapPage`)

`src/pages/FireMapPage.tsx` is a single Leaflet (`leaflet`, no React wrapper) map shared by both layouts: `/map` (Dashboard) and `/mobile/map` (Mobile). It is large and imperative — it manages Leaflet layers via refs, and bridges popup buttons to React through `window.__wsp*` globals. The map gets full viewport height; both layouts special-case the map route to `overflow-hidden`.

Key capabilities:

- **Base layers** — OSM raster, or GUGiK ortofotomapa as a hybrid (ortofoto + transparent Esri roads + CARTO labels). Toggled in-page.
- **Persistent features** — water points / units / POIs / fire roads from `map_features` (via `mapFeatures.ts`), editable in an admin edit mode (drag to reposition flips `confirmed` to true). Point markers are grouped with `leaflet.markercluster` for readability when zoomed out (`clusterRef`, custom dark `makeClusterIcon`, `disableClusteringAtZoom: 16`); their permanent labels only appear once declustered. Clustering is bypassed in edit mode (markers go straight to `featureLayerRef`) so each is individually draggable; road polylines always stay on `featureLayerRef` (unclustered).
- **Shared live layers** — alert points (`map_alerts`) and live user locations (`live_locations`) via `liveMap.ts`, polled every ~10 s. Live sharing lasts 30 min, persisted client-side under `localStorage['wsp-share-until']`; a user's vehicle is resolved from the current duty assignment.
- **Search & routing** — Overpass API (road geometry), Nominatim (geocoding, viewbox-limited to the county), OSRM (driving routes). Routes can start from GPS position or from the station (`52.43626, 15.18625`). The search box shows **debounced autocomplete** (~0.5 s after the last keystroke): local map features match instantly, a numeric query offers the matching forest compartment, and geocoded places are appended after the pause. Picking a point/place suggestion calls `startNavigation`; roads call `navigateToRoad`. Suggestions are suppressed while navigating.
- **BDL forest compartments** — search a leśny compartment by number and overlay BDL "Oddziały" tiles; see the three `bdl-*` Netlify functions below.
- **Live navigation (track-up + re-routing)** — car-navigation-style mode built on the `leaflet-rotate` plugin (map init: `rotate: true`, other rotation handlers off; rotation set via `map.setBearing(-heading)`). There is **no toggle button** — it starts automatically when the user taps **"Nawiguj z mojej pozycji"** in a popup (`__wspNavigateTo` with `sm === 'gps'` → `startNavigation`); "Nawiguj ze strażnicy" stays a static route preview (`routeTo`). Once active (`navMode`/`navModeRef`): the map centers on the GPS position at `NAV_ZOOM` (17) and rotates so the direction of travel points up. Heading is derived **purely from the last two GPS positions** (`computeBearing`, same principle as the shared fire-truck marker) — the Geolocation `heading` field is unreliable (often `0`/`null` at low speed, which left the map north-up = "driving sideways"). The reference point (`prevNavPosRef`) only advances after >6 m of movement, and the result is angle-smoothed in `headingRef`. The position marker becomes an up-pointing arrow (`navArrowIcon`) — leaflet-rotate keeps markers screen-upright, so up = forward. **Off-route re-routing**: each GPS tick measures min distance to the current route points (`routePtsRef`); beyond `REROUTE_OFF_ROUTE_M` (50 m) it recomputes from the live position (`drawNavRoute`), throttled by `reroutingRef` + an 8 s cooldown (`lastRerouteAtRef`). Exit **only** via the single bottom "Zakończ nawigację" button (`endNavigation`) or automatically on arrival (`< ARRIVE_M`, 35 m → `arrivedToast`); panning/zooming does NOT exit (the next GPS tick re-centers). The GPS handler is registered once on mount, so it calls the latest `endNavigation`/`drawNavRoute` via `endNavigationRef`/`drawNavRouteRef`. Note: Leaflet is 2D — rotation only, **not** 3D/tilt perspective (that would need MapLibre GL).
- **Scale + wind** — a metric `L.control.scale` (bottom-left, dark-themed) and a wind indicator badge (bottom-left, above the scale) whose arrow points downwind (fire-spread direction = meteo direction + 180°). Wind is fetched from Open-Meteo `current=wind_speed_10m,wind_direction_10m` (no key, Sulęcin coords), refreshed every 20 min; the badge hides on fetch error.
- **Duty-officer reports** — the walkie-talkie button (`WalkieTalkieIcon`, top of the right control column) opens a panel with two generated reports: "Zgłoś dojazd na miejsce" / "Zgłoś zakończenie akcji". Each inserts a `duty_messages` row (`sender_login`/`sender_name` = current user, message = `REPORT_PREFIX[kind] — zastęp {vehicle}, godz. {HH:MM}`) and fires a `new_message` push, so it shows in the admin dashboard like any message and is confirmed there (`read_at` → `confirmed` push). The map polls the user's own messages and shows per-kind status (Oczekuje / Potwierdzona); report kind is detected by the stable text prefix (no DB schema change). The vehicle/zastęp is the same `myVehicle` resolved for live sharing.

### Pages summary

| Route | Layout | Description |
|---|---|---|
| `/dashboard` | Dashboard | Duty overview, crew assignment, fire threat, hourly weather, messages, announcement |
| `/crew-generator` | Dashboard | Generate/edit/save duty assignments with drag-and-drop; navigates by duty date via `?date=` query param |
| `/duty-calendar` | Dashboard | Calendar view of duty days and billing cycles |
| `/garage` | Dashboard | Garage bay view showing crew assignment per vehicle for the current duty date |
| `/incident-generator` | Dashboard | Generate formatted incident report text (MON or Civilian format) |
| `/vademecum` | Dashboard | Static page: important phone numbers, vehicles list, alarm procedure checklist (local state only, no DB), duty report schedule |
| `/map` | Dashboard | Interactive fire map (see "Fire map" above) |
| `/mobile` | Mobile | Personal assignment, message to duty officer, **self-report absence** ("Zgłoś nieobecność" — pick an upcoming duty day + absence type; pulls the user from that day's crew, sets `absenceMap`, notifies duty officer; "Cofnij" restores their prior slot), crew summary, weather, upcoming absences |
| `/mobile/calendar` | Mobile | Duty calendar for mobile users |
| `/mobile/crew-generator` | Mobile | Read-only crew view for mobile users |
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

| Variable | Used by |
|---|---|
| `VITE_SUPABASE_URL` | client + Netlify functions |
| `VITE_SUPABASE_ANON_KEY` | client + Netlify functions |
| `VITE_VAPID_PUBLIC_KEY` | client (push subscription) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Netlify push-notify function |
| `VAPID_SUBJECT` | Netlify push-notify function |
| `SUPABASE_SERVICE_KEY` | Netlify push-notify function (falls back to anon key) |

Path alias `@` resolves to `src/`.

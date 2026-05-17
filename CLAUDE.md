# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start Vite dev server
npm run build      # tsc + vite build → dist/
npm run lint       # ESLint (max-warnings 0, strict)
npm run preview    # preview production build
```

No test suite is configured. Netlify functions can be tested locally with `netlify dev` (requires Netlify CLI).

## Architecture overview

**WSP Helper** is a fire-station management PWA for WSP OSPWL Wędrzyn (military fire station). Stack: React 18 + TypeScript + Vite + Tailwind + Supabase + Netlify.

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
| `duty_messages` | Messages sent from mobile users to admin; admin confirms with `read_at` |
| `push_subscriptions` | Web Push subscriptions (user_login, user_role, subscription JSON) |
| `weather_cache` | Single row (id=1) written by a GitHub Actions cron, read by the Netlify function |
| `calendar_events` | Upcoming events shown on mobile home (id, event_date, label) — not in database.types.ts |

### Critical: how absences work

**`personnel.absence` in the database is NOT used for day-specific logic.** Absences are stored inside each `ShiftAssignment` as `absenceMap: Record<personId, AbsenceType>`. When any page loads personnel + a duty assignment, it reconstructs `person.absence` at runtime from the loaded assignment's `absenceMap`:

```ts
absence: (loadedAssignment?.absenceMap?.[row.id] ?? null) as AbsenceType | null
```

This means the same person can have different absences on different duty dates. Never rely on `personnel.absence` from the DB directly; always load the assignment for the target date first.

### Business logic libraries

- **`src/lib/duty.ts`** — duty-day calendar math. Duty cycle is every 4 days anchored to `2026-05-01`; billing cycle is every 28 days anchored to `2026-04-21`. `currentOrNextDutyDate()` is the primary entry point used across pages.
- **`src/lib/crew.ts`** — personnel types (`Person`, `ShiftAssignment`, `VehicleAssignment`), the `generateCrew()` auto-assignment algorithm, and all drag-and-drop helpers (`applyDrop`, slot key format below). The three crew vehicles are `gba`, `gcba532`, `gcba1060`. `DEFAULT_PERSONNEL` is a hardcoded fallback for development; real data always comes from Supabase.
- **`src/lib/incident.ts`** — generates incident report text in two formats: `MON` (military internal) and `Civilian`. `generateDescription(form)` is the public API.

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

### Pages summary

| Route | Layout | Description |
|---|---|---|
| `/dashboard` | Dashboard | Duty overview, crew assignment, fire threat, hourly weather, messages, announcement |
| `/crew-generator` | Dashboard | Generate/edit/save duty assignments with drag-and-drop; navigates by duty date via `?date=` query param |
| `/duty-calendar` | Dashboard | Calendar view of duty days and billing cycles |
| `/garage` | Dashboard | Garage bay view showing crew assignment per vehicle for the current duty date |
| `/incident-generator` | Dashboard | Generate formatted incident report text (MON or Civilian format) |
| `/vademecum` | Dashboard | Static page: important phone numbers, vehicles list, alarm procedure checklist (local state only, no DB), duty report schedule |
| `/mobile` | Mobile | Personal assignment, message to duty officer, crew summary, weather, upcoming absences |
| `/mobile/calendar` | Mobile | Duty calendar for mobile users |
| `/mobile/crew-generator` | Mobile | Read-only crew view for mobile users |

### Netlify functions

- **`netlify/functions/weather.js`** — reads `weather_cache` from Supabase and returns `{ morning, afternoon }`. Has backward-compat handling for old flat format (single reading without morning/afternoon keys).
- **`netlify/functions/push-notify.js`** — sends Web Push via `web-push` (VAPID). `type: 'new_message'` fans out to all `admin`/`officer` role subscribers; `type: 'confirmed'` targets a specific `targetLogin`. Dead subscriptions (410/404) are auto-deleted from Supabase.

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

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

- **`DashboardLayout`** — sidebar + topbar; accessible only to `role === 'admin'`. Regular users (`role === 'user'`) are redirected to `/mobile`.
- **`MobileLayout`** — minimal mobile-first shell for regular firefighters.

Auth is handled by `src/lib/auth.tsx` (`AuthProvider` / `useAuth`). Login uses Supabase email auth with a synthetic domain: `${login}@wsp.internal`.

### Supabase tables

Defined in `src/lib/database.types.ts`:

| Table | Purpose |
|---|---|
| `personnel` | Firefighter roster (id, name, roles[], preferred_vehicle_id, absence, login) |
| `duty_assignments` | Serialised `ShiftAssignment` JSON keyed by `duty_date` (YYYY-MM-DD) |
| `announcements` | Single row (id=1) with a shared text note for the dashboard |
| `duty_messages` | Messages sent from mobile users to admin |
| `push_subscriptions` | Web Push subscriptions (user_login, user_role, subscription JSON) |
| `weather_cache` | Single row (id=1) written by a GitHub Actions cron, read by the Netlify function |

### Business logic libraries

- **`src/lib/duty.ts`** — duty-day calendar math. Duty cycle is every 4 days anchored to `2026-05-01`; billing cycle is every 28 days anchored to `2026-04-21`. `currentOrNextDutyDate()` is the primary entry point used across pages.
- **`src/lib/crew.ts`** — personnel types (`Person`, `ShiftAssignment`, `VehicleAssignment`), the `generateCrew()` auto-assignment algorithm, and all drag-and-drop helpers (`applyDrop`, slot key format below). The three crew vehicles are `gba`, `gcba532`, `gcba1060`.
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

### Netlify functions

- **`netlify/functions/weather.js`** — reads `weather_cache` row from Supabase and returns `{ morning, afternoon }` weather readings. Weather is populated externally by a GitHub Actions workflow, not by this app.
- **`netlify/functions/push-notify.js`** — sends Web Push notifications via `web-push` (VAPID). `type: 'new_message'` fans out to all admin/officer subscribers; `type: 'confirmed'` targets a specific `targetLogin`. Dead subscriptions (410/404) are auto-deleted from Supabase.

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

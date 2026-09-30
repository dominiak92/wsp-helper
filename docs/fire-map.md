# Fire map (`FireMapPage`) — deep dive

Read this before changing [src/pages/FireMapPage.tsx](../src/pages/FireMapPage.tsx) or its helper modules. The overview lives in [AGENTS.md](../AGENTS.md).

`FireMapPage` is a single Leaflet (`leaflet`, no React wrapper) map shared by both layouts: `/map` (Dashboard) and `/mobile/map` (Mobile). It is large and imperative — it manages Leaflet layers via refs, and bridges popup buttons to React through `window.__wsp*` globals. The map gets full viewport height; both layouts special-case the map route to `overflow-hidden`.

The page is **lazy-loaded** in `App.tsx` so Leaflet + plugins stay out of the main bundle. Modules that import Leaflet must only be imported from the map chunk.

## Module layout

| File | Contents |
|---|---|
| `src/pages/FireMapPage.tsx` | The component: state, refs, Leaflet layer management, navigation logic, UI |
| `src/lib/geo.ts` | Pure math/text helpers, **no Leaflet** (unit-tested in `geo.test.ts`): `computeBearing`, `shortestAngleDelta`, `vehicleSizeForZoom`, `buildRoadRegex`, `escapeRegex` |
| `src/lib/mapServices.ts` | External APIs (imports Leaflet): `overpassFetch`, `geocode`, `reverseGeocode`, `nearestLocality`, `fetchRoute` |
| `src/components/map/mapMarkup.ts` | Leaflet `DivIcon`s and popup HTML: `navArrowIcon`, `makeFeatureIcon`, `makeClusterIcon`, `featurePopupHtml`, `alertPopupHtml` |
| `src/components/map/WalkieTalkieIcon.tsx` | Custom SVG icon (lucide has no walkie-talkie) |
| `src/lib/mapFeatures.ts` | CRUD + types for persistent `map_features` |
| `src/lib/liveMap.ts` | CRUD for ephemeral `map_alerts` (2h TTL) and `live_locations` (30 min TTL) |

## Capabilities

- **Base layers** — OSM raster, or GUGiK ortofotomapa as a hybrid (ortofoto + transparent Esri roads + CARTO labels). Toggled in-page.
- **Persistent features** — water points / units / POIs / fire roads from `map_features` (via `mapFeatures.ts`), editable in an admin edit mode (drag to reposition flips `confirmed` to true). Point markers are grouped with `leaflet.markercluster` for readability when zoomed out (`clusterRef`, custom dark `makeClusterIcon`, `disableClusteringAtZoom: 16`); their permanent labels only appear once declustered. Clustering is bypassed in edit mode (markers go straight to `featureLayerRef`) so each is individually draggable; road polylines always stay on `featureLayerRef` (unclustered).
- **Shared live layers** — alert points (`map_alerts`) and live user locations (`live_locations`) via `liveMap.ts`, polled every ~10 s. Live sharing lasts 30 min, persisted client-side under `localStorage['wsp-share-until']`; a user's vehicle is resolved from the current duty assignment.
- **Search & routing** — Overpass API (road geometry), Nominatim (geocoding, viewbox-limited to the county), OSRM (driving routes). Routes can start from GPS position or from the station (`52.43626, 15.18625`). The search box shows **debounced autocomplete** (~0.5 s after the last keystroke): local map features match instantly, a numeric query offers the matching forest compartment, and geocoded places are appended after the pause. Picking a point/place suggestion calls `startNavigation`; roads call `navigateToRoad`. Suggestions are suppressed while navigating. Crucially they only react to **hand-typed** input (`lastTypedRef`): a programmatic `setQuery` (e.g. the selected compartment's name) must not re-trigger suggestions, otherwise picking one loops endlessly.
- **BDL forest compartments** — search a leśny compartment by number and overlay BDL "Oddziały" tiles; see the three `bdl-*` Netlify functions in AGENTS.md.
- **Scale + wind** — a metric `L.control.scale` (bottom-left, dark-themed) and a wind indicator badge (bottom-left, above the scale) whose arrow points downwind (fire-spread direction = meteo direction + 180°). Wind is fetched from Open-Meteo `current=wind_speed_10m,wind_direction_10m` (no key, Sulęcin coords), refreshed every 20 min; the badge hides on fetch error.
- **Duty-officer reports** — the walkie-talkie button (`WalkieTalkieIcon`, top of the right control column) opens a panel with two generated reports: "Zgłoś dojazd na miejsce" / "Zgłoś zakończenie akcji". Each inserts a `duty_messages` row (`sender_login`/`sender_name` = current user, message = `REPORT_PREFIX[kind] — zastęp {vehicle}, godz. {HH:MM}`) and fires a `new_message` push, so it shows in the admin dashboard like any message and is confirmed there (`read_at` → `confirmed` push). The map polls the user's own messages and shows per-kind status (Oczekuje / Potwierdzona); report kind is detected by the stable text prefix (no DB schema change). The vehicle/zastęp is the same `myVehicle` resolved for live sharing.

## Live navigation (track-up + re-routing)

Car-navigation-style mode built on the `leaflet-rotate` plugin (map init: `rotate: true`, other rotation handlers off; rotation set via `map.setBearing(-heading)`).

- **Start** — there is **no toggle button**. It starts automatically when the user taps **"Nawiguj z mojej pozycji"** in a popup (`__wspNavigateTo` with `sm === 'gps'` → `startNavigation`); "Nawiguj ze strażnicy" stays a static route preview (`routeTo`).
- **Track-up** — once active (`navMode`/`navModeRef`) the map centers on the GPS position at `NAV_ZOOM` (17) and rotates so the direction of travel points up. Heading is derived **purely from the last two GPS positions** (`computeBearing`, same principle as the shared fire-truck marker) — the Geolocation `heading` field is unreliable (often `0`/`null` at low speed, which left the map north-up = "driving sideways"). The reference point (`prevNavPosRef`) only advances after >6 m of movement, and the result is angle-smoothed in `headingRef`. The position marker becomes an up-pointing arrow (`navArrowIcon`) — leaflet-rotate keeps markers screen-upright, so up = forward.
- **Off-route re-routing** — each GPS tick measures min distance to the current route points (`routePtsRef`); beyond `REROUTE_OFF_ROUTE_M` (50 m) it recomputes from the live position (`drawNavRoute`), throttled by `reroutingRef` + an 8 s cooldown (`lastRerouteAtRef`).
- **Exit** — **only** via the single bottom "Zakończ nawigację" button (`endNavigation`) or automatically on arrival (`< ARRIVE_M`, 35 m → `arrivedToast`); panning/zooming does NOT exit (the next GPS tick re-centers).
- **Manual rotation** — `touchRotate: true` lets the user two-finger-rotate even mid-navigation; a manual rotate sets `navManualRef` (detected via the `rotate` event when `applyingAutoBearingRef` is false), which pauses auto track-up so the map keeps the user's angle (centering/re-routing continue). A compass button (top of the bottom-right column, shown while navigating or whenever the map is off-north; rotates to show north) resumes track-up during nav (`navManualRef = false` + re-apply `-heading`) or resets to north outside nav (`setBearing(0)`). Map bearing is mirrored into `bearingDeg` from the `rotate` event.
- **Stale closures** — the GPS handler is registered once on mount, so it calls the latest `endNavigation`/`drawNavRoute` via `endNavigationRef`/`drawNavRouteRef`.
- **Limits** — Leaflet is 2D: rotation only, **not** 3D/tilt perspective (that would need MapLibre GL).

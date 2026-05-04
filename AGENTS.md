# WSP Command Center — Agent Context

Panel operacyjny dla Wojskowej Straży Pożarnej (Military Fire Brigade), Zmiana II.

---

## Stack

| | |
|---|---|
| Frontend | React 18 + Vite 4 + TypeScript |
| Styling | Tailwind CSS v3 (`darkMode: 'class'`) |
| UI components | Hand-built shadcn-style w `src/components/ui/` (bez CLI) |
| Icons | Lucide React |
| Router | React Router Dom v7 |
| Backend | Supabase (auth + postgres) |
| Hosting | Netlify + Netlify Functions |
| Node | **v18.16** — nie upgrade'uj Vite powyżej v4 (v5 wymaga Node 20+) |

---

## Struktura katalogów

```
src/
├── components/
│   ├── layout/
│   │   ├── DashboardLayout.tsx   # Header + Sidebar + <Outlet>
│   │   ├── MobileLayout.tsx      # Uproszczony layout dla strażaków (role=user)
│   │   ├── Sidebar.tsx           # Collapsible (w-16/w-60), navGroups, wyloguj
│   │   └── TopBar.tsx
│   ├── ui/
│   │   ├── Button.tsx            # warianty: default, destructive, outline, ghost, success
│   │   ├── Input.tsx             # text, password, date, time
│   │   ├── Card.tsx              # CardHeader, CardTitle, CardContent, CardFooter
│   │   └── Badge.tsx             # warianty: default, success, warning, danger, info, outline
│   └── DutyAssignmentView.tsx
├── lib/
│   ├── auth.tsx                  # AuthProvider + useAuth() hook
│   ├── supabase.ts               # klient Supabase
│   ├── database.types.ts         # generowane typy tabel
│   ├── crew.ts                   # logika obsady, typy Person/ShiftAssignment
│   ├── duty.ts                   # helpery dat (system 4/4)
│   ├── incident.ts               # generator opisów zdarzeń
│   └── utils.ts
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── IncidentGeneratorPage.tsx
│   ├── CrewGeneratorPage.tsx
│   ├── DutyCalendarPage.tsx
│   ├── GaragePage.tsx
│   ├── VademecumPage.tsx
│   └── mobile/
│       ├── MobileHomePage.tsx
│       └── MobileCalendarPage.tsx
├── types/
│   └── index.ts                  # ReadinessStatus, User, NavItem
└── App.tsx
netlify/functions/
└── weather.js                    # endpoint pogodowy (fire threat)
```

---

## Trasy (App.tsx)

```
/login                   →  LoginPage (publiczna)
/mobile                  →  MobileHomePage    (role = 'user')
/mobile/calendar         →  MobileCalendarPage
/dashboard               →  DashboardPage     (role = admin | officer)
/incident-generator      →  IncidentGeneratorPage
/crew-generator          →  CrewGeneratorPage
/duty-calendar           →  DutyCalendarPage
/garage                  →  GaragePage
/vademecum               →  VademecumPage
*                        →  redirect /login
```

Nową stronę dodaj w **App.tsx** (Route) + **Sidebar.tsx** (navGroups).

---

## Nawigacja (Sidebar.tsx — navGroups)

```
GŁÓWNE:    Dashboard (/dashboard)
NARZĘDZIA: Generator opisów, Kalendarz służb, Garaż, Vademecum
```

---

## Kluczowe typy (src/lib/crew.ts)

```ts
type RoleType = 'SHIFT_COMMANDER' | 'VEHICLE_COMMANDER' | 'DUTY_OFFICER' | 'DRIVER_RESCUER' | 'RESCUER'
type AbsenceType = 'WH' | '8W' | 'W' | 'oddelegowanie' | 'L4'

interface Person {
  id: string; name: string; roles: RoleType[]
  preferredVehicleId?: string; absence: AbsenceType | null; login?: string | null
}

interface VehicleAssignment {
  vehicleId: CrewVehicleId
  commanderId: string | null; driverId: string | null; rescuerIds: string[]
}

interface ShiftAssignment {
  shiftCommanderId: string | null; dutyOfficerIds: string[]
  vehicles: VehicleAssignment[]; unassignedIds: string[]
  absenceMap?: Record<string, AbsenceType>
}
```

Eksportowane funkcje: `generateCrew`, `applyDrop`, `isPersonInAssignment`, `resolveName`.

---

## Supabase — schemat tabel

| Tabela | Kluczowe kolumny |
|---|---|
| `personnel` | id, name, roles (array), preferred_vehicle_id, absence, login |
| `duty_assignments` | duty_date (PK, YYYY-MM-DD), assignment_json (ShiftAssignment) |
| `announcements` | id=1, message, updated_by |
| `duty_messages` | sender_login, sender_name, message, created_at, read_at |

---

## Autentykacja

- `useAuth()` → `{ user, loading, signIn(), signOut() }`
- Po zalogowaniu: `role === 'user'` → `/mobile`, inaczej → `/dashboard`
- Aktualnie (Etap 1): symulowane 800ms async; Supabase Auth gotowy do podpięcia

---

## Tailwind — palety kolorów

| Token | Użycie |
|---|---|
| `brand-{50-900}` | akcent UI (niebieski), aktywne NavLinki |
| `surface-{500-950}` | tło panelu (dark grey) |
| `alert-{red,amber,green}` | statusy zagrożeń |

Animacje: `pulse-slow`, `blink`. Czcionki: Inter (UI) + JetBrains Mono.

---

## System dat służby (src/lib/duty.ts)

Rytm 24h/72h (4 dni służby, 4 dni wolne):
```ts
isDutyDay(y, m, d): boolean  // (Date.UTC - REF_UTC) % 4 === 0
currentOrNextDutyDate(): string  // YYYY-MM-DD
previousDutyDate(key): string
```

Klikając dzień w DutyCalendarPage → `navigate('/crew-generator?date=YYYY-MM-DD')`.

---

## Generator opisów (src/lib/incident.ts)

Dwie kategorie formularza:
- **MON** — data, godzina, zgłaszający, miejsce (Pas ćwiczeń/Strzelnica/…), pojazdy
- **CIVILIAN** — stopień/imię/nazwisko, funkcja, jednostka, płeć

Funkcje: `generateDescription(form)`, `totalZastepy(form)`, `pluralZastep(n)`.

---

## Netlify

```toml
# netlify.toml
[build] command="npm run build" publish="dist"
[build.environment] NODE_VERSION="18"
[functions] directory="netlify/functions" node_bundler="esbuild"
[[redirects]] from="/*" to="/index.html" status=200
```

Weather endpoint: `/.netlify/functions/weather` (fire threat level 0-5, temp, humidity, wind).

---

## Konwencje kodowania

- Komponenty w `src/components/ui/` — czyste, bez zależności od Supabase
- Logika domenowa wyłącznie w `src/lib/`
- Pages importują z `lib/` i `components/`, nigdy odwrotnie
- Brak external UI library — wszystkie komponenty pisane ręcznie
- Dark mode zawsze włączony (klasa `dark` na `<html>`)
- `cn()` z `src/lib/utils.ts` do łączenia klas Tailwind

---

## Stan projektu (Etap 1 — inicjalizacja)

Zbudowana struktura + architektura wizualna. Brak prawdziwego auth i DB w pełni (Supabase podłączone, ale dane częściowo mockowane). Kolejne etapy: pełna integracja Supabase, role RBAC, real-time updates.

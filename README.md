# WSP Helper

Aplikacja PWA wspierająca służbę w **WSP OSPWL Wędrzyn**: obsady zmian (generator z drag-and-drop), kalendarz służb i okresów rozliczeniowych, grafik godzin, zagrożenie pożarowe i pogoda, mapa ppoż. z nawigacją, generator meldunków oraz widok mobilny dla strażaków (przydział, wiadomości do dyżurnego, zgłaszanie nieobecności, powiadomienia push).

**Stack:** React 18 · TypeScript · Vite · Tailwind · Supabase · Netlify (hosting + functions) · Leaflet

## Uruchomienie lokalne

```bash
nvm use 18.16.0          # projekt działa na Node 18 (.nvmrc)
npm install
cp .env.example .env.local   # uzupełnij klucze Supabase / VAPID
npm run dev
```

## Komendy

| Komenda | Opis |
|---|---|
| `npm run dev` | serwer deweloperski Vite |
| `npm run lint` | ESLint (0 ostrzeżeń) |
| `npm test` | testy Vitest logiki biznesowej (`src/lib/*.test.ts`) |
| `npm run build` | type-check + build produkcyjny do `dist/` |
| `npm run preview` | podgląd buildu |

Przed commitem: `npm run lint && npm test && npm run build`.

## Wdrożenie

Netlify buduje i publikuje gałąź `main` automatycznie (`netlify.toml`). Zmiany w bazie Supabase wprowadza się ręcznie — patrz [supabase/migrations/README.md](supabase/migrations/README.md).

## Dokumentacja

- [AGENTS.md](AGENTS.md) — architektura, konwencje i zasady pracy (dla ludzi i agentów AI)
- [docs/fire-map.md](docs/fire-map.md) — szczegóły mapy ppoż.

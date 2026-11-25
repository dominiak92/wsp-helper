// Daty w strefie Europe/Warsaw dla funkcji Netlify (serwer chodzi w UTC).
// Kopia logiki z src/lib/duty.ts (anchor 2026-05-01, co 4 dni, zmiana o 7:30) — trzymaj w zgodzie.

const REF_UTC = Date.UTC(2026, 4, 1)

// formatToParts zamiast toLocaleDateString('en-CA') — format en-CA zależy od wersji ICU
function warsawParts(now) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Warsaw', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    }).formatToParts(now).map(p => [p.type, p.value]),
  )
}

function utcKey(t) {
  const nd = new Date(t)
  return `${nd.getUTCFullYear()}-${String(nd.getUTCMonth() + 1).padStart(2, '0')}-${String(nd.getUTCDate()).padStart(2, '0')}`
}

// Dzisiejsza data kalendarzowa w Polsce (YYYY-MM-DD)
export function warsawTodayKey(now = new Date()) {
  const p = warsawParts(now)
  return utcKey(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)))
}

// Kopia currentOrNextDutyDate: służba trwa do 7:30 następnego dnia (HANDOVER w duty.ts)
export function currentOrNextDutyDateWarsaw(now = new Date()) {
  const parts = warsawParts(now)
  const y = Number(parts.year), m = Number(parts.month), d0 = Number(parts.day)
  const beforeHandover = Number(parts.hour) * 60 + Number(parts.minute) < 7 * 60 + 30
  const d = beforeHandover ? d0 - 1 : d0 // Date.UTC normalizuje d=0 na koniec poprzedniego miesiąca
  for (let i = 0; i <= 3; i++) {
    const t = Date.UTC(y, m - 1, d + i)
    if (((t - REF_UTC) / 86400000) % 4 === 0) return utcKey(t)
  }
  return utcKey(Date.UTC(y, m - 1, d)) // nieosiągalne — co 4. dzień jest dniem służby
}

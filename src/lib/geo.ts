// Pure geometry / text helpers for the fire map. Intentionally free of Leaflet
// imports so they stay unit-testable in Node (see geo.test.ts).

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Regex matching a road name/ref in Overpass. Numeric edges get non-digit guards,
// so "12" matches "DW 12" but not "123".
export function buildRoadRegex(q: string): string {
  const e = escapeRegex(q)
  const pre = /^[0-9]/.test(q) ? '(^|[^0-9])' : ''
  const suf = /[0-9]$/.test(q) ? '([^0-9]|$)' : ''
  return `${pre}${e}${suf}`
}

// Azymut (0=północ, 90=wschód) między dwoma punktami
export function computeBearing(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const phi1 = toRad(aLat), phi2 = toRad(bLat), dLng = toRad(bLng - aLng)
  const y = Math.sin(dLng) * Math.cos(phi2)
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

// Najkrótsza różnica kątów (-180..180) — do płynnego wygładzania kierunku jazdy
export function shortestAngleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
}

// Rozmiar znacznika pojazdu (px) skalowany wg zoomu mapy
export function vehicleSizeForZoom(z: number): number {
  return Math.round(Math.max(34, Math.min(96, (z - 11) * 11 + 38)))
}

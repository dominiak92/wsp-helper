// External map services used by FireMapPage: Overpass (road geometry),
// Nominatim (geocoding / reverse geocoding) and OSRM (driving routes).
// Imports Leaflet — only import from the lazily-loaded FireMapPage chunk.
import L from 'leaflet'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving'

const COUNTY = { south: 52.15, north: 52.62, west: 14.85, east: 15.50 }
const NOMINATIM_VIEWBOX = `${COUNTY.west},${COUNTY.north},${COUNTY.east},${COUNTY.south}`

export interface OsmWay {
  type: 'way'
  id: number
  tags?: Record<string, string>
  geometry: { lat: number; lon: number }[]
}

export interface NominatimPlace {
  display_name: string
  lat: string
  lon: string
}

export async function overpassFetch(ql: string): Promise<OsmWay[]> {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(ql)}`,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return (json.elements ?? []).filter((e: { type: string }) => e.type === 'way') as OsmWay[]
}

export async function geocode(q: string): Promise<NominatimPlace[]> {
  const params = new URLSearchParams({
    q, format: 'json', limit: '5', 'accept-language': 'pl',
    viewbox: NOMINATIM_VIEWBOX, bounded: '1',
  })
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'User-Agent': 'WSP-Helper/1.0' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const TYPE_PL: Record<string, string> = {
  lake: 'Jezioro', river: 'Rzeka', stream: 'Strumień', pond: 'Staw', reservoir: 'Zbiornik wodny',
  forest: 'Las', wood: 'Las', scrub: 'Zarośla', heath: 'Wrzosowisko', meadow: 'Łąka',
  farmland: 'Pole uprawne', grass: 'Trawnik',
  track: 'Droga leśna', path: 'Ścieżka', road: 'Droga',
  military: 'Teren wojskowy', building: 'Budynek', house: 'Dom',
  residential: 'Obszar zabudowany', village: 'Wieś', hamlet: 'Przysiółek',
}

export async function reverseGeocode(latlng: L.LatLng): Promise<{ name: string; subtitle: string }> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${latlng.lat.toFixed(6)}&lon=${latlng.lng.toFixed(6)}&format=json&accept-language=pl`,
    { headers: { 'User-Agent': 'WSP-Helper/1.0' } },
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const d = await res.json()
  const name =
    d.name ||
    d.address?.road ||
    d.address?.hamlet ||
    d.address?.village ||
    d.address?.town ||
    'Nieznane miejsce'
  const typePl = TYPE_PL[d.type] || TYPE_PL[d.class] || ''
  const place = [d.address?.village, d.address?.town, d.address?.city].find(Boolean) || ''
  const subtitle = [typePl, place].filter(Boolean).join(' · ')
  return { name, subtitle }
}

// Najbliższa miejscowość (punkt orientacyjny) dla danego punktu
export async function nearestLocality(latlng: L.LatLng): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latlng.lat.toFixed(6)}&lon=${latlng.lng.toFixed(6)}&format=json&accept-language=pl&zoom=12`,
      { headers: { 'User-Agent': 'WSP-Helper/1.0' } },
    )
    if (!res.ok) return ''
    const d = await res.json()
    return d.address?.village || d.address?.hamlet || d.address?.town
      || d.address?.city || d.address?.municipality || d.name || ''
  } catch {
    return ''
  }
}

export async function fetchRoute(from: L.LatLng, to: L.LatLng): Promise<L.LatLng[]> {
  const url =
    `${OSRM_URL}/${from.lng.toFixed(6)},${from.lat.toFixed(6)};` +
    `${to.lng.toFixed(6)},${to.lat.toFixed(6)}?geometries=geojson&overview=full`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (json.code !== 'Ok') throw new Error('Nie znaleziono trasy')
  return (json.routes[0].geometry.coordinates as [number, number][]).map(
    ([lon, lat]) => L.latLng(lat, lon),
  )
}

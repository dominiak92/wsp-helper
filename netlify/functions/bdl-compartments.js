// Pobiera jeden duży obraz PNG podziału powierzchniowego BDL dla rejonu OSPWL.
// Używa /export w skali ~zoom 14 (gdzie warstwa Oddziałów jest widoczna).
// imageOverlay zamiast kafelków → brak artefaktów przy zoomowaniu.

const BASE = 'https://mapserver.bdl.lasy.gov.pl/ArcGIS/rest/services/Mapa_podstawowa_BDL/MapServer'
const HEADERS = {
  Referer: 'https://www.bdl.lasy.gov.pl/portal/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

// OSPWL w EPSG:3857 (Web Mercator) — odpowiada dokładnie granicom Leaflet overlay
// [[52.31, 14.98], [52.52, 15.35]] przeliczone formułą sferycznego Mercatora (R=6378137)
// x = R*λ_rad ; y = R*ln(tan(π/4 + φ/2))
const BBOX = { west: 1667564, south: 6858940, east: 1708753, north: 6898510 }

// Rozmiar obrazu utrzymujący aspect ratio i skalę ≈ 1:38 000 (zoom 14)
// W: 41189m, H: 39570m → ratio 1.041 → IMG_H = round(4096/1.041)
// scale = (41189m / 4096px) * (96dpi / 0.0254) ≈ 38 000 — warstwa Oddziałów widoczna
const IMG_W = 4096
const IMG_H = 3934

// Moduł-level cache (działa dla warm-start Lambda)
let _layerId = null

async function resolveLayerId() {
  if (_layerId !== null) return _layerId
  try {
    const res = await fetch(`${BASE}?f=json`, { headers: HEADERS })
    if (!res.ok) return null
    const { layers = [] } = await res.json()
    const found = layers.find(l => typeof l.name === 'string' && l.name.toLowerCase().includes('oddzia'))
    _layerId = found ? String(found.id) : null
  } catch { /* ignore */ }
  return _layerId
}

export const handler = async () => {
  const layerId = await resolveLayerId()
  const layers = layerId ? `show:${layerId}` : 'show:0,1,2,3,4,5,6'

  const params = new URLSearchParams({
    dpi: '96',
    transparent: 'true',
    format: 'png8',
    bbox: `${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}`,
    bboxSR: '102100',
    imageSR: '102100',
    size: `${IMG_W},${IMG_H}`,
    layers,
    f: 'image',
  })

  try {
    const res = await fetch(`${BASE}/export?${params}`, { headers: HEADERS })
    if (!res.ok) return { statusCode: res.status, body: `BDL: ${res.status}` }

    const buf = await res.arrayBuffer()
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
      body: Buffer.from(buf).toString('base64'),
      isBase64Encoded: true,
    }
  } catch (err) {
    return { statusCode: 502, body: String(err) }
  }
}

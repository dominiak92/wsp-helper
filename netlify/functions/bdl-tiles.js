// Proxy kafelkowy BDL (próba zamiast jednego rozciąganego obrazu).
// Dla kafla {z}/{x}/{y} liczy jego bbox w Web Mercator (EPSG:3857) i pobiera
// z ArcGIS /export obraz 256×256 tylko z warstwami "Oddziały". Dzięki temu
// L.tileLayer układa kafle natywnie w projekcji mapy — bez ręcznej kalibracji,
// z automatycznym wyrównaniem na dowolnym obszarze i zoomie.
//
// Uwaga: warstwa Oddziałów w BDL jest widoczna dopiero < 1:170k (ok. zoom 12+),
// więc przy mocnym oddaleniu kafle wracają puste (przezroczyste) — to zgodne
// z danymi źródłowymi (poprzedni pojedynczy obraz "udawał" widoczność, rozciągając
// render z jednej skali).

const BASE = 'https://mapserver.bdl.lasy.gov.pl/ArcGIS/rest/services/Mapa_podstawowa_BDL/MapServer'
const HEADERS = {
  Referer: 'https://www.bdl.lasy.gov.pl/portal/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

const R = 20037508.342789244 // pół obwodu w Web Mercator (m)
const WORLD = 2 * R

// Cache na poziomie modułu (warm-start Lambda)
let _layerIds = null

async function resolveLayerIds() {
  if (_layerIds !== null) return _layerIds
  try {
    const res = await fetch(`${BASE}?f=json`, { headers: HEADERS })
    if (!res.ok) return null
    const { layers = [] } = await res.json()
    const ids = layers
      .filter(l => typeof l.name === 'string' && l.name.toLowerCase().includes('oddzia'))
      .map(l => l.id)
    _layerIds = ids.length ? ids.join(',') : null
  } catch { /* ignore */ }
  return _layerIds
}

export const handler = async (event) => {
  const q = event.queryStringParameters || {}
  const z = parseInt(q.z, 10)
  const x = parseInt(q.x, 10)
  const y = parseInt(q.y, 10)
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) {
    return { statusCode: 400, body: 'Wymagane parametry: z, x, y' }
  }

  const tile = WORLD / 2 ** z
  const minX = -R + x * tile
  const maxX = minX + tile
  const maxY = R - y * tile
  const minY = maxY - tile

  const ids = await resolveLayerIds()
  const layers = ids ? `show:${ids}` : 'show:18,19'

  const params = new URLSearchParams({
    dpi: '96',
    transparent: 'true',
    format: 'png32',
    bbox: `${minX},${minY},${maxX},${maxY}`,
    bboxSR: '102100',
    imageSR: '102100',
    size: '256,256',
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

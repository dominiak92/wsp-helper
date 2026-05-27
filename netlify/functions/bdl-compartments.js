// Tile proxy dla BDL Mapa_podstawowa_BDL — warstwa Oddziały PGL LP
// 1. Pobiera info o serwisie żeby znaleźć właściwy layer ID
// 2. Proxuje kafelki PNG z /export (omija blokadę 403 po stronie klienta)

const BASE = 'https://mapserver.bdl.lasy.gov.pl/ArcGIS/rest/services/Mapa_podstawowa_BDL/MapServer'
const HEADERS = {
  Referer: 'https://www.bdl.lasy.gov.pl/portal/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

// Zamiana tile z/x/y → bbox w Web Mercator (EPSG:3857 / 102100)
function tileBbox(z, x, y) {
  const k = 20037508.3428
  const size = (2 * k) / Math.pow(2, z)
  return [
    x * size - k,           // west
    k - (y + 1) * size,     // south
    (x + 1) * size - k,     // east
    k - y * size,           // north
  ].map(v => v.toFixed(4)).join(',')
}

// Próbuje znaleźć layer ID dla "Oddziały" z metadanych serwisu BDL
async function resolveLayerId() {
  try {
    const res = await fetch(`${BASE}?f=json`, { headers: HEADERS })
    if (!res.ok) return null
    const info = await res.json()
    const match = (info.layers ?? []).find(
      l => typeof l.name === 'string' && l.name.toLowerCase().includes('oddzia'),
    )
    return match ? String(match.id) : null
  } catch {
    return null
  }
}

export const handler = async (event) => {
  const z = parseInt(event.queryStringParameters?.z ?? '12')
  const x = parseInt(event.queryStringParameters?.x ?? '0')
  const y = parseInt(event.queryStringParameters?.y ?? '0')

  if ([z, x, y].some(isNaN)) {
    return { statusCode: 400, body: 'Invalid tile coordinates' }
  }

  // Auto-wykryj warstwę Oddziały; fallback: pokaż warstwy 0-6 (cała hierarchia LP)
  const layerId = await resolveLayerId()
  const layers = layerId ? `show:${layerId}` : 'show:0,1,2,3,4,5,6'

  const params = new URLSearchParams({
    dpi: '96',
    transparent: 'true',
    format: 'png8',
    bbox: tileBbox(z, x, y),
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

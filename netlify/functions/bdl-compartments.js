// Tile proxy dla BDL Mapa_podstawowa_BDL — warstwa Oddziały (layer show:3)
// Pobiera kafelki PNG z serwera BDL (server-side omija CORS) i zwraca je klientowi.

const BASE = 'https://mapserver.bdl.lasy.gov.pl/ArcGIS/rest/services/Mapa_podstawowa_BDL/MapServer'

// Zamiana tile z/x/y na bbox w układzie Web Mercator (EPSG:3857 / 102100)
function tileBbox(z, x, y) {
  const k = 20037508.3428
  const size = (2 * k) / Math.pow(2, z)
  return {
    west:  x * size - k,
    east:  (x + 1) * size - k,
    north: k - y * size,
    south: k - (y + 1) * size,
  }
}

export const handler = async (event) => {
  const z = parseInt(event.queryStringParameters?.z ?? '12')
  const x = parseInt(event.queryStringParameters?.x ?? '0')
  const y = parseInt(event.queryStringParameters?.y ?? '0')

  if (isNaN(z) || isNaN(x) || isNaN(y)) {
    return { statusCode: 400, body: 'Invalid tile coordinates' }
  }

  const { west, south, east, north } = tileBbox(z, x, y)

  const params = new URLSearchParams({
    dpi: '96',
    transparent: 'true',
    format: 'png32',
    bbox: `${west},${south},${east},${north}`,
    bboxSR: '102100',
    imageSR: '102100',
    size: '256,256',
    layers: 'show:3',
    f: 'image',
  })

  try {
    const res = await fetch(`${BASE}/export?${params}`, {
      headers: {
        Referer: 'https://www.bdl.lasy.gov.pl/portal/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    if (!res.ok) return { statusCode: res.status, body: `BDL export: ${res.status}` }

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

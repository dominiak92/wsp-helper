// Pobiera jeden duży obraz PNG podziału powierzchniowego BDL dla rejonu OSPWL.
// Używa /export w skali ~zoom 14 (gdzie warstwa Oddziałów jest widoczna).
// imageOverlay zamiast kafelków → brak artefaktów przy zoomowaniu.

const BASE = 'https://mapserver.bdl.lasy.gov.pl/ArcGIS/rest/services/Mapa_podstawowa_BDL/MapServer'
const HEADERS = {
  Referer: 'https://www.bdl.lasy.gov.pl/portal/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

// OSPWL overlay: [[52.31, 14.98], [52.52, 15.52]]
// ArcGIS stretches the rendered image by ~3.2% relative to the requested BBOX.
// These values are calibrated from 4 ground-truth points so the returned image
// aligns with the Leaflet overlay. Regression: content_y = 1.032*requested_y - 217323
// Oś X (długość) mapuje się wprost: east = merc(15.52) = 1727679 (rozszerzono z
// 15.35, by objąć Jezioro Paklicko Małe k. Wysokiej, 52.37472, 15.45708). Oś Y
// (kalibracja) bez zmian.
const BBOX = { west: 1667564, south: 6850129, east: 1727679, north: 6888440 }

// W: 60115m, H: 38311m → ratio 1.5691 → IMG_H = round(4096/1.5691) = 2610
// (limit usługi to 4096 px; rozdzielczość ~14,7 m/px, skala ~1:55k — oddziały
//  widoczne, bo warstwa znika dopiero powyżej 1:170k)
const IMG_W = 4096
const IMG_H = 2610

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
        'Cache-Control': 'public, max-age=3600',
      },
      body: Buffer.from(buf).toString('base64'),
      isBase64Encoded: true,
    }
  } catch (err) {
    return { statusCode: 502, body: String(err) }
  }
}

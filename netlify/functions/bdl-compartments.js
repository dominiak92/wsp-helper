// Proxy do BDL ArcGIS REST — pobiera granice oddziałów leśnych (Mapa_podstawowa_BDL)
// dla rejonu OSPWL i zwraca GeoJSON. Serwer-side omija blokadę 403 na kliencie.

const BASE = 'https://mapserver.bdl.lasy.gov.pl/ArcGIS/rest/services/Mapa_podstawowa_BDL/MapServer'
const OSPWL_BBOX = '14.98,52.37,15.35,52.52' // west,south,east,north (WGS84)

const HEADERS = {
  Referer: 'https://mapy.bdl.lasy.gov.pl/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

export const handler = async () => {
  try {
    // Znajdź warstwę "Oddziały" w serwisie BDL
    let layerId = 3 // fallback — prawdopodobna pozycja warstwy
    const infoRes = await fetch(`${BASE}?f=json`, { headers: HEADERS })
    if (infoRes.ok) {
      const info = await infoRes.json()
      const match = (info.layers ?? []).find(
        l => typeof l.name === 'string' && l.name.toLowerCase().includes('oddzia'),
      )
      if (match != null) layerId = match.id
    }

    // Zapytaj o cechy w bbox OSPWL
    const params = new URLSearchParams({
      where: '1=1',
      geometryType: 'esriGeometryEnvelope',
      geometry: OSPWL_BBOX,
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outSR: '4326',
      outFields: '*',
      returnGeometry: 'true',
      resultRecordCount: '5000',
      f: 'geojson',
    })

    const featRes = await fetch(`${BASE}/${layerId}/query?${params}`, { headers: HEADERS })
    if (!featRes.ok) {
      return { statusCode: featRes.status, body: `BDL error: ${featRes.status}` }
    }

    const data = await featRes.json()
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400',
      },
      body: JSON.stringify(data),
    }
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: String(err) }),
    }
  }
}

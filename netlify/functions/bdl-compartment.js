// Wyszukiwanie granic oddziału leśnego BDL po numerze (np. 361).
// Odpytuje warstwę "Oddziały PGL LP" (id 18) w obrębie rejonu OSPWL i zwraca
// geometrię (uproszczoną) pasujących oddziałów. Numer może występować w kilku
// leśnictwach — klient wybiera najbliższy.

const BASE = 'https://mapserver.bdl.lasy.gov.pl/ArcGIS/rest/services/Mapa_podstawowa_BDL/MapServer'
const HEADERS = {
  Referer: 'https://www.bdl.lasy.gov.pl/portal/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

// Rejon OSPWL (z zapasem na wschód do Jez. Paklicko Małe)
const AREA = { west: 14.98, south: 52.27558, east: 15.52, north: 52.48582 }

export const handler = async (event) => {
  const raw = (event.queryStringParameters && event.queryStringParameters.nr) || ''
  const m = String(raw).match(/\d{1,4}/)
  if (!m) return { statusCode: 400, body: 'Podaj numer oddziału' }
  const nr = m[0]

  const params = new URLSearchParams({
    where: `compartment_cd LIKE '${nr}%'`,
    geometry: `${AREA.west},${AREA.south},${AREA.east},${AREA.north}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'compartment_cd,forest_range_cd,adress_forest',
    returnGeometry: 'true',
    geometryPrecision: '6',
    maxAllowableOffset: '0.0001',
    f: 'json',
  })

  try {
    const res = await fetch(`${BASE}/18/query?${params}`, { headers: HEADERS })
    if (!res.ok) return { statusCode: res.status, body: `BDL: ${res.status}` }
    const json = await res.json()
    const features = (json.features || [])
      // dokładne dopasowanie numeru (compartment_cd jest dopełniony spacjami)
      .filter(f => String(f.attributes.compartment_cd || '').trim() === nr)
      .map(f => ({
        label: `Oddział ${nr}`,
        range: String(f.attributes.forest_range_cd || '').trim(),
        adress: String(f.attributes.adress_forest || '').trim(),
        rings: f.geometry && f.geometry.rings ? f.geometry.rings : [],
      }))
      .filter(f => f.rings.length > 0)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      body: JSON.stringify({ features }),
    }
  } catch (err) {
    return { statusCode: 502, body: String(err) }
  }
}

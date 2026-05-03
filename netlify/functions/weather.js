function windDirLabel(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(Number(deg) / 45) % 8]
}

export const handler = async () => {
  try {
    const res = await fetch('https://www.traxelektronik.pl/pogoda/las/zbiorcza.php', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; wsp-helper)' },
    })
    if (!res.ok) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Upstream ${res.status}` }),
      }
    }

    const html = new TextDecoder('iso-8859-2').decode(await res.arrayBuffer())

    // Rzepin LBL station ID 1946
    const rowMatch = html.match(
      /<tr><td class=r0><a href=stacja\.php\?idst=1946[^>]*>[^<]*<\/a><\/td>(.*?)<\/tr>/
    )
    if (!rowMatch) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Station Rzepin LBL not found' }),
      }
    }

    // cells: [0] moisture, [1] temperature, [2] humidity, [3] precipitation, [4] windSpeed, [5] windDir(deg)
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(m => m[1].trim())

    // Zone fire threat levels sit in the zone header row just before Rzepin LBL (rowspan=2)
    const beforeRzepin = html.substring(0, html.indexOf('>Rzepin LBL<'))
    const threats = [...beforeRzepin.matchAll(/<td class=r2[^>]*><b>([^<]+)<\/b><\/td>/g)]
      .slice(-2)
      .map(m => m[1].trim())

    const ts = html.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/)?.[1] ?? null

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=600, max-age=600',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        moisture:           cells[0] ?? null,
        temperature:        cells[1] ?? null,
        humidity:           cells[2] ?? null,
        precipitation:      cells[3] ?? null,
        windSpeed:          cells[4] ?? null,
        windDir:            cells[5] ? windDirLabel(cells[5]) : null,
        fireThreat:         threats[0] ?? null,
        fireThreatForecast: threats[1] ?? null,
        updatedAt:          ts,
      }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: String(err) }),
    }
  }
}

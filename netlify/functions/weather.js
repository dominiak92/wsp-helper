// ISO-8859-2 → Unicode map for chars that differ from ISO-8859-1.
// latin1 decode maps bytes 0x00-0xFF directly to Unicode codepoints,
// so we only need to remap the positions that ISO-8859-2 assigns differently.
const ISO88592 = new Map([
  [0xA1,'Ą'],[0xA2,'˘'],[0xA3,'Ł'],[0xA4,'¤'],
  [0xA5,'Ľ'],[0xA6,'Ś'],[0xA7,'§'],[0xA8,'¨'],
  [0xA9,'Š'],[0xAA,'Ş'],[0xAB,'Ť'],[0xAC,'Ź'],
  [0xAD,'­'],[0xAE,'Ž'],[0xAF,'Ż'],[0xB0,'°'],
  [0xB1,'ą'],[0xB2,'˛'],[0xB3,'ł'],[0xB4,'´'],
  [0xB5,'ľ'],[0xB6,'ś'],[0xB7,'ˇ'],[0xB8,'¸'],
  [0xB9,'š'],[0xBA,'ş'],[0xBB,'ť'],[0xBC,'ź'],
  [0xBD,'˝'],[0xBE,'ž'],[0xBF,'ż'],[0xC0,'Ŕ'],
  [0xC1,'Á'],[0xC2,'Â'],[0xC3,'Ă'],[0xC4,'Ä'],
  [0xC5,'Ĺ'],[0xC6,'Ć'],[0xC7,'Ç'],[0xC8,'Č'],
  [0xC9,'É'],[0xCA,'Ę'],[0xCB,'Ë'],[0xCC,'Ě'],
  [0xCD,'Í'],[0xCE,'Î'],[0xCF,'Ď'],[0xD0,'Đ'],
  [0xD1,'Ń'],[0xD2,'Ň'],[0xD3,'Ó'],[0xD4,'Ô'],
  [0xD5,'Ő'],[0xD6,'Ö'],[0xD7,'×'],[0xD8,'Ř'],
  [0xD9,'Ů'],[0xDA,'Ú'],[0xDB,'Ű'],[0xDC,'Ü'],
  [0xDD,'Ý'],[0xDE,'Ţ'],[0xDF,'ß'],[0xE0,'ŕ'],
  [0xE1,'á'],[0xE2,'â'],[0xE3,'ă'],[0xE4,'ä'],
  [0xE5,'ĺ'],[0xE6,'ć'],[0xE7,'ç'],[0xE8,'č'],
  [0xE9,'é'],[0xEA,'ę'],[0xEB,'ë'],[0xEC,'ě'],
  [0xED,'í'],[0xEE,'î'],[0xEF,'ď'],[0xF0,'đ'],
  [0xF1,'ń'],[0xF2,'ň'],[0xF3,'ó'],[0xF4,'ô'],
  [0xF5,'ő'],[0xF6,'ö'],[0xF7,'÷'],[0xF8,'ř'],
  [0xF9,'ů'],[0xFA,'ú'],[0xFB,'ű'],[0xFC,'ü'],
  [0xFD,'ý'],[0xFE,'ţ'],[0xFF,'˙'],
])

// latin1 is always available in Node.js; remap extended chars for ISO-8859-2.
function decodeISO88592(buf) {
  const s = new TextDecoder('latin1').decode(buf)
  return s.replace(/[\x80-\xFF]/g, ch => ISO88592.get(ch.charCodeAt(0)) ?? ch)
}

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

    const html = decodeISO88592(await res.arrayBuffer())

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
    console.error('[weather]', err)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: String(err) }),
    }
  }
}

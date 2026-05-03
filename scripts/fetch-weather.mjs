/**
 * Fetches Rzepin LBL weather data from traxelektronik.pl and caches it in
 * a Supabase `weather_cache` table. Run via GitHub Actions cron every 15 min.
 *
 * Required env vars:
 *   SUPABASE_URL          – project URL (e.g. https://xxx.supabase.co)
 *   SUPABASE_SERVICE_KEY  – service_role key (bypasses RLS for the write)
 */

import https from 'https'

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

function decodeISO88592(buf) {
  let s = ''
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i]
    s += b < 0x80 ? String.fromCharCode(b) : (ISO88592.get(b) ?? String.fromCharCode(b))
  }
  return s
}

function windDirLabel(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(Number(deg) / 45) % 8]
}

function fetchPage() {
  return new Promise((resolve, reject) => {
    const req = https.get(
      'https://www.traxelektronik.pl/pogoda/las/zbiorcza.php',
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; wsp-helper)' },
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => {
          const total = chunks.reduce((n, c) => n + c.length, 0)
          const out = new Uint8Array(total)
          let off = 0
          for (const c of chunks) { out.set(c, off); off += c.length }
          resolve(out)
        })
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
    process.exit(1)
  }

  const buf = await fetchPage()
  const html = decodeISO88592(buf)

  const rowMatch = html.match(
    /<tr><td class=r0><a href=stacja\.php\?idst=1946[^>]*>[^<]*<\/a><\/td>(.*?)<\/tr>/
  )
  if (!rowMatch) throw new Error('Rzepin LBL row not found in HTML')

  const cells = [...rowMatch[1].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(m => m[1].trim())
  const beforeRzepin = html.substring(0, html.indexOf('>Rzepin LBL<'))
  const threats = [...beforeRzepin.matchAll(/<td class=r2[^>]*><b>([^<]+)<\/b><\/td>/g)]
    .slice(-2)
    .map(m => m[1].trim())
  const ts = html.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/)?.[1] ?? null

  const data = {
    moisture:           cells[0] ?? null,
    temperature:        cells[1] ?? null,
    humidity:           cells[2] ?? null,
    precipitation:      cells[3] ?? null,
    windSpeed:          cells[4] ?? null,
    windDir:            cells[5] ? windDirLabel(cells[5]) : null,
    fireThreat:         threats[0] ?? null,
    fireThreatForecast: threats[1] ?? null,
    updatedAt:          ts,
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/weather_cache?id=eq.1`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ data, fetched_at: new Date().toISOString() }),
  })

  if (!res.ok) throw new Error(`Supabase PATCH failed: ${res.status} ${await res.text()}`)

  console.log('Cached:', JSON.stringify(data))
}

main().catch(err => { console.error(err); process.exit(1) })

// Shared fire-threat fetcher for traxelektronik.pl (Rzepin LBL station), used by:
//   - netlify/functions/weather-fetch.js (scheduled, primary)
//   - scripts/fetch-weather.mjs          (GitHub Actions, manual/backup)
// Not a Netlify function itself (lives in `_shared/`, no index.js).
import https from 'https'

const TRAX_URL = 'https://www.traxelektronik.pl/pogoda/las/zbiorcza.php'
const RZEPIN_ID = 1946

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

export function decodeISO88592(buf) {
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

// Raw page bytes. The site's TLS certificate is not always valid, hence
// rejectUnauthorized: false (read-only public data, nothing sensitive is sent).
export function fetchTraxPage(timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      TRAX_URL,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; wsp-helper)' }, rejectUnauthorized: false },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

// HTML (already decoded) → reading for the Rzepin LBL station.
export function parseTraxHtml(html) {
  const rowMatch = html.match(
    new RegExp(`<tr><td class=r0><a href=stacja\\.php\\?idst=${RZEPIN_ID}[^>]*>[^<]*<\\/a><\\/td>(.*?)<\\/tr>`),
  )
  if (!rowMatch) throw new Error('Rzepin LBL row not found in HTML')

  const cells = [...rowMatch[1].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(m => m[1].trim())
  // Zone threat (current + forecast) sits in the yellow header row just above the station
  const beforeRzepin = html.substring(0, html.indexOf('>Rzepin LBL<'))
  const threats = [...beforeRzepin.matchAll(/<td class=r2[^>]*><b>([^<]+)<\/b><\/td>/g)]
    .slice(-2)
    .map(m => m[1].trim())
  const ts = html.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/)?.[1] ?? null

  return {
    moisture:           cells[0] ?? null,
    temperature:        cells[1] ?? null,
    humidity:           cells[2] ?? null,
    precipitation:      cells[3] ?? null,
    windSpeed:          cells[4] ?? null,
    windDir:            cells[5] ? windDirLabel(cells[5]) : null,
    fireThreat:         threats[0] ?? null,
    fireThreatForecast: threats[1] ?? null,
    updatedAt:          ts, // 'YYYY-MM-DD HH:MM', Polish local time of the measurement
  }
}

export async function fetchTraxReading(timeoutMs) {
  return parseTraxHtml(decodeISO88592(await fetchTraxPage(timeoutMs)))
}

// Slot from the measurement time itself (source publishes ~09:00 and ~13:00),
// never from when the job happened to run — GitHub cron runs hours late.
export function slotForReading(reading) {
  const hour = Number(reading?.updatedAt?.slice(11, 13))
  if (!Number.isFinite(hour)) return null
  return hour < 12 ? 'morning' : 'afternoon'
}

// Current date/time in Europe/Warsaw, independent of the server TZ and ICU version.
export function warsawNow(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map(x => [x.type, x.value]),
  )
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) }
}

const isFromDay = (reading, date) => !!reading?.updatedAt?.startsWith(date)

// Which slot we are still waiting for today (null = nothing to do right now).
// Morning reading is expected from 09:00, afternoon from 13:00 (Warsaw time).
export function missingSlot(cacheData, now = new Date()) {
  const { date, minutes } = warsawNow(now)
  if (minutes >= 13 * 60 && !isFromDay(cacheData?.afternoon, date)) return 'afternoon'
  if (minutes >= 9 * 60 && !isFromDay(cacheData?.morning, date)) return 'morning'
  return null
}

// ── Supabase weather_cache (row id=1, column `data` = { morning, afternoon }) ──

export async function readCache(supabaseUrl, key) {
  const res = await fetch(`${supabaseUrl}/rest/v1/weather_cache?id=eq.1&select=data`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`weather_cache read failed: ${res.status}`)
  const data = (await res.json())?.[0]?.data
  // Only the nested { morning, afternoon } format is kept
  return data && ('morning' in data || 'afternoon' in data) ? data : {}
}

export async function writeSlot(supabaseUrl, key, existing, slot, reading) {
  const res = await fetch(`${supabaseUrl}/rest/v1/weather_cache?id=eq.1`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ data: { ...existing, [slot]: reading }, fetched_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(`weather_cache write failed: ${res.status} ${await res.text()}`)
}

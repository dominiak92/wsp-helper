/**
 * Backup / manual fetch of the Rzepin LBL fire-threat reading (traxelektronik.pl)
 * into Supabase `weather_cache` (id=1). Run by the GitHub Actions workflow
 * (.github/workflows/weather-cache.yml). The primary fetcher is the scheduled
 * Netlify function netlify/functions/weather-fetch.js — both share the parsing
 * and cache logic in netlify/functions/_shared/trax.js.
 *
 * The slot (morning/afternoon) is taken from the reading's own timestamp
 * (09:00 → morning, 13:00 → afternoon). The workflow's SLOT env var is ignored:
 * GitHub cron runs hours late, so a "morning" run used to store the 13:00 reading.
 *
 * Required env vars:
 *   SUPABASE_URL          – project URL (e.g. https://xxx.supabase.co)
 *   SUPABASE_SERVICE_KEY  – service_role key (bypasses RLS for the write)
 */

import {
  fetchTraxReading, slotForReading, warsawNow, readCache, writeSlot,
} from '../netlify/functions/_shared/trax.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

// traxelektronik.pl is occasionally slow/unreachable; retry with backoff
async function fetchWithRetry(attempts = 4) {
  let lastErr
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fetchTraxReading(25000)
    } catch (err) {
      lastErr = err
      console.warn(`fetch attempt ${i}/${attempts} failed: ${err.message}`)
      if (i < attempts) await sleep(i * 5000)
    }
  }
  throw lastErr
}

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
    process.exit(1)
  }

  const reading = await fetchWithRetry()
  const slot = slotForReading(reading)
  if (!slot) throw new Error(`Unparseable reading time: ${reading.updatedAt}`)
  if (process.env.SLOT && process.env.SLOT !== slot)
    console.log(`Workflow asked for ${process.env.SLOT}, but the source reading is ${reading.updatedAt} → ${slot}`)

  const { date } = warsawNow()
  if (!reading.updatedAt?.startsWith(date)) {
    console.log(`Source still shows ${reading.updatedAt} (not today, ${date}) — nothing written`)
    return
  }

  const existing = await readCache(SUPABASE_URL, SUPABASE_KEY)
  await writeSlot(SUPABASE_URL, SUPABASE_KEY, existing, slot, reading)
  console.log(`Cached [${slot}]:`, JSON.stringify(reading))
}

main().catch(err => { console.error(err); process.exit(1) })

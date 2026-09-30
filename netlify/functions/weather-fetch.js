// Scheduled (netlify.toml → [functions."weather-fetch"] schedule): keeps weather_cache
// fresh with the Rzepin LBL fire-threat readings from traxelektronik.pl.
// Runs every 30 min during the day but only hits the source while today's
// morning (≥ 09:00) or afternoon (≥ 13:00) reading is still missing.
// Replaces the GitHub Actions cron, which ran hours late and gets auto-disabled
// after 60 days without commits (scripts/fetch-weather.mjs stays as a manual backup).
import {
  fetchTraxReading, slotForReading, warsawNow, missingSlot, readCache, writeSlot,
} from './_shared/trax.js'

export const handler = async () => {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY // service_role — weather_cache is not writable with anon
  if (!url || !key) {
    console.error('[weather-fetch] Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_KEY')
    return { statusCode: 500, body: 'Missing env vars' }
  }

  try {
    const cache = await readCache(url, key)
    const wanted = missingSlot(cache)
    if (!wanted) {
      console.log('[weather-fetch] nothing missing right now — skip')
      return { statusCode: 200, body: 'skip' }
    }

    const reading = await fetchTraxReading(20000)
    const { date } = warsawNow()
    if (!reading.updatedAt?.startsWith(date)) {
      console.log(`[weather-fetch] waiting for ${wanted}: source still shows ${reading.updatedAt}`)
      return { statusCode: 200, body: 'source not updated yet' }
    }

    const slot = slotForReading(reading)
    if (!slot) throw new Error(`Unparseable reading time: ${reading.updatedAt}`)
    if (cache[slot]?.updatedAt === reading.updatedAt) {
      console.log(`[weather-fetch] ${slot} already has ${reading.updatedAt} — waiting for ${wanted}`)
      return { statusCode: 200, body: 'already cached' }
    }

    await writeSlot(url, key, cache, slot, reading)
    console.log(`[weather-fetch] cached [${slot}] ${reading.updatedAt}: ${reading.fireThreat}`)
    return { statusCode: 200, body: `cached ${slot}` }
  } catch (err) {
    // Next scheduled run (30 min) is the retry
    console.error('[weather-fetch] failed:', err)
    return { statusCode: 500, body: String(err?.message ?? err) }
  }
}

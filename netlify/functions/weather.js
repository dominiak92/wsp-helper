// Reads cached weather data from Supabase (written by GitHub Actions cron).
// Returns { morning: WeatherReading | null, afternoon: WeatherReading | null }
// Single row id=1 stores { morning: Reading, afternoon: Reading } in `data` column.

export const handler = async () => {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing Supabase config' }),
    }
  }

  try {
    const res = await fetch(
      `${url}/rest/v1/weather_cache?id=eq.1&select=data,fetched_at`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    )

    if (!res.ok) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Supabase ${res.status}` }),
      }
    }

    const rows = await res.json()
    const row = rows?.[0]
    const rowData = row?.data ?? null

    if (!rowData) {
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No data cached yet — workflow not run?' }),
      }
    }

    let morning   = rowData.morning   ?? null
    let afternoon = rowData.afternoon ?? null

    // Backward compat: old flat format has fireThreat at root with no morning/afternoon keys
    if (!morning && !afternoon && rowData.fireThreat !== undefined) {
      const srcHour = parseInt((rowData.updatedAt ?? '').split(' ')[1]?.split(':')[0] ?? '99')
      if (srcHour < 12) morning   = rowData
      else              afternoon = rowData
    }

    if (!morning && !afternoon) {
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No data cached yet — workflow not run?' }),
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        morning:   morning   ? { ...morning,   cachedAt: row.fetched_at } : null,
        afternoon: afternoon ? { ...afternoon, cachedAt: row.fetched_at } : null,
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

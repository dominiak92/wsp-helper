// Reads cached weather data from Supabase (written by GitHub Actions cron).
// Returns { morning: WeatherReading | null, afternoon: WeatherReading | null }
// id=1 → morning reading (~9:00), id=2 → afternoon reading (~13:00)

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
      `${url}/rest/v1/weather_cache?id=lte.2&select=id,data,fetched_at&order=id.asc`,
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
    const morning   = rows?.find(r => r.id === 1)
    const afternoon = rows?.find(r => r.id === 2)

    if (!morning?.data && !afternoon?.data) {
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
        morning:   morning?.data   ? { ...morning.data,   cachedAt: morning.fetched_at   } : null,
        afternoon: afternoon?.data ? { ...afternoon.data, cachedAt: afternoon.fetched_at } : null,
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

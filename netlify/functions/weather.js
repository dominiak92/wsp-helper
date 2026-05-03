// Reads cached weather data from Supabase (written by GitHub Actions cron).
// Env vars VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in Netlify.

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

    if (!row?.data) {
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
      body: JSON.stringify({ ...row.data, cachedAt: row.fetched_at }),
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

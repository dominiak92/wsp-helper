import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// Supabase resolves with `{ error }` instead of throwing. Wrap writes (and reads that
// feed a write) so failures surface in the UI instead of looking like success.
export function throwIfError<T extends { error: { message: string } | null }>(res: T, userMessage?: string): T {
  if (res.error) {
    console.error('[supabase]', res.error)
    throw new Error(userMessage ?? `Błąd zapisu: ${res.error.message}`)
  }
  return res
}

export const NETWORK_ERROR_MSG = 'Nie udało się zapisać — sprawdź połączenie i spróbuj ponownie.'

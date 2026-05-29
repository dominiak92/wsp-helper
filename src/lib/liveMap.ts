// Współdzielone, czasowe obiekty mapy: pulsujące punkty alarmowe (auto-wygasają
// po 2h) oraz udostępniane na żywo lokalizacje użytkowników (wygasają po 30 min).
// Odświeżane pollingiem co ~10 s w FireMapPage.

import { supabase } from './supabase'

export interface AlertPoint {
  id: string
  description: string
  lat: number
  lng: number
  createdBy: string | null
  expiresAt: string
}

export interface LiveLocation {
  userLogin: string
  displayName: string | null
  vehicle: string | null
  lat: number
  lng: number
  expiresAt: string
}

interface AlertRow {
  id: string
  description: string
  lat: number
  lng: number
  created_by: string | null
  expires_at: string
}

interface LiveRow {
  user_login: string
  display_name: string | null
  vehicle: string | null
  lat: number
  lng: number
  expires_at: string
}

const nowIso = () => new Date().toISOString()

// ── Punkty alarmowe ─────────────────────────────────────────────────────────

export async function fetchAlerts(): Promise<AlertPoint[]> {
  const { data, error } = await supabase
    .from('map_alerts')
    .select('id, description, lat, lng, created_by, expires_at')
    .gt('expires_at', nowIso())
  if (error) throw error
  return ((data ?? []) as AlertRow[]).map(r => ({
    id: r.id,
    description: r.description,
    lat: r.lat,
    lng: r.lng,
    createdBy: r.created_by,
    expiresAt: r.expires_at,
  }))
}

export async function createAlert(
  description: string,
  lat: number,
  lng: number,
  createdBy: string | null,
): Promise<AlertPoint> {
  const { data, error } = await supabase
    .from('map_alerts')
    .insert({ description, lat, lng, created_by: createdBy })
    .select('id, description, lat, lng, created_by, expires_at')
    .single()
  if (error) throw error
  const r = data as AlertRow
  return {
    id: r.id, description: r.description, lat: r.lat, lng: r.lng,
    createdBy: r.created_by, expiresAt: r.expires_at,
  }
}

export async function deleteAlert(id: string): Promise<void> {
  const { error } = await supabase.from('map_alerts').delete().eq('id', id)
  if (error) throw error
}

// ── Lokalizacje na żywo ─────────────────────────────────────────────────────

export async function fetchLiveLocations(): Promise<LiveLocation[]> {
  const { data, error } = await supabase
    .from('live_locations')
    .select('user_login, display_name, vehicle, lat, lng, expires_at')
    .gt('expires_at', nowIso())
  if (error) throw error
  return ((data ?? []) as LiveRow[]).map(r => ({
    userLogin: r.user_login,
    displayName: r.display_name,
    vehicle: r.vehicle,
    lat: r.lat,
    lng: r.lng,
    expiresAt: r.expires_at,
  }))
}

export async function upsertLiveLocation(
  userLogin: string,
  displayName: string | null,
  vehicle: string | null,
  lat: number,
  lng: number,
  expiresAt: string,
): Promise<void> {
  const { error } = await supabase.from('live_locations').upsert({
    user_login: userLogin,
    display_name: displayName,
    vehicle,
    lat,
    lng,
    expires_at: expiresAt,
    updated_at: nowIso(),
  })
  if (error) throw error
}

export async function removeLiveLocation(userLogin: string): Promise<void> {
  const { error } = await supabase.from('live_locations').delete().eq('user_login', userLogin)
  if (error) throw error
}

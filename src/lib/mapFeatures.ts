// Warstwa danych dla obiektów mapy ppoż. nanoszonych z mapy fizycznej:
// punkty czerpania wody (wiaderka), drogi pożarowe, sąsiednie jednostki i inne
// ważne punkty. Współrzędne ze zdjęcia papierowej mapy są PRZYBLIŻONE
// (confirmed === false) i poprawiane ręcznie w trybie edycji na mapie.

import { supabase } from './supabase'

export type FeatureKind = 'water' | 'unit' | 'poi' | 'road'

export interface PointGeometry {
  type: 'point'
  lat: number
  lng: number
}

export interface LineGeometry {
  type: 'line'
  points: [number, number][] // [lat, lng]
}

export type FeatureGeometry = PointGeometry | LineGeometry

export interface MapFeature {
  id: string
  kind: FeatureKind
  label: string
  description: string | null
  geometry: FeatureGeometry
  confirmed: boolean
}

interface MapFeatureRow {
  id: string
  kind: FeatureKind
  label: string
  description: string | null
  geometry: FeatureGeometry
  confirmed: boolean
}

// ── Metadane typów (kolor + emoji jak na mapie papierowej) ──────────────────

export const KIND_META: Record<
  FeatureKind,
  { label: string; emoji: string; color: string; isLine: boolean }
> = {
  water: { label: 'Punkt czerpania wody', emoji: '🪣', color: '#38bdf8', isLine: false },
  unit:  { label: 'Jednostka',            emoji: '🚒', color: '#ef4444', isLine: false },
  poi:   { label: 'Ważny punkt',          emoji: '📍', color: '#f59e0b', isLine: false },
  road:  { label: 'Droga pożarowa',       emoji: '🛤️', color: '#f97316', isLine: true },
}

export const POINT_KINDS: FeatureKind[] = ['water', 'unit', 'poi']

// ── CRUD ────────────────────────────────────────────────────────────────────

function rowToFeature(r: MapFeatureRow): MapFeature {
  return {
    id: r.id,
    kind: r.kind,
    label: r.label,
    description: r.description,
    geometry: r.geometry,
    confirmed: r.confirmed,
  }
}

export async function fetchFeatures(): Promise<MapFeature[]> {
  const { data, error } = await supabase
    .from('map_features')
    .select('id, kind, label, description, geometry, confirmed')
  if (error) throw error
  return (data ?? []).map(rowToFeature as (r: unknown) => MapFeature)
}

export async function createFeature(f: Omit<MapFeature, 'id'>): Promise<MapFeature> {
  const { data, error } = await supabase
    .from('map_features')
    .insert({
      kind: f.kind,
      label: f.label,
      description: f.description,
      geometry: f.geometry,
      confirmed: f.confirmed,
    })
    .select('id, kind, label, description, geometry, confirmed')
    .single()
  if (error) throw error
  return rowToFeature(data as MapFeatureRow)
}

export async function updateFeature(
  id: string,
  patch: Partial<Omit<MapFeature, 'id'>>,
): Promise<void> {
  const { error } = await supabase.from('map_features').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteFeature(id: string): Promise<void> {
  const { error } = await supabase.from('map_features').delete().eq('id', id)
  if (error) throw error
}

// Jednorazowy import danych startowych — tylko jeśli tabela jest pusta.
export async function seedFeatures(): Promise<MapFeature[]> {
  const existing = await fetchFeatures()
  if (existing.length > 0) return existing
  const { data, error } = await supabase
    .from('map_features')
    .insert(SEED_FEATURES.map(f => ({
      kind: f.kind,
      label: f.label,
      description: f.description,
      geometry: f.geometry,
      confirmed: f.confirmed,
    })))
    .select('id, kind, label, description, geometry, confirmed')
  if (error) throw error
  return (data ?? []).map(rowToFeature as (r: unknown) => MapFeature)
}

// ── Dane startowe (PRZYBLIŻONE) ─────────────────────────────────────────────
// Odczytane ze zdjęcia mapy papierowej. Pozycje są orientacyjne — w trybie
// edycji należy je dociągnąć (confirmed staje się true po przesunięciu/zapisie).

const seed = (
  kind: FeatureKind,
  label: string,
  lat: number,
  lng: number,
  description: string | null = null,
): Omit<MapFeature, 'id'> => ({
  kind,
  label,
  description,
  confirmed: false,
  geometry: { type: 'point', lat, lng },
})

export const SEED_FEATURES: Omit<MapFeature, 'id'>[] = [
  // ── Sąsiednie jednostki (z ramek na mapie) ──
  seed('unit', 'SM Wędrzyn', 52.4660, 15.1570, 'GBA 2,5/20'),
  seed('unit', 'OSP Trzemeszno', 52.4890, 15.2060, 'GBM 2,5/8 · GBA 1,6/24'),
  seed('unit', 'OSP Jemiołów', 52.2930, 15.2720, 'GLM 8 · GBA 2,5/16 · GCBA 5/24'),

  // ── Punkty czerpania wody (wiaderka) ──
  seed('water', 'J. Rakowe', 52.3870, 15.0700, 'Punkt czerpania wody'),
  seed('water', 'J. z wyspą', 52.3550, 15.0850, 'Punkt czerpania wody'),
  seed('water', 'Jezioro Kopaniec', 52.3020, 15.1050, 'Punkt czerpania wody'),
  seed('water', 'Lipa', 52.3920, 15.1850, 'Punkt czerpania wody'),
  seed('water', 'Postomia', 52.4350, 15.0950, 'Punkt czerpania wody'),
  seed('water', 'Buszenko', 52.3680, 15.3050, 'Punkt czerpania wody'),
  seed('water', 'Trzebów', 52.3700, 15.2050, 'Punkt czerpania wody'),
  seed('water', 'Walewice', 52.2950, 15.1300, 'Punkt czerpania wody'),
]

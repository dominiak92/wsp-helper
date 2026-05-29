import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Search, X, AlertCircle, Loader2, LocateFixed, Milestone,
  Pencil, Check, Trash2, Plus, Layers, Undo2, AlertTriangle, SatelliteDish,
  Globe2, Map as MapIcon,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useAuth } from '../lib/auth'
import {
  fetchFeatures, createFeature, updateFeature, deleteFeature, seedFeatures,
  KIND_META,
  type MapFeature, type FeatureKind, type FeatureGeometry, type PointGeometry,
} from '../lib/mapFeatures'
import {
  fetchAlerts, createAlert, deleteAlert, fetchLiveLocations,
  upsertLiveLocation, removeLiveLocation,
  type AlertPoint, type LiveLocation,
} from '../lib/liveMap'
import { supabase } from '../lib/supabase'
import { CREW_VEHICLE_NAMES, findPersonVehicleId, parseShiftAssignment } from '../lib/crew'
import { currentOrNextDutyDate } from '../lib/duty'

const SHARE_MS = 30 * 60 * 1000
const SHARE_KEY = 'wsp-share-until'

// ── Constants ─────────────────────────────────────────────────────────────────

const MAP_CENTER: [number, number] = [52.420, 15.210]
const MAP_ZOOM = 12
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving'

const COUNTY = { south: 52.15, north: 52.62, west: 14.85, east: 15.50 }
const OSPWL  = { south: 52.27558, north: 52.48582, west: 14.98, east: 15.52 }
const STATION = L.latLng(52.43626, 15.18625)
const NOMINATIM_VIEWBOX = `${COUNTY.west},${COUNTY.north},${COUNTY.east},${COUNTY.south}`

// ── Types ─────────────────────────────────────────────────────────────────────

interface OsmWay {
  type: 'way'
  id: number
  tags?: Record<string, string>
  geometry: { lat: number; lon: number }[]
}

interface NominatimPlace {
  display_name: string
  lat: string
  lon: string
}

declare global {
  interface Window {
    __wspNavigateTo?: (lat: number, lng: number, name: string, sm: 'gps' | 'station') => void
    __wspClosePopup?: () => void
    __wspDeleteAlert?: (id: string) => void
  }
}

type SearchState = 'idle' | 'loading' | 'notfound' | 'error'

// ── API helpers ───────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildRoadRegex(q: string): string {
  const e = escapeRegex(q)
  const pre = /^[0-9]/.test(q) ? '(^|[^0-9])' : ''
  const suf = /[0-9]$/.test(q) ? '([^0-9]|$)' : ''
  return `${pre}${e}${suf}`
}

async function overpassFetch(ql: string): Promise<OsmWay[]> {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(ql)}`,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return (json.elements ?? []).filter((e: { type: string }) => e.type === 'way') as OsmWay[]
}

async function geocode(q: string): Promise<NominatimPlace[]> {
  const params = new URLSearchParams({
    q, format: 'json', limit: '5', 'accept-language': 'pl',
    viewbox: NOMINATIM_VIEWBOX, bounded: '1',
  })
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'User-Agent': 'WSP-Helper/1.0' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const TYPE_PL: Record<string, string> = {
  lake: 'Jezioro', river: 'Rzeka', stream: 'Strumień', pond: 'Staw', reservoir: 'Zbiornik wodny',
  forest: 'Las', wood: 'Las', scrub: 'Zarośla', heath: 'Wrzosowisko', meadow: 'Łąka',
  farmland: 'Pole uprawne', grass: 'Trawnik',
  track: 'Droga leśna', path: 'Ścieżka', road: 'Droga',
  military: 'Teren wojskowy', building: 'Budynek', house: 'Dom',
  residential: 'Obszar zabudowany', village: 'Wieś', hamlet: 'Przysiółek',
}

async function reverseGeocode(latlng: L.LatLng): Promise<{ name: string; subtitle: string }> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${latlng.lat.toFixed(6)}&lon=${latlng.lng.toFixed(6)}&format=json&accept-language=pl`,
    { headers: { 'User-Agent': 'WSP-Helper/1.0' } },
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const d = await res.json()
  const name =
    d.name ||
    d.address?.road ||
    d.address?.hamlet ||
    d.address?.village ||
    d.address?.town ||
    'Nieznane miejsce'
  const typePl = TYPE_PL[d.type] || TYPE_PL[d.class] || ''
  const place = [d.address?.village, d.address?.town, d.address?.city].find(Boolean) || ''
  const subtitle = [typePl, place].filter(Boolean).join(' · ')
  return { name, subtitle }
}

// Najbliższa miejscowość (punkt orientacyjny) dla danego punktu
async function nearestLocality(latlng: L.LatLng): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latlng.lat.toFixed(6)}&lon=${latlng.lng.toFixed(6)}&format=json&accept-language=pl&zoom=12`,
      { headers: { 'User-Agent': 'WSP-Helper/1.0' } },
    )
    if (!res.ok) return ''
    const d = await res.json()
    return d.address?.village || d.address?.hamlet || d.address?.town
      || d.address?.city || d.address?.municipality || d.name || ''
  } catch {
    return ''
  }
}

function ringsCentroid(rings: L.LatLng[][]): L.LatLng {
  let lat = 0, lng = 0, n = 0
  rings.forEach(r => r.forEach(p => { lat += p.lat; lng += p.lng; n++ }))
  return n ? L.latLng(lat / n, lng / n) : L.latLng(0, 0)
}

async function fetchRoute(from: L.LatLng, to: L.LatLng): Promise<L.LatLng[]> {
  const url =
    `${OSRM_URL}/${from.lng.toFixed(6)},${from.lat.toFixed(6)};` +
    `${to.lng.toFixed(6)},${to.lat.toFixed(6)}?geometries=geojson&overview=full`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (json.code !== 'Ok') throw new Error('Nie znaleziono trasy')
  return (json.routes[0].geometry.coordinates as [number, number][]).map(
    ([lon, lat]) => L.latLng(lat, lon),
  )
}

// ── Map-feature helpers ─────────────────────────────────────────────────────

function makeFeatureIcon(kind: FeatureKind, confirmed: boolean): L.DivIcon {
  const meta = KIND_META[kind]
  const ring = confirmed ? meta.color : '#f59e0b'
  const dash = confirmed ? '' : 'border-style:dashed;'
  const op = confirmed ? '1' : '0.72'
  return L.divIcon({
    className: '',
    html:
      `<div style="opacity:${op};width:30px;height:30px;display:flex;align-items:center;` +
      `justify-content:center;background:rgba(8,15,30,0.88);border:2px solid ${ring};${dash}` +
      `border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.5);font-size:15px;line-height:1">${meta.emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  })
}

function featurePopupHtml(f: MapFeature, lat: number, lng: number): string {
  const safeName = encodeURIComponent(f.label)
  const desc = f.description
    ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">${f.description}</div>`
    : ''
  const warn = f.confirmed
    ? ''
    : `<div style="font-size:10px;color:#fbbf24;margin-top:4px">⚠ pozycja przybliżona</div>`
  return [
    '<div style="font-family:sans-serif;min-width:180px">',
    `<div style="font-size:13px;font-weight:600;color:#f1f5f9;line-height:1.35">${KIND_META[f.kind].emoji} ${f.label}</div>`,
    desc, warn,
    '<div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(100,116,139,0.2)">',
    `<button onclick="window.__wspNavigateTo(${lat},${lng},decodeURIComponent('${safeName}'),'gps')" ` +
      'style="width:100%;padding:6px 10px;border-radius:12px;border:none;font-size:11px;font-family:sans-serif;' +
      'font-weight:500;cursor:pointer;text-align:left;background:rgba(59,130,246,0.2);color:#93c5fd">' +
      'Nawiguj z mojej pozycji</button>',
    '</div></div>',
  ].join('')
}

function alertPopupHtml(a: AlertPoint): string {
  const safe = encodeURIComponent(a.description)
  const exp = new Date(a.expiresAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
  const meta = `wygasa o ${exp}${a.createdBy ? ' · ' + a.createdBy : ''}`
  const btn = (onclick: string, label: string, bg: string, color: string) =>
    `<button onclick="${onclick}" style="width:100%;padding:6px 10px;border-radius:12px;border:none;` +
    `font-size:11px;font-family:sans-serif;font-weight:500;cursor:pointer;text-align:left;` +
    `background:${bg};color:${color}">${label}</button>`
  return [
    '<div style="font-family:sans-serif;min-width:190px">',
    `<div style="font-size:13px;font-weight:600;color:#f1f5f9;line-height:1.35">${a.description}</div>`,
    `<div style="font-size:10px;color:#64748b;margin-top:3px">${meta}</div>`,
    '<div style="display:flex;flex-direction:column;gap:5px;margin-top:10px;padding-top:8px;border-top:1px solid rgba(100,116,139,0.2)">',
    btn(`window.__wspNavigateTo(${a.lat},${a.lng},decodeURIComponent('${safe}'),'gps')`,
      'Nawiguj z mojej pozycji', 'rgba(59,130,246,0.2)', '#93c5fd'),
    btn(`window.__wspDeleteAlert('${a.id}')`, 'Usuń punkt', 'rgba(239,68,68,0.18)', '#fca5a5'),
    '</div></div>',
  ].join('')
}

// ── Component ─────────────────────────────────────────────────────────────────

interface EditDraft {
  id?: string
  kind: FeatureKind
  label: string
  description: string
  geometry: FeatureGeometry
}

interface CompartmentCandidate {
  label: string
  range: string
  rings: L.LatLng[][]
  centroid: L.LatLng
  hint: string   // najbliższa miejscowość (punkt orientacyjny)
  distKm: number // odległość od strażnicy
}

export function FireMapPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const baseLayerRef = useRef<L.TileLayer | null>(null)
  const labelsLayerRef = useRef<L.LayerGroup | null>(null)
  const gpsDotRef = useRef<L.CircleMarker | null>(null)
  const gpsCircleRef = useRef<L.Circle | null>(null)
  const roadLayersRef = useRef<L.Layer[]>([])
  const routeLayerRef = useRef<L.Polyline | null>(null)
  const destMarkerRef = useRef<L.Marker | null>(null)
  const userPosRef = useRef<L.LatLng | null>(null)
  const gridLayersRef = useRef<L.Layer[]>([])
  const featureLayerRef = useRef<L.LayerGroup | null>(null)
  const draftLayerRef = useRef<L.LayerGroup | null>(null)
  const editModeRef = useRef(false)
  const addKindRef = useRef<FeatureKind | null>(null)
  const drawingRoadRef = useRef<[number, number][]>([])
  const alertLayerRef = useRef<L.LayerGroup | null>(null)
  const liveLayerRef = useRef<L.LayerGroup | null>(null)
  const alertDraftLayerRef = useRef<L.LayerGroup | null>(null)
  const placingAlertRef = useRef(false)
  const sharingUntilRef = useRef<number | null>(null)

  const [showGrid, setShowGrid] = useState(true)
  const [baseMap, setBaseMap] = useState<'map' | 'sat'>('map')

  // Obiekty mapy ppoż.
  const [features, setFeatures] = useState<MapFeature[]>([])
  const [visibleKinds, setVisibleKinds] = useState<Record<FeatureKind, boolean>>({
    water: true, unit: true, poi: true, road: true,
  })
  const [filterOpen, setFilterOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [addKind, setAddKind] = useState<FeatureKind | null>(null)
  const [editing, setEditing] = useState<EditDraft | null>(null)
  const [drawingRoad, setDrawingRoad] = useState<[number, number][]>([])
  const [featuresBusy, setFeaturesBusy] = useState(false)
  const [featuresError, setFeaturesError] = useState('')
  const [gridLoading, setGridLoading] = useState(false)
  const [gpsToast, setGpsToast] = useState(false)
  const [shareToast, setShareToast] = useState(false)
  const [baseToast, setBaseToast] = useState(false)
  const [userPos, setUserPos] = useState<L.LatLng | null>(null)

  const [query, setQuery] = useState('')
  const [searchState, setSearchState] = useState<SearchState>('idle')
  const [searchError, setSearchError] = useState('')
  const [compartmentChoices, setCompartmentChoices] = useState<CompartmentCandidate[] | null>(null)
  const startModeRef = useRef<'gps' | 'station'>('gps')
  const [following, setFollowing] = useState(false)
  const followingRef = useRef(false)

  // Współdzielone: alarmy + lokalizacje na żywo
  const [alerts, setAlerts] = useState<AlertPoint[]>([])
  const [liveLocations, setLiveLocations] = useState<LiveLocation[]>([])
  const [placingAlert, setPlacingAlert] = useState(false)
  const [alertDraft, setAlertDraft] = useState<{ lat: number; lng: number; description: string } | null>(null)
  const [alertBusy, setAlertBusy] = useState(false)
  const [sharingUntil, setSharingUntil] = useState<number | null>(null)
  const [shareRemainingMin, setShareRemainingMin] = useState<number | null>(null)
  const [myVehicle, setMyVehicle] = useState<string | null>(null)
  const myVehicleRef = useRef<string | null>(null)

  const myLogin = user?.login ?? null
  const myName = user?.displayName ?? user?.login ?? null
  const isSharing = sharingUntil !== null

  useEffect(() => { userPosRef.current = userPos }, [userPos])
  useEffect(() => { followingRef.current = following }, [following])
  useEffect(() => { editModeRef.current = editMode }, [editMode])
  useEffect(() => { addKindRef.current = addKind }, [addKind])
  useEffect(() => { drawingRoadRef.current = drawingRoad }, [drawingRoad])
  useEffect(() => { placingAlertRef.current = placingAlert }, [placingAlert])
  useEffect(() => { sharingUntilRef.current = sharingUntil }, [sharingUntil])

  // Wczytaj obiekty mapy z Supabase
  useEffect(() => {
    fetchFeatures()
      .then(setFeatures)
      .catch(err => setFeaturesError(err instanceof Error ? err.message : 'Błąd wczytywania obiektów'))
  }, [])

  // Polling: alarmy + lokalizacje na żywo (co 10 s)
  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const [a, l] = await Promise.all([fetchAlerts(), fetchLiveLocations()])
        if (active) { setAlerts(a); setLiveLocations(l) }
      } catch { /* sieć — spróbuj ponownie przy kolejnym ticku */ }
    }
    poll()
    const id = setInterval(poll, 10000)
    return () => { active = false; clearInterval(id) }
  }, [])

  // Wznów udostępnianie lokalizacji po przeładowaniu (jeśli jeszcze trwa)
  useEffect(() => {
    const saved = Number(localStorage.getItem(SHARE_KEY) || 0)
    if (saved > Date.now()) setSharingUntil(saved)
    else localStorage.removeItem(SHARE_KEY)
  }, [])

  useEffect(() => { myVehicleRef.current = myVehicle }, [myVehicle])

  // Ustal pojazd zalogowanego użytkownika z aktualnej/najbliższej obsady
  useEffect(() => {
    if (!myLogin) return
    const dutyDate = currentOrNextDutyDate()
    Promise.all([
      supabase.from('personnel').select('id, login'),
      supabase.from('duty_assignments').select('assignment_json')
        .eq('duty_date', dutyDate).order('created_at', { ascending: false }).limit(1),
    ]).then(([{ data: pData }, { data: aData }]) => {
      const person = (pData ?? []).find(r => r.login === myLogin)
      const assignment = parseShiftAssignment(aData?.[0]?.assignment_json)
      if (person && assignment) {
        const vid = findPersonVehicleId(assignment, person.id)
        setMyVehicle(vid ? CREW_VEHICLE_NAMES[vid] : null)
      }
    }).catch(() => { /* ignore */ })
  }, [myLogin])

  const startShare = useCallback(() => {
    if (!myLogin) return
    const until = Date.now() + SHARE_MS
    localStorage.setItem(SHARE_KEY, String(until))
    setSharingUntil(until)
    setShareRemainingMin(30)
  }, [myLogin])

  const stopShare = useCallback(async () => {
    localStorage.removeItem(SHARE_KEY)
    setSharingUntil(null)
    setShareRemainingMin(null)
    if (myLogin) { try { await removeLiveLocation(myLogin) } catch { /* ignore */ } }
  }, [myLogin])

  // Gdy udostępnianie aktywne: wysyłaj pozycję co 10 s i odliczaj do końca
  useEffect(() => {
    if (sharingUntil === null || !myLogin) return
    const tick = async () => {
      const until = sharingUntilRef.current
      if (until === null || Date.now() > until) { stopShare(); return }
      setShareRemainingMin(Math.max(0, Math.ceil((until - Date.now()) / 60000)))
      const pos = userPosRef.current
      if (pos) {
        try {
          await upsertLiveLocation(myLogin, myName, myVehicleRef.current, pos.lat, pos.lng, new Date(until).toISOString())
        } catch { /* ignore */ }
      }
    }
    tick()
    const id = setInterval(tick, 10000)
    return () => clearInterval(id)
  }, [sharingUntil, myLogin, myName, stopShare])

  // ── Map init ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      zoomControl: false,
      attributionControl: false,
    })

    map.fitBounds([[52.20, OSPWL.west], [OSPWL.north, OSPWL.east]], { padding: [20, 20] })

    featureLayerRef.current = L.layerGroup().addTo(map)
    draftLayerRef.current = L.layerGroup().addTo(map)
    liveLayerRef.current = L.layerGroup().addTo(map)
    alertLayerRef.current = L.layerGroup().addTo(map)
    alertDraftLayerRef.current = L.layerGroup().addTo(map)

    map.on('dragstart', () => {
      if (followingRef.current) {
        followingRef.current = false
        setFollowing(false)
      }
    })

    // Dark-themed popup styles
    const style = document.createElement('style')
    style.textContent = [
      '.wsp-popup .leaflet-popup-content-wrapper{',
        'background:#0f1117;border:1px solid #1c2230;',
        'border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.7)}',
      '.wsp-popup .leaflet-popup-tip{background:#0f1117;border:1px solid #1c2230}',
      '.wsp-popup .leaflet-popup-content{margin:10px 14px}',
      '.wsp-popup .leaflet-popup-close-button{display:none!important}',
      '.forest-label{background:transparent!important;border:none!important;box-shadow:none!important;',
        'font-size:9px;font-weight:700;color:#4ade80;',
        'text-shadow:0 0 3px #000,0 0 2px #000;white-space:nowrap}',
      '.feature-label{background:#0f1117!important;border:1px solid #1c2230!important;box-shadow:0 1px 4px rgba(0,0,0,0.5)!important;',
        'color:#e2e8f0;font-size:10px;font-weight:600;padding:1px 6px;border-radius:6px;white-space:nowrap}',
      '.feature-label.leaflet-tooltip-right::before,.feature-label.leaflet-tooltip-left::before,',
      '.feature-label::before{display:none!important}',
      '@keyframes wsp-pulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,.55)}',
        '70%{box-shadow:0 0 0 16px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}',
      '.wsp-alert-dot{animation:wsp-pulse 1.5s infinite}',
      '@keyframes wsp-pulse-blue{0%{box-shadow:0 0 0 0 rgba(59,130,246,.5)}',
        '70%{box-shadow:0 0 0 12px rgba(59,130,246,0)}100%{box-shadow:0 0 0 0 rgba(59,130,246,0)}}',
      '.wsp-live-dot{animation:wsp-pulse-blue 2s infinite}',
    ].join('')
    document.head.appendChild(style)

    map.on('click', async (e) => {
      // Stawianie punktu alarmowego (dla każdego) — ma priorytet
      if (placingAlertRef.current) {
        setAlertDraft({ lat: e.latlng.lat, lng: e.latlng.lng, description: '' })
        setPlacingAlert(false)
        placingAlertRef.current = false
        return
      }

      // Tryb edycji: klik = dodanie obiektu / wierzchołka drogi
      if (editModeRef.current) {
        const k = addKindRef.current
        if (!k) return
        if (k === 'road') {
          const next: [number, number][] = [...drawingRoadRef.current, [e.latlng.lat, e.latlng.lng]]
          drawingRoadRef.current = next
          setDrawingRoad(next)
          return
        }
        setEditing({
          kind: k,
          label: '',
          description: '',
          geometry: { type: 'point', lat: e.latlng.lat, lng: e.latlng.lng },
        })
        return
      }

      const popup = L.popup({ className: 'wsp-popup', maxWidth: 260, closeButton: true })
        .setLatLng(e.latlng)
        .setContent('<div style="font-family:sans-serif;font-size:12px;color:#94a3b8;padding:2px 0">Ładowanie…</div>')
        .openOn(map)
      try {
        const { name, subtitle } = await reverseGeocode(e.latlng)
        const lat = e.latlng.lat.toFixed(6)
        const lng = e.latlng.lng.toFixed(6)
        const coords = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`
        const safeName = encodeURIComponent(name)
        const btn = (sm: string, label: string, bg: string, color: string) =>
          `<button onclick="window.__wspNavigateTo(${lat},${lng},decodeURIComponent('${safeName}'),'${sm}')" ` +
          `style="width:100%;padding:6px 10px;border-radius:12px;border:none;font-size:11px;` +
          `font-family:sans-serif;font-weight:500;cursor:pointer;text-align:left;` +
          `background:${bg};color:${color}">${label}</button>`
        popup.setContent([
          '<div style="font-family:sans-serif;min-width:190px">',
          // header row with close button
          '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">',
          '<div>',
          `<div style="font-size:13px;font-weight:600;color:#f1f5f9;line-height:1.35">${name}</div>`,
          subtitle ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">${subtitle}</div>` : '',
          `<div style="font-size:10px;color:#475569;margin-top:4px;font-variant-numeric:tabular-nums">${coords}</div>`,
          '</div>',
          '<button onclick="window.__wspClosePopup?.()" style="flex-shrink:0;margin-top:-2px;width:22px;height:22px;background:rgba(255,255,255,0.12);border:none;border-radius:50%;color:#cbd5e1;font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center">×</button>',
          '</div>',
          // nav buttons
          '<div style="display:flex;flex-direction:column;gap:5px;margin-top:10px;padding-top:8px;border-top:1px solid rgba(100,116,139,0.2)">',
          btn('gps', 'Nawiguj z mojej pozycji', 'rgba(59,130,246,0.2)', '#93c5fd'),
          btn('station', 'Nawiguj ze strażnicy', 'rgba(100,116,139,0.15)', '#94a3b8'),
          '</div>',
          '</div>',
        ].join(''))
      } catch {
        popup.setContent('<div style="font-family:sans-serif;font-size:12px;color:#f87171">Błąd pobierania danych</div>')
      }
    })

    function onLocationFound(e: L.LocationEvent) {
      gpsDotRef.current?.remove()
      gpsCircleRef.current?.remove()
      gpsDotRef.current = L.circleMarker(e.latlng, {
        radius: 8, fillColor: '#3b82f6', color: '#fff', weight: 2.5, opacity: 1, fillOpacity: 1,
      }).addTo(map)
      if (e.accuracy > 0) {
        gpsCircleRef.current = L.circle(e.latlng, {
          radius: e.accuracy, fillColor: '#3b82f6', fillOpacity: 0.1, color: '#3b82f6', weight: 1,
        }).addTo(map)
      }
      setUserPos(e.latlng)
      if (followingRef.current) map.setView(e.latlng, map.getZoom())
    }

    map.on('locationfound', onLocationFound)
    map.locate({ watch: true, enableHighAccuracy: true })
    mapRef.current = map

    return () => {
      map.off('locationfound', onLocationFound)
      map.stopLocate()
      map.remove()
      mapRef.current = null
      baseLayerRef.current = null
      labelsLayerRef.current = null
      featureLayerRef.current = null
      draftLayerRef.current = null
      liveLayerRef.current = null
      alertLayerRef.current = null
      alertDraftLayerRef.current = null
      style.remove()
    }
  }, [])

  // ── Podkład: mapa (OSM) / ortofotomapa GUGiK + etykiety (hybryda) ───────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (baseLayerRef.current) { map.removeLayer(baseLayerRef.current); baseLayerRef.current = null }
    if (labelsLayerRef.current) { map.removeLayer(labelsLayerRef.current); labelsLayerRef.current = null }

    const base = baseMap === 'sat'
      ? L.tileLayer(
          'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/StandardResolution' +
          '?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTOFOTOMAPA&STYLE=default' +
          '&FORMAT=image/jpeg&TILEMATRIXSET=EPSG:3857&TILEMATRIX=EPSG:3857:{z}&TILEROW={y}&TILECOL={x}',
          { maxZoom: 19, attribution: '© GUGiK — ortofotomapa' },
        )
      : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 })
    base.addTo(map)
    base.setZIndex(100)
    baseLayerRef.current = base

    // Hybryda: na ortofoto dołóż przezroczyste drogi (Esri) + nazwy (CARTO/OSM)
    if (baseMap === 'sat') {
      const roads = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Esri' },
      )
      const labels = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
        { maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap, © CARTO' },
      )
      const group = L.layerGroup([roads, labels]).addTo(map)
      roads.setZIndex(200)
      labels.setZIndex(210)
      labelsLayerRef.current = group
    }
  }, [baseMap])

  // ── Helpers ───────────────────────────────────────────────────────────────

  function clearRoads() {
    const map = mapRef.current
    if (!map) return
    roadLayersRef.current.forEach(l => map.removeLayer(l))
    roadLayersRef.current = []
  }

  function clearRoute() {
    const map = mapRef.current
    if (!map) return
    routeLayerRef.current?.remove()
    routeLayerRef.current = null
    destMarkerRef.current?.remove()
    destMarkerRef.current = null
  }

  // ── Map features: render + CRUD ─────────────────────────────────────────────

  const renderFeatures = useCallback(() => {
    const group = featureLayerRef.current
    if (!group) return
    group.clearLayers()

    features.forEach(f => {
      if (!visibleKinds[f.kind]) return
      if (f.geometry.type === 'point') {
        const { lat, lng } = f.geometry
        const marker = L.marker([lat, lng], {
          icon: makeFeatureIcon(f.kind, f.confirmed),
          draggable: editMode,
        })
        marker.bindTooltip(f.label, {
          permanent: true, direction: 'right', offset: [14, 0], className: 'feature-label',
        })
        if (editMode) {
          marker.on('click', () => setEditing({
            id: f.id, kind: f.kind, label: f.label,
            description: f.description ?? '', geometry: f.geometry,
          }))
          marker.on('dragend', async () => {
            const ll = marker.getLatLng()
            const geometry: PointGeometry = { type: 'point', lat: ll.lat, lng: ll.lng }
            try {
              await updateFeature(f.id, { geometry, confirmed: true })
              setFeatures(prev => prev.map(x => x.id === f.id ? { ...x, geometry, confirmed: true } : x))
            } catch (err) {
              setFeaturesError(err instanceof Error ? err.message : 'Błąd zapisu')
            }
          })
        } else {
          marker.bindPopup(featurePopupHtml(f, lat, lng), { className: 'wsp-popup', maxWidth: 240 })
        }
        group.addLayer(marker)
      } else {
        const pts = f.geometry.points.map(([la, ln]) => L.latLng(la, ln))
        if (pts.length < 2) return
        const line = L.polyline(pts, {
          color: f.confirmed ? KIND_META.road.color : '#f59e0b',
          weight: 5, opacity: 0.9,
          dashArray: f.confirmed ? undefined : '8 6',
        })
        line.bindTooltip(f.label, { permanent: true, direction: 'center', className: 'feature-label' })
        if (editMode) {
          line.on('click', () => setEditing({
            id: f.id, kind: f.kind, label: f.label,
            description: f.description ?? '', geometry: f.geometry,
          }))
        } else {
          line.bindPopup(`<strong style="font-size:13px">${KIND_META.road.emoji} ${f.label}</strong>`, { maxWidth: 220 })
        }
        group.addLayer(line)
      }
    })
  }, [features, editMode, visibleKinds])

  useEffect(() => { renderFeatures() }, [renderFeatures])

  // Podgląd: edytowany obiekt (przeciągalny) lub rysowana droga
  useEffect(() => {
    const group = draftLayerRef.current
    if (!group) return
    group.clearLayers()

    if (editing) {
      if (editing.geometry.type === 'point') {
        const { lat, lng } = editing.geometry
        const m = L.marker([lat, lng], {
          icon: makeFeatureIcon(editing.kind, false), draggable: true, zIndexOffset: 1000,
        })
        m.on('dragend', () => {
          const ll = m.getLatLng()
          setEditing(prev => prev ? { ...prev, geometry: { type: 'point', lat: ll.lat, lng: ll.lng } } : prev)
        })
        group.addLayer(m)
      } else if (editing.geometry.points.length >= 2) {
        group.addLayer(L.polyline(
          editing.geometry.points.map(([la, ln]) => L.latLng(la, ln)),
          { color: '#f59e0b', weight: 5, dashArray: '8 6' },
        ))
      }
      return
    }

    if (drawingRoad.length > 0) {
      drawingRoad.forEach(([la, ln]) => group.addLayer(
        L.circleMarker([la, ln], { radius: 4, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 1, weight: 1 }),
      ))
      if (drawingRoad.length >= 2) {
        group.addLayer(L.polyline(
          drawingRoad.map(([la, ln]) => L.latLng(la, ln)),
          { color: '#f59e0b', weight: 5, dashArray: '8 6' },
        ))
      }
    }
  }, [editing, drawingRoad])

  // Render: pulsujące punkty alarmowe (widoczne dla wszystkich)
  useEffect(() => {
    const group = alertLayerRef.current
    if (!group) return
    group.clearLayers()
    alerts.forEach(a => {
      const icon = L.divIcon({
        className: '',
        html:
          '<div class="wsp-alert-dot" style="width:30px;height:30px;display:flex;align-items:center;' +
          'justify-content:center;background:#ef4444;border:2.5px solid #fff;border-radius:50%;' +
          'font-size:18px;font-weight:800;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.5)">!</div>',
        iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -16],
      })
      const m = L.marker([a.lat, a.lng], { icon, zIndexOffset: 2000 })
      m.bindTooltip(a.description, { permanent: true, direction: 'right', offset: [14, 0], className: 'feature-label' })
      m.bindPopup(alertPopupHtml(a), { className: 'wsp-popup', maxWidth: 260 })
      group.addLayer(m)
    })
  }, [alerts])

  // Render: lokalizacje na żywo
  useEffect(() => {
    const group = liveLayerRef.current
    if (!group) return
    group.clearLayers()
    liveLocations.forEach(loc => {
      const self = loc.userLogin === myLogin
      const color = self ? '#10b981' : '#3b82f6'
      const icon = L.divIcon({
        className: '',
        html:
          `<div class="wsp-live-dot" style="width:16px;height:16px;background:${color};` +
          'border:2.5px solid #fff;border-radius:50%;box-shadow:0 1px 6px rgba(0,0,0,.5)"></div>',
        iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -8],
      })
      const name = `${loc.displayName || loc.userLogin}${self ? ' (Ty)' : ''}`
      const label = loc.vehicle ? `${name} · 🚒 ${loc.vehicle}` : name
      const m = L.marker([loc.lat, loc.lng], { icon, zIndexOffset: 1500 })
      m.bindTooltip(label, { permanent: true, direction: 'right', offset: [12, 0], className: 'feature-label' })
      m.bindPopup(
        `<div style="font-family:sans-serif"><strong style="color:#f1f5f9">${name}</strong>` +
        (loc.vehicle ? `<div style="font-size:11px;color:#cbd5e1;margin-top:3px">🚒 ${loc.vehicle}</div>` : '') +
        '<div style="font-size:10px;color:#94a3b8;margin-top:2px">udostępnia lokalizację</div></div>',
        { className: 'wsp-popup' },
      )
      group.addLayer(m)
    })
  }, [liveLocations, myLogin])

  // Render: podgląd stawianego alarmu
  useEffect(() => {
    const group = alertDraftLayerRef.current
    if (!group) return
    group.clearLayers()
    if (!alertDraft) return
    const icon = L.divIcon({
      className: '',
      html:
        '<div class="wsp-alert-dot" style="opacity:.85;width:30px;height:30px;display:flex;align-items:center;' +
        'justify-content:center;background:#ef4444;border:2.5px solid #fff;border-radius:50%;' +
        'font-size:18px;font-weight:800;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.5)">!</div>',
      iconSize: [30, 30], iconAnchor: [15, 15],
    })
    group.addLayer(L.marker([alertDraft.lat, alertDraft.lng], { icon }))
  }, [alertDraft])

  // Bridge: usuwanie alarmu z popupu
  useEffect(() => {
    window.__wspDeleteAlert = async (id) => {
      mapRef.current?.closePopup()
      try {
        await deleteAlert(id)
        setAlerts(prev => prev.filter(a => a.id !== id))
      } catch { /* ignore */ }
    }
    return () => { delete window.__wspDeleteAlert }
  }, [])

  async function saveAlert() {
    if (!alertDraft) return
    const description = alertDraft.description.trim()
    if (!description) return
    setAlertBusy(true)
    try {
      const created = await createAlert(description, alertDraft.lat, alertDraft.lng, myLogin)
      setAlerts(prev => [...prev, created])
      setAlertDraft(null)
    } catch (err) {
      setFeaturesError(err instanceof Error ? err.message : 'Błąd zapisu alarmu')
    } finally {
      setAlertBusy(false)
    }
  }

  function startPlaceAlert() {
    setEditing(null)
    setAddKind(null)
    setAlertDraft(null)
    setPlacingAlert(v => !v)
  }

  function startAdd(kind: FeatureKind) {
    setEditing(null)
    setDrawingRoad([])
    drawingRoadRef.current = []
    setAddKind(prev => (prev === kind ? null : kind))
  }

  function finishRoad() {
    if (drawingRoad.length < 2) return
    setEditing({ kind: 'road', label: '', description: '', geometry: { type: 'line', points: drawingRoad } })
    setDrawingRoad([])
    drawingRoadRef.current = []
  }

  function undoRoadVertex() {
    const next = drawingRoad.slice(0, -1)
    setDrawingRoad(next)
    drawingRoadRef.current = next
  }

  async function saveEditing() {
    if (!editing) return
    const label = editing.label.trim()
    if (!label) { setFeaturesError('Podaj nazwę obiektu'); return }
    setFeaturesBusy(true)
    setFeaturesError('')
    try {
      const description = editing.description.trim() || null
      if (editing.id) {
        const patch = { label, description, geometry: editing.geometry, confirmed: true }
        await updateFeature(editing.id, patch)
        setFeatures(prev => prev.map(x => (x.id === editing.id ? { ...x, ...patch } : x)))
      } else {
        const created = await createFeature({
          kind: editing.kind, label, description, geometry: editing.geometry, confirmed: true,
        })
        setFeatures(prev => [...prev, created])
      }
      setEditing(null)
      setAddKind(null)
    } catch (err) {
      setFeaturesError(err instanceof Error ? err.message : 'Błąd zapisu')
    } finally {
      setFeaturesBusy(false)
    }
  }

  async function removeEditing() {
    if (!editing?.id) { setEditing(null); return }
    setFeaturesBusy(true)
    setFeaturesError('')
    try {
      await deleteFeature(editing.id)
      setFeatures(prev => prev.filter(x => x.id !== editing.id))
      setEditing(null)
    } catch (err) {
      setFeaturesError(err instanceof Error ? err.message : 'Błąd usuwania')
    } finally {
      setFeaturesBusy(false)
    }
  }

  async function handleSeed() {
    setFeaturesBusy(true)
    setFeaturesError('')
    try {
      setFeatures(await seedFeatures())
    } catch (err) {
      setFeaturesError(err instanceof Error ? err.message : 'Błąd importu danych startowych')
    } finally {
      setFeaturesBusy(false)
    }
  }

  function toggleEditMode() {
    setEditMode(prev => {
      const next = !prev
      if (!next) {
        setAddKind(null)
        setEditing(null)
        setDrawingRoad([])
        drawingRoadRef.current = []
      }
      return next
    })
  }

  // ── Nawigacja do celu (punkt / miejsce) ────────────────────────────────────

  const routeTo = useCallback(async (dest: L.LatLng, name: string) => {
    const map = mapRef.current
    if (!map) return
    const from = startModeRef.current === 'station' ? STATION : (userPosRef.current ?? STATION)

    clearRoute()
    clearRoads()
    setQuery(name.split(',')[0])
    setSearchState('loading')
    setSearchError('')

    const icon = L.divIcon({
      html: `<div style="width:13px;height:13px;background:#ef4444;border:2.5px solid #fff;border-radius:50%;box-shadow:0 1px 6px rgba(0,0,0,.55)"></div>`,
      iconSize: [13, 13], iconAnchor: [6, 6], className: '',
    })
    destMarkerRef.current = L.marker(dest, { icon })
      .bindPopup(`<strong>${name.split(',')[0]}</strong>`)
      .addTo(map)

    try {
      const pts = await fetchRoute(from, dest)
      routeLayerRef.current = L.polyline(pts, { color: '#3b82f6', weight: 4, opacity: 0.85 }).addTo(map)
      map.fitBounds(routeLayerRef.current.getBounds(), { padding: [50, 70], maxZoom: 16 })
      setSearchState('idle')
    } catch (err) {
      // brak trasy — pokaż chociaż sam cel
      map.setView(dest, 15)
      setSearchError(err instanceof Error ? err.message : 'Nie udało się wyznaczyć trasy')
      setSearchState('error')
    }
  }, [])

  // Nawigacja do drogi: podświetl linię + trasa z mojej pozycji do najbliższego jej punktu
  const navigateToRoad = useCallback(async (lines: L.LatLng[][], name: string) => {
    const map = mapRef.current
    if (!map) return
    const from = startModeRef.current === 'station' ? STATION : (userPosRef.current ?? STATION)

    clearRoads()
    clearRoute()
    setQuery(name)
    setSearchState('loading')
    setSearchError('')

    const bounds = L.latLngBounds([])
    let nearest: L.LatLng | null = null
    let best = Infinity
    lines.forEach(pts => {
      if (pts.length < 2) return
      const line = L.polyline(pts, { color: '#f97316', weight: 6, opacity: 0.95 }).addTo(map)
      line.bindPopup(`<strong style="font-size:13px">${name}</strong>`, { maxWidth: 220 })
      roadLayersRef.current.push(line)
      pts.forEach(p => {
        bounds.extend(p)
        const d = from.distanceTo(p)
        if (d < best) { best = d; nearest = p }
      })
    })

    if (!nearest) { setSearchState('notfound'); return }
    const target = nearest

    try {
      const route = await fetchRoute(from, target)
      routeLayerRef.current = L.polyline(route, { color: '#3b82f6', weight: 4, opacity: 0.85 }).addTo(map)
      route.forEach(p => bounds.extend(p))
      map.fitBounds(bounds, { padding: [50, 70], maxZoom: 16 })
      setSearchState('idle')
    } catch {
      // trasa nie wyszła — pokaż chociaż podświetloną drogę
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 })
      setSearchState('idle')
    }
  }, [])

  // Podświetl granicę wybranego oddziału (delikatnie) + trasa z mojej pozycji
  const showCompartment = useCallback(async (c: { label: string; range: string; rings: L.LatLng[][] }) => {
    const map = mapRef.current
    if (!map) return
    const from = startModeRef.current === 'station' ? STATION : (userPosRef.current ?? STATION)

    clearRoads()
    clearRoute()
    setCompartmentChoices(null)
    setQuery(c.label)
    setSearchState('loading')
    setSearchError('')

    const bounds = L.latLngBounds([])
    let nearest: L.LatLng | null = null
    let nd = Infinity
    c.rings.forEach(r => {
      const poly = L.polygon(r, {
        color: '#818cf8', weight: 2.5, opacity: 0.95, fillColor: '#818cf8', fillOpacity: 0.12,
      }).addTo(map)
      poly.bindPopup(
        `<strong style="font-size:13px">${c.label}</strong>` +
        (c.range ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px">leśnictwo ${c.range}</div>` : ''),
        { className: 'wsp-popup', maxWidth: 200 },
      )
      roadLayersRef.current.push(poly)
      r.forEach(p => {
        bounds.extend(p)
        const d = from.distanceTo(p)
        if (d < nd) { nd = d; nearest = p }
      })
    })

    if (!nearest) { setSearchState('idle'); return }
    const target = nearest

    try {
      const route = await fetchRoute(from, target)
      routeLayerRef.current = L.polyline(route, { color: '#3b82f6', weight: 4, opacity: 0.85 }).addTo(map)
      route.forEach(p => bounds.extend(p))
      map.fitBounds(bounds, { padding: [50, 70], maxZoom: 16 })
    } catch {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 })
    }
    setSearchState('idle')
  }, [])

  // Wyszukiwanie oddziału po numerze. Gdy jeden — od razu pokaż; gdy kilka —
  // pokaż wybór z punktem orientacyjnym (najbliższa miejscowość).
  const navigateToCompartment = useCallback(async (nr: string): Promise<boolean> => {
    let json: { features?: { label: string; range: string; rings: number[][][] }[] }
    try {
      const res = await fetch(`/.netlify/functions/bdl-compartment?nr=${encodeURIComponent(nr)}`)
      if (!res.ok) return false
      json = await res.json()
    } catch {
      return false
    }

    const candidates = (json.features ?? [])
      .map(f => ({
        label: f.label,
        range: f.range,
        rings: f.rings.map(ring => ring.map(([lng, lat]) => L.latLng(lat, lng))),
      }))
      .filter(c => c.rings.some(r => r.length >= 3))
    if (candidates.length === 0) return false

    if (candidates.length === 1) {
      await showCompartment(candidates[0])
      return true
    }

    // Kilka oddziałów o tym numerze — wzbogać o miejscowość + dystans i pokaż wybór
    setSearchState('loading')
    const enriched: CompartmentCandidate[] = await Promise.all(candidates.map(async c => {
      const centroid = ringsCentroid(c.rings)
      const hint = await nearestLocality(centroid)
      return { ...c, centroid, hint, distKm: STATION.distanceTo(centroid) / 1000 }
    }))
    enriched.sort((a, b) => a.distKm - b.distKm)

    clearRoads()
    clearRoute()
    setCompartmentChoices(enriched)
    setSearchState('idle')
    return true
  }, [showCompartment])

  // ── Jedna wyszukiwarka: Twoje dane → oddział → mapa (drogi) → miejsce ───────

  const runSearch = useCallback(async () => {
    const q = query.trim()
    if (!q || !mapRef.current) return
    startModeRef.current = 'gps'
    setSearchState('loading')
    setSearchError('')
    setCompartmentChoices(null)
    const ql = q.toLowerCase()

    // 1) Twoje wprowadzone obiekty — priorytet
    const matches = features.filter(f => f.label.toLowerCase().includes(ql))
    const pick = matches.find(f => f.label.toLowerCase() === ql) ?? matches[0]
    if (pick) {
      if (pick.geometry.type === 'point') {
        routeTo(L.latLng(pick.geometry.lat, pick.geometry.lng), pick.label)
      } else {
        navigateToRoad([pick.geometry.points.map(([a, b]) => L.latLng(a, b))], pick.label)
      }
      return
    }

    // 2) Oddział leśny po numerze (granice z BDL)
    if (/^\d{1,4}$/.test(q)) {
      const ok = await navigateToCompartment(q)
      if (ok) return
    }

    // 3) Drogi / dojazdy dostępne na mapie (OSM)
    try {
      const ospwlBbox = `${OSPWL.south},${OSPWL.west},${OSPWL.north},${OSPWL.east}`
      const roadQl = [
        '[out:json][timeout:25];',
        `way["name"~"${buildRoadRegex(q)}",i](${ospwlBbox});`,
        'out geom;',
      ].join('')
      const ways = await overpassFetch(roadQl)
      if (ways.length > 0) {
        const lines = ways
          .map(w => w.geometry.map(p => L.latLng(p.lat, p.lon)))
          .filter(pts => pts.length >= 2)
        navigateToRoad(lines, ways.find(w => w.tags?.name)?.tags?.name ?? q)
        return
      }
    } catch {
      /* przejdź do geokodera */
    }

    // 4) Miejsce z mapy (geokoder)
    try {
      const places = await geocode(q)
      if (places.length > 0) {
        routeTo(L.latLng(parseFloat(places[0].lat), parseFloat(places[0].lon)), places[0].display_name)
        return
      }
      setSearchState('notfound')
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Błąd połączenia')
      setSearchState('error')
    }
  }, [query, features, routeTo, navigateToRoad, navigateToCompartment])

  // Bridge: Leaflet popup buttons → React (must be after routeTo declaration)
  useEffect(() => {
    window.__wspNavigateTo = (lat, lng, name, sm) => {
      startModeRef.current = sm
      routeTo(L.latLng(lat, lng), name)
      mapRef.current?.closePopup()
    }
    window.__wspClosePopup = () => { mapRef.current?.closePopup() }
    return () => {
      delete window.__wspNavigateTo
      delete window.__wspClosePopup
    }
  }, [routeTo])

  // ── Grid overlay — kafle BDL przez własne proxy (próba zamiast 1 obrazu) ────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    gridLayersRef.current.forEach(l => map.removeLayer(l))
    gridLayersRef.current = []

    if (!showGrid) return

    setGridLoading(true)
    const layer = L.tileLayer('/.netlify/functions/bdl-tiles?z={z}&x={x}&y={y}', {
      opacity: 0.85,
      attribution: '© BDL Lasy Państwowe',
      minZoom: 12, // warstwa Oddziałów znika powyżej ~1:170k (poniżej zoom 12)
      maxZoom: 19,
      bounds: L.latLngBounds([52.0, 14.7], [52.7, 15.8]),
    })
    layer.on('loading', () => setGridLoading(true))
    layer.on('load', () => setGridLoading(false))
    layer.addTo(map)
    layer.setZIndex(300) // nad podkładem i etykietami hybrydy
    gridLayersRef.current.push(layer)
  }, [showGrid])

  useEffect(() => {
    if (!following) return
    setGpsToast(true)
    const t = setTimeout(() => setGpsToast(false), 3000)
    return () => clearTimeout(t)
  }, [following])

  useEffect(() => {
    if (!isSharing) return
    setShareToast(true)
    const t = setTimeout(() => setShareToast(false), 3000)
    return () => clearTimeout(t)
  }, [isSharing])

  useEffect(() => {
    if (baseMap !== 'sat') return
    setBaseToast(true)
    const t = setTimeout(() => setBaseToast(false), 3000)
    return () => clearTimeout(t)
  }, [baseMap])

  function clearSearch() {
    setQuery('')
    setSearchState('idle')
    setSearchError('')
    setCompartmentChoices(null)
    clearRoads()
    clearRoute()
  }

  const isSearchBusy = searchState === 'loading'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />

      {/* Controls */}
      <div className="absolute top-3 left-3 right-3 md:right-auto md:w-80 z-[1000] flex flex-col gap-2">

        {/* Jedna wyszukiwarka — Enter prowadzi z mojej pozycji */}
        <form
          onSubmit={e => { e.preventDefault(); runSearch() }}
          className="flex items-center gap-2 px-4 py-3 bg-white/95 backdrop-blur-md rounded-full shadow-2xl"
        >
          <button type="submit" className="shrink-0 text-slate-400 hover:text-brand-600 transition-colors">
            {isSearchBusy
              ? <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
              : <Search className="w-4 h-4" />}
          </button>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Granica oddziału, droga ppoż, miejsce…"
            className="flex-1 min-w-0 bg-transparent text-[13px] text-slate-900 placeholder:text-slate-400 outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={clearSearch}
              className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </form>

        {/* Alerts — tylko stany negatywne */}
        {searchState === 'notfound' && (
          <div className="flex items-center gap-2 bg-surface-950/95 backdrop-blur-sm border border-amber-800/40 rounded-full px-4 py-2 text-[11px] text-amber-400 shadow-lg">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Nie znaleziono „{query}"
          </div>
        )}
        {searchState === 'error' && (
          <div className="flex items-center gap-2 bg-surface-950/95 backdrop-blur-sm border border-red-800/40 rounded-full px-4 py-2 text-[11px] text-red-400 shadow-lg">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {searchError}
          </div>
        )}

        {/* Wybór oddziału — gdy numer pasuje do kilku */}
        {compartmentChoices && (
          <div className="bg-surface-950/97 backdrop-blur-md border border-indigo-700/40 rounded-2xl p-2.5 shadow-2xl flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold text-slate-200">
                Kilka oddziałów „{compartmentChoices[0].label.replace('Oddział ', '')}" — wybierz
              </span>
              <button onClick={() => setCompartmentChoices(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {compartmentChoices.map((c, i) => (
              <button
                key={i}
                onClick={() => showCompartment(c)}
                className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-surface-900/80 hover:bg-surface-800 border border-slate-700/40 text-left transition-colors"
              >
                <span className="text-[14px]">🌲</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] text-slate-100 truncate">
                    k. {c.hint || 'nieznana okolica'}
                  </span>
                  <span className="block text-[10px] text-slate-500">
                    leśnictwo {c.range || '—'} · ok. {c.distKm.toFixed(1)} km od strażnicy
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Podpowiedź: stawianie alarmu */}
        {placingAlert && (
          <div className="flex items-center justify-between gap-2 bg-red-950/80 backdrop-blur-sm border border-red-700/50 rounded-full px-4 py-2 text-[11px] text-red-200 shadow-lg">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Kliknij miejsce na mapie — punkt zobaczą wszyscy
            </span>
            <button onClick={() => setPlacingAlert(false)} className="text-red-300 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Formularz alarmu */}
        {alertDraft && (
          <div className="bg-surface-950/97 backdrop-blur-md border border-red-700/40 rounded-2xl p-3 shadow-2xl flex flex-col gap-2.5">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-red-300">
              <AlertTriangle className="w-4 h-4" /> Nowy punkt
            </div>
            <input
              autoFocus
              type="text"
              value={alertDraft.description}
              onChange={e => setAlertDraft(prev => prev ? { ...prev, description: e.target.value } : prev)}
              onKeyDown={e => { if (e.key === 'Enter') saveAlert() }}
              placeholder="Opis (np. miejsce zbiórki, utrudnienie, uwaga)"
              className="w-full bg-surface-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 outline-none focus:border-red-500"
            />
            <div className="text-[10px] text-slate-500 px-1">
              Widoczny dla wszystkich · znika po 2&nbsp;h
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={saveAlert}
                disabled={alertBusy || !alertDraft.description.trim()}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-medium bg-red-600 text-white disabled:opacity-40"
              >
                {alertBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Dodaj punkt
              </button>
              <button
                onClick={() => setAlertDraft(null)}
                className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-medium bg-surface-900/80 text-slate-300 border border-slate-700/40"
              >
                <X className="w-3 h-3" /> Anuluj
              </button>
            </div>
          </div>
        )}

        {/* Błąd obiektów mapy */}
        {featuresError && (
          <div className="flex items-center gap-2 bg-surface-950/95 backdrop-blur-sm border border-red-800/40 rounded-full px-4 py-2 text-[11px] text-red-400 shadow-lg">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {featuresError}
          </div>
        )}

        {/* Tryb edycji: pasek dodawania obiektów */}
        {isAdmin && editMode && !editing && (
          <div className="bg-surface-950/97 backdrop-blur-md border border-brand-700/40 rounded-2xl p-2.5 shadow-2xl flex flex-col gap-2">
            <div className="text-[11px] text-slate-400 px-1">
              {addKind === 'road'
                ? 'Klikaj na mapie, by dodać punkty drogi'
                : addKind
                  ? 'Kliknij na mapie, by postawić obiekt'
                  : 'Wybierz typ obiektu i kliknij na mapie'}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(['water', 'unit', 'poi', 'road'] as FeatureKind[]).map(k => (
                <button
                  key={k}
                  onClick={() => startAdd(k)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-colors border',
                    addKind === k
                      ? 'bg-brand-600 text-white border-brand-500'
                      : 'bg-surface-900/80 text-slate-300 border-slate-700/40 hover:text-white',
                  )}
                >
                  <span>{KIND_META[k].emoji}</span>
                  {KIND_META[k].label.replace('Punkt czerpania wody', 'Woda')}
                </button>
              ))}
            </div>

            {addKind === 'road' && drawingRoad.length > 0 && (
              <div className="flex gap-1.5">
                <button
                  onClick={finishRoad}
                  disabled={drawingRoad.length < 2}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-medium bg-brand-600 text-white disabled:opacity-40"
                >
                  <Check className="w-3 h-3" /> Zakończ ({drawingRoad.length})
                </button>
                <button
                  onClick={undoRoadVertex}
                  className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-medium bg-surface-900/80 text-slate-300 border border-slate-700/40"
                >
                  <Undo2 className="w-3 h-3" /> Cofnij
                </button>
              </div>
            )}

            {features.length === 0 && (
              <button
                onClick={handleSeed}
                disabled={featuresBusy}
                className="flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-medium bg-surface-900/80 text-amber-300 border border-amber-700/40 disabled:opacity-50"
              >
                {featuresBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Importuj punkty ze zdjęcia (przybliżone)
              </button>
            )}
          </div>
        )}

        {/* Tryb edycji: formularz obiektu */}
        {isAdmin && editing && (
          <div className="bg-surface-950/97 backdrop-blur-md border border-brand-700/40 rounded-2xl p-3 shadow-2xl flex flex-col gap-2.5">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-100">
              <span>{KIND_META[editing.kind].emoji}</span>
              {editing.id ? 'Edytuj' : 'Nowy'}: {KIND_META[editing.kind].label}
            </div>
            <input
              autoFocus
              type="text"
              value={editing.label}
              onChange={e => setEditing(prev => prev ? { ...prev, label: e.target.value } : prev)}
              placeholder="Nazwa (np. J. Rakowe)"
              className="w-full bg-surface-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 outline-none focus:border-brand-500"
            />
            <input
              type="text"
              value={editing.description}
              onChange={e => setEditing(prev => prev ? { ...prev, description: e.target.value } : prev)}
              placeholder="Opis (np. pomost, wydajność, dojazd)"
              className="w-full bg-surface-900/80 border border-slate-700/50 rounded-xl px-3 py-2 text-[12px] text-slate-200 placeholder:text-slate-500 outline-none focus:border-brand-500"
            />
            {editing.geometry.type === 'point' && (
              <div className="text-[10px] text-slate-500 px-1 font-variant-numeric tabular-nums">
                {editing.geometry.lat.toFixed(5)}, {editing.geometry.lng.toFixed(5)} · przeciągnij znacznik, by poprawić
              </div>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={saveEditing}
                disabled={featuresBusy}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-medium bg-brand-600 text-white disabled:opacity-50"
              >
                {featuresBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Zapisz
              </button>
              <button
                onClick={() => { setEditing(null); setFeaturesError('') }}
                className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-medium bg-surface-900/80 text-slate-300 border border-slate-700/40"
              >
                <X className="w-3 h-3" /> Anuluj
              </button>
              {editing.id && (
                <button
                  onClick={removeEditing}
                  disabled={featuresBusy}
                  className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-medium bg-red-950/60 text-red-300 border border-red-800/50 disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* GPS label toast */}
      <div className={cn(
        'absolute bottom-5 right-14 z-[1000]',
        'flex items-center gap-2 px-3 py-2 rounded-xl shadow-lg',
        'bg-surface-900/95 border border-slate-700/60 backdrop-blur-sm',
        'text-[12px] text-slate-200 whitespace-nowrap pointer-events-none',
        'transition-all duration-300',
        gpsToast ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2',
      )}>
        <LocateFixed className="w-3.5 h-3.5 text-brand-400 shrink-0" />
        Śledź moją pozycję
      </div>

      {/* Share label toast */}
      <div
        style={{ bottom: isAdmin ? '10.25rem' : '7.25rem' }}
        className={cn(
          'absolute right-14 z-[1000]',
          'flex items-center gap-2 px-3 py-2 rounded-xl shadow-lg',
          'bg-surface-900/95 border border-slate-700/60 backdrop-blur-sm',
          'text-[12px] text-slate-200 whitespace-nowrap pointer-events-none',
          'transition-all duration-300',
          shareToast ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2',
        )}
      >
        <SatelliteDish className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        Udostępniasz lokalizację (30 min)
      </div>

      {/* Basemap label toast */}
      <div
        style={{ bottom: isAdmin ? '16.25rem' : '13.25rem' }}
        className={cn(
          'absolute right-14 z-[1000]',
          'flex items-center gap-2 px-3 py-2 rounded-xl shadow-lg',
          'bg-surface-900/95 border border-slate-700/60 backdrop-blur-sm',
          'text-[12px] text-slate-200 whitespace-nowrap pointer-events-none',
          'transition-all duration-300',
          baseToast ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2',
        )}
      >
        <Globe2 className="w-3.5 h-3.5 text-brand-400 shrink-0" />
        Ortofotomapa
      </div>

      {/* Filtr obiektów mapy */}
      {filterOpen && (
        <div className="absolute bottom-5 right-16 z-[1001] w-52 bg-surface-950/97 backdrop-blur-md border border-slate-700/40 rounded-2xl p-2.5 shadow-2xl flex flex-col gap-1">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-[11px] font-semibold text-slate-300">Pokaż na mapie</span>
            <button
              onClick={() => setFilterOpen(false)}
              className="text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {(['water', 'unit', 'poi', 'road'] as FeatureKind[]).map(k => {
            const on = visibleKinds[k]
            const count = features.filter(f => f.kind === k).length
            return (
              <button
                key={k}
                onClick={() => setVisibleKinds(prev => ({ ...prev, [k]: !prev[k] }))}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-xl text-[12px] transition-colors',
                  on ? 'bg-surface-900/80 text-slate-100' : 'text-slate-500 hover:bg-surface-900/50',
                )}
              >
                <span className={cn('text-[14px]', !on && 'grayscale opacity-50')}>{KIND_META[k].emoji}</span>
                <span className="flex-1 text-left">
                  {KIND_META[k].label.replace('Punkt czerpania wody', 'Woda')}
                </span>
                <span className="text-[10px] text-slate-500 tabular-nums">{count}</span>
                <span
                  className={cn(
                    'w-8 h-4 rounded-full relative transition-colors shrink-0',
                    on ? 'bg-brand-600' : 'bg-slate-700',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all',
                      on ? 'left-[18px]' : 'left-0.5',
                    )}
                  />
                </span>
              </button>
            )
          })}

          {/* Nakładki */}
          <div className="mt-1 pt-1.5 border-t border-slate-700/40">
            <button
              onClick={() => setShowGrid(v => !v)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-[12px] transition-colors',
                showGrid ? 'bg-surface-900/80 text-slate-100' : 'text-slate-500 hover:bg-surface-900/50',
              )}
            >
              {gridLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400 shrink-0" />
                : <Milestone className={cn('w-3.5 h-3.5 shrink-0', showGrid ? 'text-brand-400' : 'text-slate-500')} />}
              <span className="flex-1 text-left">Granice oddziału</span>
              <span
                className={cn(
                  'w-8 h-4 rounded-full relative transition-colors shrink-0',
                  showGrid ? 'bg-brand-600' : 'bg-slate-700',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all',
                    showGrid ? 'left-[18px]' : 'left-0.5',
                  )}
                />
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Grid + GPS + Follow buttons */}
      <div className="absolute bottom-5 right-3 z-[1000] flex flex-col items-end gap-2">
        <button
          onClick={() => setBaseMap(v => (v === 'sat' ? 'map' : 'sat'))}
          title={baseMap === 'sat' ? 'Widok mapy' : 'Ortofotomapa (zdjęcia lotnicze)'}
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center shadow-lg border transition-colors',
            baseMap === 'sat'
              ? 'bg-brand-600 text-white border-brand-500'
              : 'bg-surface-900/90 text-slate-400 border-slate-700/60 backdrop-blur-sm hover:text-slate-200',
          )}
        >
          {baseMap === 'sat' ? <MapIcon className="w-4 h-4" /> : <Globe2 className="w-4 h-4" />}
        </button>
        <button
          onClick={startPlaceAlert}
          title={placingAlert ? 'Anuluj dodawanie punktu' : 'Dodaj punkt na mapie'}
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center shadow-lg border transition-colors',
            placingAlert
              ? 'bg-red-600 text-white border-red-500'
              : 'bg-surface-900/90 text-red-400 border-slate-700/60 backdrop-blur-sm hover:text-red-300',
          )}
        >
          <AlertTriangle className="w-4 h-4" />
        </button>
        <button
          onClick={() => (isSharing ? stopShare() : startShare())}
          disabled={!myLogin}
          title={isSharing ? `Udostępniasz lokalizację (${shareRemainingMin ?? 30} min) — kliknij, by zatrzymać` : 'Udostępnij lokalizację na 30 min'}
          className={cn(
            'relative w-10 h-10 rounded-full flex items-center justify-center shadow-lg border transition-colors',
            isSharing
              ? 'bg-emerald-600 text-white border-emerald-500'
              : myLogin
                ? 'bg-surface-900/90 text-slate-400 border-slate-700/60 backdrop-blur-sm hover:text-slate-200'
                : 'bg-surface-900/90 text-slate-600 border-slate-700/60 cursor-not-allowed backdrop-blur-sm',
          )}
        >
          <SatelliteDish className="w-4 h-4" />
          {isSharing && shareRemainingMin !== null && (
            <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center border border-surface-950">
              {shareRemainingMin}
            </span>
          )}
        </button>
        {isAdmin && (
          <button
            onClick={toggleEditMode}
            title={editMode ? 'Zakończ edycję obiektów' : 'Edytuj obiekty mapy'}
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center shadow-lg border transition-colors',
              editMode
                ? 'bg-amber-600 text-white border-amber-500'
                : 'bg-surface-900/90 text-slate-400 border-slate-700/60 backdrop-blur-sm hover:text-slate-200',
            )}
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => setFilterOpen(v => !v)}
          title="Filtruj obiekty mapy"
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center shadow-lg border transition-colors',
            filterOpen
              ? 'bg-brand-600 text-white border-brand-500'
              : 'bg-surface-900/90 text-slate-400 border-slate-700/60 backdrop-blur-sm hover:text-slate-200',
          )}
        >
          <Layers className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            const next = !following
            setFollowing(next)
            if (next && userPos) mapRef.current?.setView(userPos, 15)
          }}
          disabled={!userPos}
          title={following ? 'Wyłącz śledzenie pozycji' : 'Śledź moją pozycję'}
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center shadow-lg border transition-colors',
            following
              ? 'bg-brand-600 text-white border-brand-500'
              : userPos
                ? 'bg-surface-900/90 text-slate-400 border-slate-700/60 backdrop-blur-sm hover:text-slate-200'
                : 'bg-surface-900/90 text-slate-600 border-slate-700/60 cursor-not-allowed backdrop-blur-sm',
          )}
        >
          <LocateFixed className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

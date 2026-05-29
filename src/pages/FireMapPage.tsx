import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Navigation2, Search, X, AlertCircle, Loader2, Truck, LocateFixed, Milestone,
  Pencil, Check, Trash2, Plus, Layers, Undo2,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useAuth } from '../lib/auth'
import {
  fetchFeatures, createFeature, updateFeature, deleteFeature, seedFeatures,
  KIND_META,
  type MapFeature, type FeatureKind, type FeatureGeometry, type PointGeometry,
} from '../lib/mapFeatures'

// ── Constants ─────────────────────────────────────────────────────────────────

const MAP_CENTER: [number, number] = [52.420, 15.210]
const MAP_ZOOM = 12
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving'

const COUNTY = { south: 52.15, north: 52.62, west: 14.85, east: 15.50 }
const OSPWL  = { south: 52.27558, north: 52.48582, west: 14.98, east: 15.35 }
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
  }
}

type AppMode = 'roads' | 'navigate'
type SearchState = 'idle' | 'loading' | 'found' | 'notfound' | 'error'
type NavState = 'idle' | 'routing' | 'routed' | 'error'

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
    `<button onclick="window.__wspNavigateTo(${lat},${lng},decodeURIComponent('${safeName}'),'station')" ` +
      'style="width:100%;padding:6px 10px;border-radius:12px;border:none;font-size:11px;font-family:sans-serif;' +
      'font-weight:500;cursor:pointer;text-align:left;background:rgba(59,130,246,0.2);color:#93c5fd">' +
      'Nawiguj ze strażnicy</button>',
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

export function FireMapPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
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

  const [mode, setMode] = useState<AppMode>('roads')
  const [showGrid, setShowGrid] = useState(false)

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
  const [gridToast, setGridToast] = useState(false)
  const [gpsToast, setGpsToast] = useState(false)
  const [userPos, setUserPos] = useState<L.LatLng | null>(null)

  const [query, setQuery] = useState('')
  const [searchState, setSearchState] = useState<SearchState>('idle')
  const [roadsError, setRoadsError] = useState('')

  const [destQuery, setDestQuery] = useState('')
  const [suggestions, setSuggestions] = useState<NominatimPlace[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [navState, setNavState] = useState<NavState>('idle')
  const [navError, setNavError] = useState('')
  const [startMode, setStartMode] = useState<'gps' | 'station'>('gps')
  const startModeRef = useRef<'gps' | 'station'>('gps')
  const currentDestRef = useRef<{ latlng: L.LatLng; name: string } | null>(null)
  const [following, setFollowing] = useState(false)
  const followingRef = useRef(false)

  useEffect(() => { userPosRef.current = userPos }, [userPos])
  useEffect(() => { followingRef.current = following }, [following])
  useEffect(() => { editModeRef.current = editMode }, [editMode])
  useEffect(() => { addKindRef.current = addKind }, [addKind])
  useEffect(() => { drawingRoadRef.current = drawingRoad }, [drawingRoad])

  // Wczytaj obiekty mapy z Supabase
  useEffect(() => {
    fetchFeatures()
      .then(setFeatures)
      .catch(err => setFeaturesError(err instanceof Error ? err.message : 'Błąd wczytywania obiektów'))
  }, [])
  useEffect(() => {
    startModeRef.current = startMode
    // Re-route automatically when start point changes and destination is already set
    if (currentDestRef.current && navState === 'routed') {
      routeTo(currentDestRef.current.latlng, currentDestRef.current.name)
    }
  }, [startMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Map init ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      zoomControl: false,
      attributionControl: false,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    map.fitBounds([[52.20, OSPWL.west], [OSPWL.north, 15.52]], { padding: [20, 20] })

    featureLayerRef.current = L.layerGroup().addTo(map)
    draftLayerRef.current = L.layerGroup().addTo(map)

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
        'background:rgba(8,15,30,0.97);border:1px solid rgba(51,65,85,0.5);',
        'border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.6);backdrop-filter:blur(8px)}',
      '.wsp-popup .leaflet-popup-tip{background:rgba(8,15,30,0.97)}',
      '.wsp-popup .leaflet-popup-content{margin:10px 14px}',
      '.wsp-popup .leaflet-popup-close-button{display:none!important}',
      '.forest-label{background:transparent!important;border:none!important;box-shadow:none!important;',
        'font-size:9px;font-weight:700;color:#4ade80;',
        'text-shadow:0 0 3px #000,0 0 2px #000;white-space:nowrap}',
      '.feature-label{background:rgba(8,15,30,0.82)!important;border:none!important;box-shadow:none!important;',
        'color:#e2e8f0;font-size:10px;font-weight:600;padding:1px 6px;border-radius:6px;white-space:nowrap}',
      '.feature-label.leaflet-tooltip-right::before,.feature-label.leaflet-tooltip-left::before,',
      '.feature-label::before{display:none!important}',
    ].join('')
    document.head.appendChild(style)

    map.on('click', async (e) => {
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
      featureLayerRef.current = null
      draftLayerRef.current = null
      style.remove()
    }
  }, [])

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

  // ── Roads: search ─────────────────────────────────────────────────────────

  const search = useCallback(async (nr: string) => {
    const clean = nr.trim()
    if (!clean || !mapRef.current) return
    const map = mapRef.current

    clearRoads()
    setSearchState('loading')
    setRoadsError('')

    const ospwlBbox = `${OSPWL.south},${OSPWL.west},${OSPWL.north},${OSPWL.east}`
    const ql = [
      '[out:json][timeout:25];',
      `way["name"~"${buildRoadRegex(clean)}",i](${ospwlBbox});`,
      'out geom;',
    ].join('')

    try {
      const ways = await overpassFetch(ql)
      if (ways.length === 0) { setSearchState('notfound'); return }

      const fitBounds = L.latLngBounds([])
      ways.forEach(way => {
        const pts = way.geometry.map(p => L.latLng(p.lat, p.lon))
        if (pts.length < 2) return
        const name = way.tags?.name ?? ''
        const line = L.polyline(pts, { color: '#f97316', weight: 5, opacity: 0.95 }).addTo(map)
        if (name) line.bindPopup(`<strong style="font-size:13px">${name}</strong>`, { maxWidth: 220 })
        roadLayersRef.current.push(line)
        pts.forEach(p => fitBounds.extend(p))
      })

      map.fitBounds(fitBounds, { padding: [40, 40], maxZoom: 16 })
      setSearchState('found')
      setTimeout(() => setSearchState('idle'), 3000)
    } catch (err) {
      setRoadsError(err instanceof Error ? err.message : 'Błąd połączenia')
      setSearchState('error')
    }
  }, [])

  // ── Navigate: geocode + route ─────────────────────────────────────────────

  const searchPlace = useCallback(async () => {
    const q = destQuery.trim()
    if (!q) return
    setSuggestLoading(true)
    setSuggestions([])
    try {
      setSuggestions(await geocode(q))
    } catch {
      /* ignore */
    } finally {
      setSuggestLoading(false)
    }
  }, [destQuery])

  const routeTo = useCallback(async (dest: L.LatLng, name: string) => {
    const map = mapRef.current
    if (!map) return

    const from = startModeRef.current === 'station' ? STATION : userPosRef.current
    if (!from) {
      setNavError('Brak sygnału GPS — poczekaj na lokalizację')
      setNavState('error')
      return
    }

    clearRoute()
    setSuggestions([])
    setDestQuery(name.split(',')[0])
    currentDestRef.current = { latlng: dest, name }
    setNavState('routing')
    setNavError('')

    const icon = L.divIcon({
      html: `<div style="width:13px;height:13px;background:#ef4444;border:2.5px solid #fff;border-radius:50%;box-shadow:0 1px 6px rgba(0,0,0,.55)"></div>`,
      iconSize: [13, 13], iconAnchor: [6, 6], className: '',
    })
    destMarkerRef.current = L.marker(dest, { icon })
      .bindPopup(`<strong>${name.split(',')[0]}</strong>`)
      .addTo(map)

    try {
      const pts = await fetchRoute(from!, dest)
      routeLayerRef.current = L.polyline(pts, { color: '#3b82f6', weight: 4, opacity: 0.85 }).addTo(map)
      map.fitBounds(routeLayerRef.current.getBounds(), { padding: [50, 70], maxZoom: 16 })
      setNavState('routed')
    } catch (err) {
      setNavError(err instanceof Error ? err.message : 'Błąd wyznaczania trasy')
      setNavState('error')
    }
  }, [])

  // Bridge: Leaflet popup buttons → React (must be after routeTo declaration)
  useEffect(() => {
    window.__wspNavigateTo = (lat, lng, name, sm) => {
      startModeRef.current = sm
      setStartMode(sm)
      setMode('navigate')
      routeTo(L.latLng(lat, lng), name)
      mapRef.current?.closePopup()
    }
    window.__wspClosePopup = () => { mapRef.current?.closePopup() }
    return () => {
      delete window.__wspNavigateTo
      delete window.__wspClosePopup
    }
  }, [routeTo])

  // ── Grid overlay — jeden obraz BDL imageOverlay dla całego OSPWL ──────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    gridLayersRef.current.forEach(l => map.removeLayer(l))
    gridLayersRef.current = []

    if (!showGrid) return

    setGridLoading(true)
    const overlay = L.imageOverlay(
      '/.netlify/functions/bdl-compartments?v=4',
      [[OSPWL.south, OSPWL.west], [OSPWL.north, OSPWL.east]],
      { opacity: 0.8, attribution: '© BDL Lasy Państwowe' },
    )
    overlay.on('load',  () => setGridLoading(false))
    overlay.on('error', () => setGridLoading(false))
    overlay.addTo(map)
    gridLayersRef.current.push(overlay)
  }, [showGrid])

  useEffect(() => {
    if (!showGrid) return
    setGridToast(true)
    const t = setTimeout(() => setGridToast(false), 3000)
    return () => clearTimeout(t)
  }, [showGrid])

  useEffect(() => {
    if (!following) return
    setGpsToast(true)
    const t = setTimeout(() => setGpsToast(false), 3000)
    return () => clearTimeout(t)
  }, [following])

  function pickSuggestion(place: NominatimPlace) {
    routeTo(L.latLng(parseFloat(place.lat), parseFloat(place.lon)), place.display_name)
  }

  function clearNav() {
    clearRoute()
    setDestQuery('')
    setSuggestions([])
    setNavState('idle')
    setNavError('')
  }

  function clearRoadsSearch() {
    setQuery('')
    setSearchState('idle')
    clearRoads()
  }

  const isSearchBusy = searchState === 'loading' || suggestLoading || navState === 'routing'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />

      {/* Controls */}
      <div className="absolute top-3 left-3 right-3 md:right-auto md:w-80 z-[1000] flex flex-col gap-2">

        {/* Search pill */}
        <form
          onSubmit={e => { e.preventDefault(); mode === 'roads' ? search(query) : searchPlace() }}
          className="flex items-center gap-2 px-4 py-3 bg-white/95 backdrop-blur-md rounded-full shadow-2xl"
        >
          <button type="submit" className="shrink-0 text-slate-400 hover:text-brand-600 transition-colors">
            {isSearchBusy
              ? <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
              : <Search className="w-4 h-4" />}
          </button>
          <input
            type="text"
            value={mode === 'roads' ? query : destQuery}
            onChange={e => {
              if (mode === 'roads') setQuery(e.target.value)
              else { setDestQuery(e.target.value); setSuggestions([]) }
            }}
            placeholder={mode === 'roads' ? 'Numer lub nazwa dojazdu' : 'Cel (jezioro, budynek…)'}
            className="flex-1 min-w-0 bg-transparent text-[13px] text-slate-900 placeholder:text-slate-400 outline-none"
          />
          {(mode === 'roads' ? query : (destQuery || navState !== 'idle')) && (
            <button
              type="button"
              onClick={mode === 'roads' ? clearRoadsSearch : clearNav}
              className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </form>

        {/* Mode + start chips — single row */}
        <div className="flex gap-1.5 px-1">
          {([
            { label: 'Dojazdy poż.', icon: Search, active: mode === 'roads', onClick: () => setMode('roads') },
            { label: 'Z pozycji', icon: Navigation2, active: mode === 'navigate' && startMode === 'gps', onClick: () => { setMode('navigate'); setStartMode('gps') } },
            { label: 'Ze strażnicy', icon: Truck, active: mode === 'navigate' && startMode === 'station', onClick: () => { setMode('navigate'); setStartMode('station') } },
          ]).map(({ label, icon: Icon, active, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className={cn(
                'flex-1 flex items-center justify-center gap-1 py-1.5 rounded-full text-[11px] font-medium transition-all shadow-md',
                active
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-900/90 text-slate-400 border border-slate-700/40 backdrop-blur-sm hover:text-slate-200',
              )}
            >
              <Icon className="w-3 h-3 shrink-0" />
              {label}
            </button>
          ))}
        </div>

        {/* Alerts — only negative states */}
        {mode === 'roads' && searchState === 'notfound' && (
          <div className="flex items-center gap-2 bg-surface-950/95 backdrop-blur-sm border border-amber-800/40 rounded-full px-4 py-2 text-[11px] text-amber-400 shadow-lg">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Nie znaleziono „{query}"
          </div>
        )}
        {mode === 'roads' && searchState === 'error' && (
          <div className="flex items-center gap-2 bg-surface-950/95 backdrop-blur-sm border border-red-800/40 rounded-full px-4 py-2 text-[11px] text-red-400 shadow-lg">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {roadsError}
          </div>
        )}
        {mode === 'navigate' && navState === 'error' && (
          <div className="flex items-center gap-2 bg-surface-950/95 backdrop-blur-sm border border-red-800/40 rounded-full px-4 py-2 text-[11px] text-red-400 shadow-lg">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {navError}
          </div>
        )}

        {/* Navigate suggestions */}
        {mode === 'navigate' && suggestions.length > 0 && (
          <div className="bg-surface-950/97 backdrop-blur-md border border-slate-700/30 rounded-2xl overflow-hidden shadow-2xl">
            {suggestions.map((p, i) => (
              <button
                key={i}
                onClick={() => pickSuggestion(p)}
                className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-slate-800/40 last:border-0"
              >
                <div className="text-[12px] font-medium text-slate-100 truncate">
                  {p.display_name.split(',')[0]}
                </div>
                <div className="text-[10px] text-slate-500 truncate mt-0.5">
                  {p.display_name.split(',').slice(1, 3).join(',').trim()}
                </div>
              </button>
            ))}
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

      {/* Grid label toast */}
      <div className={cn(
        'absolute bottom-[5.5rem] right-14 z-[1000]',
        'flex items-center gap-2 px-3 py-2 rounded-xl shadow-lg',
        'bg-surface-900/95 border border-slate-700/60 backdrop-blur-sm',
        'text-[12px] text-slate-200 whitespace-nowrap pointer-events-none',
        'transition-all duration-300',
        gridToast ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2',
      )}>
        <Milestone className="w-3.5 h-3.5 text-brand-400 shrink-0" />
        Granice oddziału
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
        </div>
      )}

      {/* Grid + GPS + Follow buttons */}
      <div className="absolute bottom-5 right-3 z-[1000] flex flex-col items-end gap-2">
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
          onClick={() => setShowGrid(v => !v)}
          title={showGrid ? 'Ukryj podział powierzchniowy' : 'Pokaż podział powierzchniowy'}
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center shadow-lg border transition-colors',
            showGrid
              ? 'bg-brand-600 text-white border-brand-500'
              : 'bg-surface-900/90 text-slate-400 border-slate-700/60 backdrop-blur-sm hover:text-slate-200',
          )}
        >
          {gridLoading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Milestone className="w-4 h-4" />}
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

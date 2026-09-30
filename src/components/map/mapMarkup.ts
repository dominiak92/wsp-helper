// Leaflet DivIcons and popup HTML for FireMapPage. Popup buttons call back into
// React through the window.__wsp* globals registered by the page.
// Imports Leaflet — only import from the lazily-loaded FireMapPage chunk.
import L from 'leaflet'
import { KIND_META, type MapFeature, type FeatureKind } from '../../lib/mapFeatures'
import type { AlertPoint } from '../../lib/liveMap'
import { escapeHtml, encodeJsArg } from '../../lib/html'

// Strzałka pozycji w trybie nawigacji — zawsze „w górę" ekranu = kierunek jazdy
// (mapa obraca się pod nią, a markery leaflet-rotate pozostają wyprostowane do ekranu)
export function navArrowIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html:
      '<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center">' +
      '<svg viewBox="0 0 24 24" width="30" height="30" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))">' +
      '<path d="M12 2 L20 21 L12 16 L4 21 Z" fill="#3b82f6" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>' +
      '</svg></div>',
    iconSize: [32, 32], iconAnchor: [16, 16],
  })
}

export function makeFeatureIcon(kind: FeatureKind, confirmed: boolean, icon?: string | null): L.DivIcon {
  const meta = KIND_META[kind]
  const emoji = escapeHtml(icon || meta.emoji)
  const ring = confirmed ? meta.color : '#f59e0b'
  const dash = confirmed ? '' : 'border-style:dashed;'
  const op = confirmed ? '1' : '0.72'
  return L.divIcon({
    className: '',
    html:
      `<div style="opacity:${op};width:30px;height:30px;display:flex;align-items:center;` +
      `justify-content:center;background:rgba(8,15,30,0.88);border:2px solid ${ring};${dash}` +
      `border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.5);font-size:15px;line-height:1">${emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  })
}

// Ikona klastra (grupa nakładających się znaczników) — ciemne kółko z liczbą
export function makeClusterIcon(count: number): L.DivIcon {
  const size = count < 10 ? 36 : count < 100 ? 42 : 48
  return L.divIcon({
    className: '',
    html:
      `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;` +
      `justify-content:center;background:rgba(8,15,30,0.92);border:2px solid #38bdf8;` +
      `border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,.55);color:#e2e8f0;` +
      `font-size:13px;font-weight:700;font-family:sans-serif;line-height:1">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

export function featurePopupHtml(f: MapFeature, lat: number, lng: number): string {
  const safeName = encodeJsArg(f.label)
  const desc = f.description
    ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">${escapeHtml(f.description)}</div>`
    : ''
  const warn = f.confirmed
    ? ''
    : `<div style="font-size:10px;color:#fbbf24;margin-top:4px">⚠ pozycja przybliżona</div>`
  return [
    '<div style="font-family:sans-serif;min-width:180px">',
    `<div style="font-size:13px;font-weight:600;color:#f1f5f9;line-height:1.35">${KIND_META[f.kind].emoji} ${escapeHtml(f.label)}</div>`,
    desc, warn,
    '<div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(100,116,139,0.2)">',
    `<button onclick="window.__wspNavigateTo(${lat},${lng},decodeURIComponent('${safeName}'),'gps')" ` +
      'style="width:100%;padding:6px 10px;border-radius:12px;border:none;font-size:11px;font-family:sans-serif;' +
      'font-weight:500;cursor:pointer;text-align:left;background:rgba(59,130,246,0.2);color:#93c5fd">' +
      'Nawiguj z mojej pozycji</button>',
    '</div></div>',
  ].join('')
}

export function alertPopupHtml(a: AlertPoint): string {
  const safe = encodeJsArg(a.description)
  const exp = new Date(a.expiresAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
  const meta = `wygasa o ${exp}${a.createdBy ? ' · ' + escapeHtml(a.createdBy) : ''}`
  const btn = (onclick: string, label: string, bg: string, color: string) =>
    `<button onclick="${onclick}" style="width:100%;padding:6px 10px;border-radius:12px;border:none;` +
    `font-size:11px;font-family:sans-serif;font-weight:500;cursor:pointer;text-align:left;` +
    `background:${bg};color:${color}">${label}</button>`
  return [
    '<div style="font-family:sans-serif;min-width:190px">',
    `<div style="font-size:13px;font-weight:600;color:#f1f5f9;line-height:1.35">${escapeHtml(a.description)}</div>`,
    `<div style="font-size:10px;color:#64748b;margin-top:3px">${meta}</div>`,
    '<div style="display:flex;flex-direction:column;gap:5px;margin-top:10px;padding-top:8px;border-top:1px solid rgba(100,116,139,0.2)">',
    btn(`window.__wspNavigateTo(${a.lat},${a.lng},decodeURIComponent('${safe}'),'gps')`,
      'Nawiguj z mojej pozycji', 'rgba(59,130,246,0.2)', '#93c5fd'),
    btn(`window.__wspDeleteAlert('${encodeJsArg(a.id)}')`, 'Usuń punkt', 'rgba(239,68,68,0.18)', '#fca5a5'),
    '</div></div>',
  ].join('')
}

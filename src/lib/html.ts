// Helpers for building HTML strings (Leaflet popups/tooltips take raw HTML).
// Anything user-, DB- or API-provided must go through these before interpolation.

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => HTML_ESCAPES[c])
}

// Encode text for a single-quoted JS string inside an inline handler, decoded with
// decodeURIComponent(...). Plain encodeURIComponent leaves ' ( ) * ! ~ untouched,
// and a bare ' would break out of the string literal.
export function encodeJsArg(value: unknown): string {
  return encodeURIComponent(String(value ?? '')).replace(
    /[!'()*~]/g,
    c => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  )
}

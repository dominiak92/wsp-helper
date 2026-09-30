import { describe, it, expect } from 'vitest'
import { escapeHtml, encodeJsArg } from './html'

describe('escapeHtml', () => {
  it('neutralises markup', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
    expect(escapeHtml("Rock & 'roll'")).toBe('Rock &amp; &#39;roll&#39;')
  })

  it('handles null/undefined and non-strings', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(42)).toBe('42')
  })
})

describe('encodeJsArg', () => {
  it('cannot break out of a single-quoted JS string and round-trips', () => {
    const evil = "x');alert(1);('"
    const encoded = encodeJsArg(evil)
    expect(encoded).not.toMatch(/['"<>()]/)
    expect(decodeURIComponent(encoded)).toBe(evil)
  })

  it('keeps Polish characters intact after decoding', () => {
    expect(decodeURIComponent(encodeJsArg('Jezioro Łąkie'))).toBe('Jezioro Łąkie')
  })
})

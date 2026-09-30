import { describe, it, expect } from 'vitest'
import { parseTraxHtml, slotForReading, missingSlot, warsawNow, decodeISO88592 } from './trax.js'

// Trimmed from the real zbiorcza.php page (2026-09-30)
const HTML = `
Stopień Zagrożenia Pożarowego Lasu (przedstawiony na mapie i w tabeli) został wyznaczony na podstawie danych z <b>2026-09-30 13:00.</b><br><br><table><tr>
<tr><td class=r0><a href=stacja.php?idst=431 target=_blank>Smolarz (Klesno)</a></td><td class=r1>-</td><td class=r1>23.94</td><td class=r1>43.4</td><td class=r1>0</td><td class=r1>2.6</td><td class=r1>129</td></tr>
<tr><td bgcolor=yellow colspan=7 align=right><span><b>Strefa 10_E</b></span> - uśredniony stopień zagrożenia pożarowego dla strefy:</td>
<td class=r2 align=center bgcolor=yellow rowspan=2><b>2 - ŚREDNIE</b></td><td class=r2 align=center bgcolor=yellow rowspan=2><b>3 - DUŻE</b></td></tr>
<tr><td class=r0><a href=stacja.php?idst=1946 target=_blank>Rzepin LBL</a></td><td class=r1>14.8</td><td class=r1>20.39</td><td class=r1>51</td><td class=r1>0</td><td class=r1>2.3</td><td class=r1>112</td></tr>
<tr><td bgcolor=#00FF00 colspan=7><b>Strefa 10_F</b></td><td class=r2><b>1 - MAŁE</b></td><td class=r2><b>1 - MAŁE</b></td></tr>
`

describe('parseTraxHtml', () => {
  it('reads the Rzepin LBL row, its zone threat and the measurement time', () => {
    expect(parseTraxHtml(HTML)).toEqual({
      moisture: '14.8',
      temperature: '20.39',
      humidity: '51',
      precipitation: '0',
      windSpeed: '2.3',
      windDir: 'E', // 112° → E
      fireThreat: '2 - ŚREDNIE',
      fireThreatForecast: '3 - DUŻE',
      updatedAt: '2026-09-30 13:00',
    })
  })

  it('fails loudly when the station row disappears', () => {
    expect(() => parseTraxHtml('<html>maintenance</html>')).toThrow(/Rzepin/)
  })
})

describe('decodeISO88592', () => {
  it('decodes Polish letters from the source encoding', () => {
    expect(decodeISO88592(Uint8Array.from([0xa6, 0xa3, 0xea]))).toBe('ŚŁę')
  })
})

describe('slotForReading', () => {
  it('picks the slot from the measurement hour, not the run time', () => {
    expect(slotForReading({ updatedAt: '2026-09-30 09:00' })).toBe('morning')
    expect(slotForReading({ updatedAt: '2026-09-30 13:00' })).toBe('afternoon')
    expect(slotForReading({ updatedAt: null })).toBeNull()
  })
})

describe('missingSlot (Europe/Warsaw)', () => {
  // 2026-09-30 is CEST (UTC+2)
  const at = (hhmmUtc) => new Date(`2026-09-30T${hhmmUtc}:00Z`)
  const today = (hhmm) => ({ updatedAt: `2026-09-30 ${hhmm}` })
  const yesterday = { updatedAt: '2026-09-29 13:00' }

  it('waits until 09:00 local', () => {
    expect(missingSlot({ afternoon: yesterday }, at('06:30'))).toBeNull() // 08:30
    expect(missingSlot({ afternoon: yesterday }, at('07:05'))).toBe('morning') // 09:05
  })

  it('asks for the afternoon reading from 13:00 local, even if the morning one was missed', () => {
    expect(missingSlot({ morning: today('09:00') }, at('10:30'))).toBeNull() // 12:30
    expect(missingSlot({ morning: today('09:00') }, at('11:05'))).toBe('afternoon') // 13:05
    expect(missingSlot({}, at('11:05'))).toBe('afternoon')
  })

  it('is done once both of today’s readings are cached', () => {
    expect(missingSlot({ morning: today('09:00'), afternoon: today('13:00') }, at('14:00'))).toBeNull()
  })

  it('reports the Warsaw date/time regardless of server timezone', () => {
    expect(warsawNow(new Date('2026-09-30T22:30:00Z'))).toEqual({ date: '2026-10-01', minutes: 30 })
    expect(warsawNow(new Date('2026-12-01T08:00:00Z'))).toEqual({ date: '2026-12-01', minutes: 9 * 60 }) // CET
  })
})

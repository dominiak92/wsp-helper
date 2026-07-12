import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, ArrowRight, RefreshCw, CalendarClock } from 'lucide-react'
import { cn } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { ymdKey, isDutyDayKey, isBillingStartKey, billingPeriodStartKey, addDaysKey, formatDateShort } from '../lib/duty'
import {
  HourCode, HOUR_CODES, HOUR_CODE_LABELS, HOUR_CODE_SHORT, codeHours, isWorkedCode, NORM,
} from '../lib/hours'
import { fetchWorkHours, setWorkHour, importFromAssignments } from '../lib/workHours'
import { SOLDIER_RANKS, civilianFunction, type RoleType } from '../lib/crew'

interface Member {
  id: string
  name: string
  rank: string | null
  isSoldier: boolean
  roles: RoleType[]
}

// Etykieta stopnia/funkcji pokazywana w grafiku
function rankLabel(m: Member): string {
  return m.isSoldier ? (m.rank ?? '') : civilianFunction(m.roles)
}

// Klucz sortowania: żołnierze wg stopnia (najwyższy u góry) → ratownicy → kier. rat.
function rankSortKey(m: Member): [number, number, string] {
  if (m.isSoldier) {
    const idx = SOLDIER_RANKS.indexOf(m.rank as typeof SOLDIER_RANKS[number])
    return [0, idx < 0 ? SOLDIER_RANKS.length : idx, m.name]
  }
  return [1, m.roles.includes('DRIVER_RESCUER') ? 1 : 0, m.name]
}

const MONTHS_NOM = [
  'STYCZEŃ', 'LUTY', 'MARZEC', 'KWIECIEŃ', 'MAJ', 'CZERWIEC',
  'LIPIEC', 'SIERPIEŃ', 'WRZESIEŃ', 'PAŹDZIERNIK', 'LISTOPAD', 'GRUDZIEŃ',
]
const ROMAN = ['I', 'II', 'III', 'IV']

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate()
}

export function SchedulePage() {
  const [members, setMembers] = useState<Member[]>([])
  const [entries, setEntries] = useState<Record<string, Record<string, HourCode>>>({})
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [editing, setEditing] = useState<{ personId: string; date: string; x: number; y: number } | null>(null)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3)) // 0..3

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('personnel').select('id, name, rank, is_soldier, roles'),
      fetchWorkHours(),
    ]).then(([{ data: pData }, map]) => {
      if (cancelled) return
      const list: Member[] = (pData ?? []).map(r => ({
        id: r.id, name: r.name, rank: r.rank ?? null, isSoldier: !!r.is_soldier, roles: (r.roles ?? []) as RoleType[],
      }))
      // Żołnierze wg stopnia (najwyższy u góry) → ratownicy cywile → kier. rat. cywile
      list.sort((a, b) => {
        const ka = rankSortKey(a), kb = rankSortKey(b)
        return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2], 'pl')
      })
      setMembers(list)
      setEntries(map)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const months = [quarter * 3, quarter * 3 + 1, quarter * 3 + 2]

  function setEntry(personId: string, date: string, code: HourCode | null) {
    setEntries(prev => {
      const next = { ...prev }
      const forPerson = { ...(next[personId] ?? {}) }
      if (code) forPerson[date] = code; else delete forPerson[date]
      next[personId] = forPerson
      return next
    })
    setWorkHour(personId, date, code)
  }

  async function handleImport() {
    if (!confirm('Uzupełnić grafik na podstawie zapisanych obsad? Nadpisze wpisy tylko w dniach, które mają obsadę.')) return
    setImporting(true)
    try {
      const rows = await importFromAssignments()
      setEntries(prev => {
        const next = { ...prev }
        for (const r of rows) next[r.person_id] = { ...(next[r.person_id] ?? {}), [r.date]: r.code }
        return next
      })
    } catch {
      alert('Import nie powiódł się — spróbuj ponownie.')
    } finally {
      setImporting(false)
    }
  }

  function shiftQuarter(dir: -1 | 1) {
    let q = quarter + dir
    let y = year
    if (q < 0) { q = 3; y-- }
    if (q > 3) { q = 0; y++ }
    setQuarter(q)
    setYear(y)
  }

  return (
    <div className="flex flex-col h-full bg-surface-950" onClick={() => editing && setEditing(null)}>
      {/* Toolbar (ciemny) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-6 py-3 border-b border-slate-800 shrink-0 print:hidden">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-white">Grafik godzinowy</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => shiftQuarter(-1)} className="p-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-400 hover:text-white transition-colors" title="Poprzedni kwartał">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-brand-300 font-medium min-w-[7rem] text-center">{ROMAN[quarter]} kwartał {year}</span>
            <button onClick={() => shiftQuarter(1)} className="p-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-400 hover:text-white transition-colors" title="Następny kwartał">
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 disabled:opacity-60 text-white transition-colors"
            title="Uzupełnij grafik na podstawie zapisanych obsad"
          >
            {importing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Z obsad</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-3 sm:p-6 print:p-0">
          {/* Podsumowanie żołnierzy — okresy 28-dniowe */}
          <SoldierSummary year={year} quarter={quarter} members={members} entries={entries} />

          {/* Arkusz (jasny, jak na papierze) */}
          <div className="inline-block min-w-full bg-white text-slate-900 rounded-lg shadow-xl print:shadow-none">
            {/* Nagłówek arkusza */}
            <div className="px-3 py-2 border-b-2 border-slate-800">
              <h2 className="text-sm sm:text-base font-bold tracking-tight">
                HARMONOGRAM GODZINOWY II ZMIANY WSP za {ROMAN[quarter]} kwartał {year} r.
              </h2>
            </div>

            {months.map((m, i) => (
              <MonthBlock
                key={m}
                year={year}
                month0={m}
                members={members}
                entries={entries}
                onCell={(personId, date, e) => {
                  e.stopPropagation()
                  setEditing({ personId, date, x: e.clientX, y: e.clientY })
                }}
                last={i === months.length - 1}
              />
            ))}
          </div>
        </div>
      )}

      {/* Menu wyboru kodu */}
      {editing && (
        <div
          className="fixed z-50 rounded-lg border border-slate-700 bg-surface-900 shadow-2xl p-1 flex flex-col print:hidden"
          style={{ left: Math.min(editing.x, window.innerWidth - 180), top: Math.min(editing.y, window.innerHeight - 320) }}
          onClick={e => e.stopPropagation()}
        >
          {HOUR_CODES.map(c => (
            <button
              key={c}
              onClick={() => { setEntry(editing.personId, editing.date, c); setEditing(null) }}
              className="text-left text-xs px-2 py-1.5 rounded hover:bg-surface-700 flex items-center gap-2"
            >
              <span className="w-7 text-center rounded border border-slate-600 text-[11px] font-semibold text-slate-200">{HOUR_CODE_SHORT[c]}</span>
              <span className="text-slate-300">{HOUR_CODE_LABELS[c]}</span>
            </button>
          ))}
          <button
            onClick={() => { setEntry(editing.personId, editing.date, null); setEditing(null) }}
            className="text-left text-xs px-2 py-1.5 rounded hover:bg-surface-700 text-slate-500 border-t border-slate-800 mt-1"
          >
            Wyczyść
          </button>
        </div>
      )}
    </div>
  )
}

function MonthBlock({ year, month0, members, entries, onCell, last }: {
  year: number
  month0: number
  members: Member[]
  entries: Record<string, Record<string, HourCode>>
  onCell: (personId: string, date: string, e: React.MouseEvent) => void
  last: boolean
}) {
  const n = daysInMonth(year, month0)
  const days = useMemo(() => Array.from({ length: n }, (_, i) => ymdKey(year, month0, i + 1)), [year, month0, n])
  const firstSoldierBreak = members.findIndex(m => !m.isSoldier)

  return (
    <div className={cn(!last && 'border-b-2 border-slate-800')}>
      <table className="border-collapse text-[11px] w-full">
        <thead>
          {/* Wiersz z nazwą miesiąca + GODZINY */}
          <tr className="bg-slate-100">
            <th className="sticky left-0 z-20 bg-slate-100 border border-slate-400 px-2 py-1 text-left font-semibold w-32 min-w-[8rem] sm:w-44 sm:min-w-[11rem]">Imię i nazwisko</th>
            <th className="border border-slate-400 px-1 py-1 text-center font-bold uppercase" colSpan={n}>
              {MONTHS_NOM[month0]}
            </th>
            <th className="border border-slate-400 px-1 py-1 text-center font-semibold" colSpan={3}>GODZINY</th>
          </tr>
          {/* Numery dni + ZAPL/URL/SUMA — przyklejone u góry przy przewijaniu */}
          <tr>
            <th className="sticky left-0 top-0 z-30 bg-slate-200 border border-slate-400 px-1 py-0.5 text-center font-bold text-slate-700">
              {MONTHS_NOM[month0].slice(0, 3)}
            </th>
            {days.map(d => {
              const dd = Number(d.slice(8))
              return (
                <th
                  key={d}
                  className={cn(
                    'sticky top-0 z-20 border border-slate-400 w-6 min-w-[1.5rem] text-center font-medium',
                    isBillingStartKey(d) ? 'bg-yellow-300' : 'bg-slate-50',
                    isDutyDayKey(d) && !isBillingStartKey(d) && 'text-emerald-700',
                  )}
                >
                  {dd}
                </th>
              )
            })}
            <th className="sticky top-0 z-20 bg-slate-50 border border-slate-400 px-1 text-center font-semibold w-12">ZAPL.</th>
            <th className="sticky top-0 z-20 bg-slate-50 border border-slate-400 px-1 text-center font-semibold w-12">URL.</th>
            <th className="sticky top-0 z-20 bg-slate-50 border border-slate-400 px-1 text-center font-semibold w-12">SUMA</th>
          </tr>
        </thead>
        <tbody>
          {members.map((mem, idx) => {
            const forPerson = entries[mem.id] ?? {}
            let zapl = 0, url = 0
            for (const d of days) {
              const code = forPerson[d]
              if (!code) continue
              if (isWorkedCode(code)) zapl += codeHours(code)
              else url += codeHours(code)
            }
            const suma = zapl + url
            const soldierDivider = idx === firstSoldierBreak && firstSoldierBreak > 0
            return (
              <tr
                key={mem.id}
                className={cn('group hover:bg-brand-100/70', soldierDivider && 'border-t-2 border-t-slate-800')}
              >
                <td className="sticky left-0 z-10 bg-white border border-slate-400 px-1 py-0.5 group-hover:bg-brand-100">
                  <div className="flex items-center gap-1.5">
                    <span className="w-12 shrink-0 text-[10px] italic text-slate-500 truncate">{rankLabel(mem)}</span>
                    <span className="font-medium truncate">{mem.name}</span>
                  </div>
                </td>
                {days.map(d => {
                  const code = forPerson[d]
                  return (
                    <td
                      key={d}
                      onClick={e => onCell(mem.id, d, e)}
                      className={cn(
                        'border border-slate-400 text-center cursor-pointer h-6 hover:!bg-brand-300',
                        isBillingStartKey(d) && 'bg-yellow-200',
                        code && (isWorkedCode(code) ? 'font-semibold' : 'text-amber-700 bg-amber-50'),
                      )}
                    >
                      {code ? HOUR_CODE_SHORT[code] : ''}
                    </td>
                  )
                })}
                <td className="border border-slate-400 text-center font-semibold group-hover:bg-brand-100">{mem.isSoldier ? '' : (zapl || '')}</td>
                <td className="border border-slate-400 text-center text-amber-700 group-hover:bg-brand-100">{mem.isSoldier ? '' : (url || '')}</td>
                <td className="border border-slate-400 text-center font-bold group-hover:bg-brand-100">{mem.isSoldier ? '' : (suma || '')}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Podsumowanie żołnierzy: suma godzin per 28-dniowy okres rozliczeniowy vs norma 160h.
function SoldierSummary({ year, quarter, members, entries }: {
  year: number
  quarter: number
  members: Member[]
  entries: Record<string, Record<string, HourCode>>
}) {
  const soldiers = members.filter(m => m.isSoldier)
  const periods = useMemo(() => {
    const lastMonth = quarter * 3 + 2
    const qEnd = ymdKey(year, lastMonth, daysInMonth(year, lastMonth))
    const out: string[] = []
    let s = billingPeriodStartKey(ymdKey(year, quarter * 3, 1))
    for (let g = 0; g < 20 && s <= qEnd; g++) { out.push(s); s = addDaysKey(s, 28) }
    return out
  }, [year, quarter])

  if (soldiers.length === 0) return null

  function periodSum(personId: string, start: string): number {
    let total = 0
    for (let i = 0; i < 28; i++) {
      const c = entries[personId]?.[addDaysKey(start, i)]
      if (c) total += codeHours(c)
    }
    return total
  }

  return (
    <div className="mb-5 rounded-lg border border-slate-800 bg-surface-900 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-800">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
          Rozliczenie żołnierzy — okresy 28-dniowe (norma {NORM}h)
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface-900 text-left font-semibold text-slate-400 px-3 py-1.5 min-w-[9rem]">Żołnierz</th>
              {periods.map(p => (
                <th key={p} className="px-3 py-1.5 text-center font-semibold text-brand-300 border-l border-slate-800 whitespace-nowrap">
                  {formatDateShort(p)} – {formatDateShort(addDaysKey(p, 27))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {soldiers.map(mem => (
              <tr key={mem.id} className="border-t border-slate-800/70">
                <td className="sticky left-0 z-10 bg-surface-900 px-3 py-1.5 text-white whitespace-nowrap">
                  {mem.rank && <span className="text-slate-500 italic mr-1 text-[11px]">{mem.rank}</span>}
                  {mem.name}
                </td>
                {periods.map(p => {
                  const total = periodSum(mem.id, p)
                  const diff = total - NORM
                  const cls = total === NORM ? 'text-emerald-400' : total > NORM ? 'text-amber-400' : 'text-red-400'
                  return (
                    <td key={p} className="px-3 py-1.5 text-center border-l border-slate-800">
                      <span className={cn('font-semibold', cls)}>{total}</span>
                      <span className="text-slate-600"> / {NORM}</span>
                      <span className={cn('ml-1 text-[11px]', diff === 0 ? 'text-slate-500' : diff > 0 ? 'text-amber-400' : 'text-red-400')}>
                        {diff > 0 ? `+${diff}` : diff}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

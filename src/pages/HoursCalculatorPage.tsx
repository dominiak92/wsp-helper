import { useState, useEffect, useMemo, useCallback } from 'react'
import { ArrowLeft, ArrowRight, Shield, Info, RefreshCw, CalendarClock } from 'lucide-react'
import { cn } from '../lib/utils'
import { supabase } from '../lib/supabase'
import {
  ymdKey, todayYmdKey, addDaysKey, billingPeriodStartKey,
  isDutyDayKey, isBillingStartKey, formatDateShort, MONTHS_GEN,
} from '../lib/duty'
import {
  HourCode, HOUR_CODES, HOUR_CODE_LABELS, HOUR_CODE_SHORT, HOUR_CODE_CELL_CLASS,
  NORM, computePeriods, periodStatFor,
} from '../lib/hours'
import { fetchWorkHours, setWorkHour, importFromAssignments } from '../lib/workHours'

type ViewMode = 'okres' | 'miesiac' | 'kwartal'

interface Soldier {
  id: string
  name: string
  seed: number
}

// Wszystkie klucze dni w zakresie [start, end] (włącznie)
function daysInRange(start: string, end: string): string[] {
  const out: string[] = []
  let cur = start
  for (let g = 0; g < 400 && cur <= end; g++) {
    out.push(cur)
    cur = addDaysKey(cur, 1)
  }
  return out
}

// Zakres widoku dla danego trybu i kotwicy
function rangeFor(mode: ViewMode, anchor: string): { start: string; end: string } {
  if (mode === 'okres') {
    const start = billingPeriodStartKey(anchor)
    return { start, end: addDaysKey(start, 27) }
  }
  if (mode === 'kwartal') {
    const start = billingPeriodStartKey(anchor)
    return { start, end: addDaysKey(start, 83) } // 3 okresy 28-dniowe
  }
  // miesiąc kalendarzowy
  const [y, m] = anchor.split('-').map(Number)
  const start = ymdKey(y, m - 1, 1)
  const lastDay = new Date(y, m, 0).getDate()
  const end = ymdKey(y, m - 1, lastDay)
  return { start, end }
}

// Początki wszystkich okresów rozliczeniowych przecinających zakres
function periodsInRange(start: string, end: string): string[] {
  const out: string[] = []
  let cur = billingPeriodStartKey(start)
  for (let g = 0; g < 60 && cur <= end; g++) {
    out.push(cur)
    cur = addDaysKey(cur, 28)
  }
  return out
}

function periodLabel(start: string): string {
  return `${formatDateShort(start)} – ${formatDateShort(addDaysKey(start, 27))}`
}

function rangeLabel(mode: ViewMode, anchor: string): string {
  const { start, end } = rangeFor(mode, anchor)
  if (mode === 'miesiac') {
    const [y, m] = anchor.split('-').map(Number)
    return `${MONTHS_GEN[m - 1]} ${y}`
  }
  return `${formatDateShort(start)} – ${formatDateShort(end)}`
}

export function HoursCalculatorPage() {
  const [soldiers, setSoldiers] = useState<Soldier[]>([])
  const [entries, setEntries] = useState<Record<string, Record<string, HourCode>>>({})
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('okres')
  const [anchor, setAnchor] = useState<string>(() => todayYmdKey())
  const [editing, setEditing] = useState<{ personId: string; date: string; x: number; y: number } | null>(null)
  const [importing, setImporting] = useState(false)

  // Wczytaj żołnierzy + wszystkie wpisy godzin (dane są niewielkie).
  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('personnel').select('id, name, is_soldier, hours_seed').eq('is_soldier', true).order('name'),
      fetchWorkHours(),
    ]).then(([{ data: pData }, map]) => {
      if (cancelled) return
      setSoldiers((pData ?? []).map(r => ({ id: r.id, name: r.name, seed: r.hours_seed ?? 0 })))
      setEntries(map)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  async function handleImport() {
    if (!confirm('Uzupełnić godziny na podstawie zapisanych obsad? Nadpisze wpisy tylko w dniach, które mają obsadę.')) return
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

  const { start, end } = useMemo(() => rangeFor(viewMode, anchor), [viewMode, anchor])
  const days = useMemo(() => daysInRange(start, end), [start, end])
  const periods = useMemo(() => periodsInRange(start, end), [start, end])
  const today = todayYmdKey()
  const lastNeededStart = periods[periods.length - 1] ?? billingPeriodStartKey(anchor)

  // Saldo narastające per żołnierz (liczone z pełnej historii wpisów)
  const statsBySoldier = useMemo(() => {
    const out: Record<string, ReturnType<typeof computePeriods>> = {}
    for (const s of soldiers) {
      out[s.id] = computePeriods(entries[s.id] ?? {}, s.seed, lastNeededStart)
    }
    return out
  }, [soldiers, entries, lastNeededStart])

  function shift(dir: -1 | 1) {
    if (viewMode === 'miesiac') {
      const [y, m] = anchor.split('-').map(Number)
      const d = new Date(y, m - 1 + dir, 1)
      setAnchor(ymdKey(d.getFullYear(), d.getMonth(), 1))
    } else {
      const step = viewMode === 'kwartal' ? 84 : 28
      setAnchor(addDaysKey(billingPeriodStartKey(anchor), dir * step))
    }
  }

  const setEntry = useCallback((personId: string, date: string, code: HourCode | null) => {
    setEntries(prev => {
      const next = { ...prev }
      const forPerson = { ...(next[personId] ?? {}) }
      if (code) forPerson[date] = code
      else delete forPerson[date]
      next[personId] = forPerson
      return next
    })
    setWorkHour(personId, date, code)
  }, [])

  function saveSeed(personId: string, seed: number) {
    setSoldiers(prev => prev.map(s => s.id === personId ? { ...s, seed } : s))
    supabase.from('personnel').update({ hours_seed: seed }).eq('id', personId)
      .then(({ error }) => { if (error) console.error('[supabase] update hours_seed:', error) })
  }

  return (
    <div className="flex flex-col h-full" onClick={() => editing && setEditing(null)}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-6 py-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-5 h-5 text-emerald-400 shrink-0" fill="currentColor" />
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-white">Kalkulator godzin</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Rozliczenie 28-dniowe · norma <span className="text-emerald-400 font-medium">{NORM}h</span> · tylko żołnierze
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Przełącznik trybu */}
          <div className="flex rounded-lg border border-slate-700 overflow-hidden">
            {([['okres', 'Okres'], ['miesiac', 'Miesiąc'], ['kwartal', 'Kwartał']] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={cn(
                  'text-xs px-3 py-1.5 transition-colors',
                  viewMode === m ? 'bg-brand-600 text-white' : 'bg-surface-800 text-slate-400 hover:text-white',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Nawigacja */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => shift(-1)}
              className="p-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-400 hover:text-white transition-colors"
              title="Poprzedni"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-brand-300 font-medium min-w-[8rem] text-center">{rangeLabel(viewMode, anchor)}</span>
            <button
              onClick={() => shift(1)}
              className="p-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-400 hover:text-white transition-colors"
              title="Następny"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => setAnchor(todayYmdKey())}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-400 hover:text-white transition-colors"
          >
            Dziś
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 disabled:opacity-60 text-white transition-colors"
            title="Uzupełnij godziny na podstawie zapisanych obsad"
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
      ) : soldiers.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-slate-600 gap-3 px-6 text-center">
          <Shield className="w-12 h-12 opacity-20" />
          <p className="text-sm font-medium text-slate-400">Brak żołnierzy</p>
          <p className="text-xs text-slate-600 max-w-sm">
            Oznacz osoby jako „Żołnierz" w <span className="text-brand-400">Tworzeniu obsady</span> (edycja osoby → przycisk „Żołnierz"),
            aby pojawiły się w kalkulatorze.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-8">
          {/* ── Siatka dni ─────────────────────────────────────────── */}
          <div className="overflow-x-auto">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-surface-950 text-left font-semibold text-slate-500 px-2 py-1 min-w-[9rem]">
                    Żołnierz
                  </th>
                  {days.map(d => {
                    const [, , dd] = d.split('-').map(Number)
                    const duty = isDutyDayKey(d)
                    const periodStart = isBillingStartKey(d)
                    return (
                      <th
                        key={d}
                        className={cn(
                          'px-0 py-1 text-center font-medium w-8 min-w-[2rem]',
                          duty ? 'text-emerald-400' : 'text-slate-600',
                          d === today && 'bg-brand-900/30',
                          periodStart && 'border-l-2 border-amber-500',
                        )}
                        title={duty ? 'Dzień służbowy' : undefined}
                      >
                        {dd}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {soldiers.map(s => (
                  <tr key={s.id} className="border-t border-slate-800/70">
                    <td className="sticky left-0 z-10 bg-surface-950 text-white font-medium px-2 py-1 min-w-[9rem] truncate">
                      {s.name}
                    </td>
                    {days.map(d => {
                      const code = entries[s.id]?.[d]
                      const duty = isDutyDayKey(d)
                      const periodStart = isBillingStartKey(d)
                      const warn = code === '24' && !duty
                      return (
                        <td
                          key={d}
                          className={cn(
                            'p-0.5 text-center',
                            periodStart && 'border-l-2 border-amber-500',
                            d === today && 'bg-brand-900/20',
                          )}
                        >
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              setEditing({ personId: s.id, date: d, x: e.clientX, y: e.clientY })
                            }}
                            className={cn(
                              'w-7 h-7 rounded border text-[11px] font-semibold leading-none transition-colors',
                              code
                                ? HOUR_CODE_CELL_CLASS[code]
                                : duty
                                  ? 'border-emerald-800/40 bg-emerald-950/20 text-slate-600 hover:border-slate-500'
                                  : 'border-slate-800 text-slate-700 hover:border-slate-600',
                              warn && 'ring-1 ring-amber-500',
                            )}
                            title={warn ? '24h wpisane w dniu nie-służbowym' : undefined}
                          >
                            {code ? HOUR_CODE_SHORT[code] : ''}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legenda */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded border border-amber-500" /> początek okresu (żółty)</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded border border-emerald-800 bg-emerald-950/40" /> dzień służbowy</span>
            {HOUR_CODES.map(c => (
              <span key={c} className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded border', HOUR_CODE_CELL_CLASS[c])}>
                {HOUR_CODE_SHORT[c]} = {HOUR_CODE_LABELS[c]}
              </span>
            ))}
          </div>

          {/* ── Podsumowanie okresów ───────────────────────────────── */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Info className="w-3.5 h-3.5 text-slate-500" />
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                Podsumowanie okresów rozliczeniowych
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="border-collapse text-xs">
                <thead>
                  <tr>
                    <th rowSpan={2} className="sticky left-0 z-10 bg-surface-950 text-left font-semibold text-slate-500 px-2 py-1 min-w-[9rem] align-bottom">
                      Żołnierz
                    </th>
                    <th rowSpan={2} className="px-2 py-1 text-center font-semibold text-slate-500 align-bottom" title="Saldo przeniesione na start śledzenia">
                      Saldo pocz.
                    </th>
                    {periods.map(p => (
                      <th key={p} colSpan={3} className="px-2 py-1 text-center font-semibold text-brand-300 border-l border-slate-700">
                        {periodLabel(p)}
                      </th>
                    ))}
                  </tr>
                  <tr className="text-[10px] text-slate-500">
                    {periods.map(p => (
                      <FragmentCols key={p} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {soldiers.map(s => (
                    <tr key={s.id} className="border-t border-slate-800/70">
                      <td className="sticky left-0 z-10 bg-surface-950 text-white font-medium px-2 py-1 min-w-[9rem] truncate">
                        {s.name}
                      </td>
                      <td className="px-1 py-1 text-center">
                        <input
                          type="number"
                          defaultValue={s.seed}
                          onBlur={e => {
                            const v = Math.round(Number(e.target.value) || 0)
                            if (v !== s.seed) saveSeed(s.id, v)
                          }}
                          className="w-14 text-center text-xs bg-surface-900 border border-slate-700 rounded px-1 py-0.5 text-slate-300 outline-none focus:border-brand-500"
                        />
                      </td>
                      {periods.map(p => {
                        const st = periodStatFor(statsBySoldier[s.id], p, s.seed)
                        const ok = st.worked === NORM
                        const over = st.worked > NORM
                        return (
                          <FragmentStat
                            key={p}
                            worked={st.worked}
                            diff={st.diff}
                            cumulative={st.cumulative}
                            ok={ok}
                            over={over}
                          />
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-600 mt-2 max-w-2xl">
              <span className="text-slate-400">Suma</span> = przepracowane godziny w okresie ·{' '}
              <span className="text-slate-400">Różn.</span> = suma − {NORM}h (nadwyżka idzie do banku) ·{' '}
              <span className="text-slate-400">Saldo</span> = narastające saldo nadgodzin (z saldem początkowym).
            </p>
          </div>
        </div>
      )}

      {/* Menu wyboru kodu */}
      {editing && (
        <div
          className="fixed z-50 rounded-lg border border-slate-700 bg-surface-900 shadow-2xl p-1 flex flex-col"
          style={{ left: Math.min(editing.x, window.innerWidth - 180), top: Math.min(editing.y, window.innerHeight - 320) }}
          onClick={e => e.stopPropagation()}
        >
          {HOUR_CODES.map(c => (
            <button
              key={c}
              onClick={() => { setEntry(editing.personId, editing.date, c); setEditing(null) }}
              className={cn('text-left text-xs px-2 py-1.5 rounded hover:bg-surface-700 flex items-center gap-2')}
            >
              <span className={cn('w-6 text-center rounded border text-[11px] font-semibold', HOUR_CODE_CELL_CLASS[c])}>
                {HOUR_CODE_SHORT[c]}
              </span>
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

// Nagłówek trzech podkolumn (Suma / Różn. / Saldo) dla jednego okresu
function FragmentCols() {
  return (
    <>
      <th className="px-1.5 py-0.5 text-center font-medium border-l border-slate-700">Suma</th>
      <th className="px-1.5 py-0.5 text-center font-medium">Różn.</th>
      <th className="px-1.5 py-0.5 text-center font-medium">Saldo</th>
    </>
  )
}

// Komórki wyniku dla jednego okresu
function FragmentStat({ worked, diff, cumulative, ok, over }: {
  worked: number; diff: number; cumulative: number; ok: boolean; over: boolean
}) {
  return (
    <>
      <td className={cn(
        'px-1.5 py-1 text-center font-semibold border-l border-slate-700',
        ok ? 'text-emerald-400' : over ? 'text-amber-400' : 'text-red-400',
      )}>
        {worked}
      </td>
      <td className={cn('px-1.5 py-1 text-center', diff === 0 ? 'text-slate-500' : diff > 0 ? 'text-amber-400' : 'text-red-400')}>
        {diff > 0 ? `+${diff}` : diff}
      </td>
      <td className={cn('px-1.5 py-1 text-center font-medium', cumulative >= 0 ? 'text-slate-300' : 'text-red-400')}>
        {cumulative > 0 ? `+${cumulative}` : cumulative}
      </td>
    </>
  )
}

import { useState } from 'react'
import { Phone, AlertTriangle, Truck, Clock, CheckSquare, BookOpen, RotateCcw } from 'lucide-react'
import { cn } from '../lib/utils'

// ── Static data ───────────────────────────────────────────────────────────────

const PHONE_NUMBERS = [
  { label: 'Oficer dyżurny',          number: '261676444' , display: '261 676 444'  },
  { label: 'Łukasz S.',               number: '781040022',  display: '781 040 022'  },
  { label: 'Komendant',               number: '261676462',  display: '261 676 462'  },
  { label: 'Komendant (kom.)',         number: '785207743',  display: '785 207 743'  },
  { label: 'PSP Sulęcin',             number: '957550050',  display: '957 55 0050'  },
  { label: 'Punkt Alarmowania (dyżurka)', number: '261676429', display: '261 676 429' },
  { label: 'Karetka wojskowa',        number: '261676999',  display: '261 676 999'  },
]

const ALARM_INFO = [
  'Gdzie się pali?',
  'Co się pali?',
  'Poszkodowani?',
  'Imię i nazwisko zgłaszającego',
  'Numer telefonu zgłaszającego',
]

const ALARM_ACTIONS = [
  'Zapisać w brudnopisie',
  'Informacja na radiowęźle',
  'Otworzyć bramy',
  'Zapisać godzinę wyjazdu / powrotu',
  'Informacja do oficera dyżurnego',
  '"Dodaje zdarzenie" w systemie',
  'Edycja zdarzenia w systemie po powrocie',
  'Informacja do oficera o zakończeniu zdarzenia',
]

const VEHICLES = [
  { bay: 1, callsign: '21', name: 'GBA 2,5/16', brand: 'IVECO',     note: 'wypadek / pożar', crew: '4' },
  { bay: 2, callsign: '25', name: 'GCBA 5/32',  brand: 'SCANIA',    note: 'wypadek',          crew: '3'  },
  { bay: 3, callsign: '26', name: 'GCBA 10/60', brand: 'SCANIA',    note: 'pożar',            crew: '3'  },
  { bay: 4, callsign: '35', name: 'GCBA 8/50',  brand: 'SCANIA',    note: 'lotniskowy',       crew: '3'  },
  { bay: 5, callsign: '20', name: 'GLBM 0.3',   brand: 'MITSUBISHI',note: '',                 crew: '2'  },
]

const ACRONYMS = [
  { letter: 'G', meaning: 'Gaśniczy' },
  { letter: 'C', meaning: 'Ciężki' },
  { letter: 'B', meaning: 'Beczka (zbiornik wodny)' },
  { letter: 'A', meaning: 'Autopompa' },
  { letter: 'L', meaning: 'Lekki' },
  { letter: 'M', meaning: 'Motopompa' },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  color = 'text-slate-400',
  border = 'border-slate-700',
}: {
  icon: React.ElementType
  title: string
  color?: string
  border?: string
}) {
  return (
    <div className={cn('flex items-center gap-2 pb-2 mb-3 border-b', border)}>
      <Icon className={cn('w-4 h-4 shrink-0', color)} />
      <p className={cn('text-xs font-bold uppercase tracking-widest', color)}>{title}</p>
    </div>
  )
}

interface CheckItemProps {
  label: string
  checked: boolean
  onToggle: () => void
}

function CheckItem({ label, checked, onToggle }: CheckItemProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
        checked ? 'bg-emerald-950/30' : 'hover:bg-surface-700/50'
      )}
    >
      <div className={cn(
        'mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors',
        checked ? 'bg-emerald-600 border-emerald-600' : 'border-slate-600'
      )}>
        {checked && (
          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      <span className={cn('text-sm leading-snug', checked ? 'line-through text-slate-500' : 'text-slate-200')}>
        {label}
      </span>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function VademecumPage() {
  const [infoChecked, setInfoChecked] = useState<boolean[]>(Array(ALARM_INFO.length).fill(false))
  const [actionChecked, setActionChecked] = useState<boolean[]>(Array(ALARM_ACTIONS.length).fill(false))

  const totalChecked = [...infoChecked, ...actionChecked].filter(Boolean).length
  const totalItems = ALARM_INFO.length + ALARM_ACTIONS.length

  function resetChecklist() {
    setInfoChecked(Array(ALARM_INFO.length).fill(false))
    setActionChecked(Array(ALARM_ACTIONS.length).fill(false))
  }

  function toggleInfo(i: number) {
    setInfoChecked(prev => prev.map((v, j) => j === i ? !v : v))
  }

  function toggleAction(i: number) {
    setActionChecked(prev => prev.map((v, j) => j === i ? !v : v))
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-5xl">

        {/* Header */}
        <div className="pb-5 border-b border-slate-800 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-5 h-5 text-brand-400" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Dyżurny</p>
          </div>
          <h1 className="text-2xl font-bold text-white">Vademecum</h1>
          <p className="text-xs text-slate-500 mt-0.5">Podstawowe informacje i procedury</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* LEFT column */}
          <div className="space-y-6">

            {/* Phone numbers */}
            <div className="bg-surface-800 rounded-xl border border-slate-700/40 p-4">
              <SectionHeader icon={Phone} title="Ważne numery" color="text-brand-400" border="border-brand-900/50" />
              <div className="space-y-1">
                {PHONE_NUMBERS.map(({ label, number, display }) => (
                  <div key={label} className="flex items-center justify-between gap-4 py-2 border-b border-slate-800/60 last:border-0">
                    <span className="text-sm text-slate-400 min-w-0 truncate">{label}</span>
                    <a
                      href={`tel:${number}`}
                      className="text-sm font-mono font-semibold text-brand-300 hover:text-brand-200 transition-colors shrink-0 tabular-nums"
                    >
                      {display}
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Vehicles */}
            <div className="bg-surface-800 rounded-xl border border-slate-700/40 p-4">
              <SectionHeader icon={Truck} title="Pojazdy" color="text-slate-400" border="border-slate-700" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-slate-600 border-b border-slate-800">
                      <th className="text-left pb-2 font-semibold w-8">Br.</th>
                      <th className="text-left pb-2 font-semibold">Pojazd</th>
                      <th className="text-right pb-2 font-semibold w-10">Obsada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {VEHICLES.map(v => (
                      <tr key={v.bay}>
                        <td className="py-2.5 pr-2">
                          <span className="text-xs font-bold text-slate-500">{v.bay}</span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="font-bold text-white tabular-nums">{v.callsign}</span>
                            <span className="text-slate-300">{v.name}</span>
                            <span className="text-[11px] text-slate-500">{v.brand}</span>
                            {v.note && (
                              <span className="text-[10px] text-amber-500/80 font-medium">({v.note})</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 text-right">
                          {v.crew
                            ? <span className="text-sm font-bold text-emerald-400">{v.crew}</span>
                            : <span className="text-slate-700">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Reports & Tasks */}
            <div className="bg-surface-800 rounded-xl border border-slate-700/40 p-4">
              <SectionHeader icon={Clock} title="Meldunki" color="text-amber-400" border="border-amber-900/40" />
              <div className="space-y-2">
                {['06:00', '22:00'].map(time => (
                  <div key={time} className="flex items-center gap-3 py-2 border-b border-slate-800/60 last:border-0">
                    <span className="text-base font-bold tabular-nums text-amber-400 w-14 shrink-0">{time}</span>
                    <span className="text-sm text-slate-300">Meldunek do oficera dyżurnego o wyjazdach</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recurring tasks */}
            <div className="bg-surface-800 rounded-xl border border-slate-700/40 p-4">
              <SectionHeader icon={CheckSquare} title="Zadania cykliczne" color="text-emerald-400" border="border-emerald-900/40" />
              <ul className="space-y-3">
                <li className="flex items-start gap-2.5 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <span className="text-sm text-slate-300">Rozpisać następną służbę w zeszycie</span>
                </li>
                <li className="flex items-start gap-2.5 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <div>
                    <span className="text-sm text-slate-300">Wypisać w książce kontroli wyposażenia medycznego</span>
                    <span className="text-sm text-slate-400"> — sprawdzenie AED</span>
                  </div>
                </li>
                <li className="flex items-start gap-2.5 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <div>
                    <span className="text-sm text-slate-300">Jeśli służba wypada w </span>
                    <span className="text-sm font-semibold text-amber-400">piątek</span>
                    <span className="text-sm text-slate-300"> → obsługa sprzętu — odnotować w książce kontroli wyposażenia medycznego</span>
                  </div>
                </li>
              </ul>
            </div>

            {/* Acronym legend */}
            <div className="bg-surface-800 rounded-xl border border-slate-700/40 p-4">
              <SectionHeader icon={BookOpen} title="Legenda skrótów" color="text-slate-400" border="border-slate-700" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                {ACRONYMS.map(({ letter, meaning }) => (
                  <div key={letter} className="flex items-baseline gap-2">
                    <span className="text-base font-black text-white w-4 shrink-0 tabular-nums">{letter}</span>
                    <span className="text-[10px] text-slate-500">—</span>
                    <span className="text-sm text-slate-300">{meaning}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* RIGHT column — Alarm checklist */}
          <div>
            <div className="bg-surface-800 rounded-xl border border-red-900/40 p-4 sticky top-4">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-red-900/30">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <p className="text-xs font-bold uppercase tracking-widest text-red-400">Procedura alarmowa</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-500 tabular-nums">
                    {totalChecked}/{totalItems}
                  </span>
                  {totalChecked > 0 && (
                    <button
                      onClick={resetChecklist}
                      className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1 rounded-full bg-surface-700 mb-4 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${totalItems > 0 ? (totalChecked / totalItems) * 100 : 0}%` }}
                />
              </div>

              {/* Collect info */}
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1 px-1">
                Zbierz informacje
              </p>
              <div className="mb-4">
                {ALARM_INFO.map((item, i) => (
                  <CheckItem
                    key={i}
                    label={item}
                    checked={infoChecked[i]}
                    onToggle={() => toggleInfo(i)}
                  />
                ))}
              </div>

              {/* Actions */}
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1 px-1">
                Działania
              </p>
              <div>
                {ALARM_ACTIONS.map((item, i) => (
                  <CheckItem
                    key={i}
                    label={item}
                    checked={actionChecked[i]}
                    onToggle={() => toggleAction(i)}
                  />
                ))}
              </div>

              {totalChecked === totalItems && totalItems > 0 && (
                <div className="mt-4 flex items-center gap-2 bg-emerald-950/40 border border-emerald-900/50 rounded-lg px-3 py-2.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <p className="text-sm font-semibold text-emerald-300">Procedura zakończona</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { BellRing, Check } from 'lucide-react'
import {
  type Qualification, type NotificationPrefs,
  REMIND_DAYS_OPTIONS, OWN_REPEAT_OPTIONS, CREW_REPEAT_OPTIONS,
  DEFAULT_OWN_REPEAT_DAYS, DEFAULT_CREW_REPEAT_DAYS,
  fetchNotificationPrefs, saveNotificationPrefs, setRemindDaysForPerson, formatRemindDays,
} from '../../lib/qualifications'
import { FIELD_CLASS } from './qualStyles'

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-1 sm:grid-cols-[1fr_15rem] items-center gap-1.5 sm:gap-3 min-w-0">
      <span className="min-w-0">
        <span className="block text-sm text-slate-200">{label}</span>
        {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
      </span>
      <span className="min-w-0">{children}</span>
    </label>
  )
}

function withCurrent(options: number[], current: number | null): number[] {
  return current === null || options.includes(current) ? options : [...options, current].sort((a, b) => a - b)
}

// Ustawienia przypomnień: moje terminy (od kiedy + jak często) i — dla dowódców zmiany
// i admina — terminy strażaków (od kiedy: wspólne dla dowódców; jak często: każdy swoje)
export function ReminderSettings({ login, myPersonId, myQuals, isCommander, commanderDays, onCommanderDaysChange, onChanged }: {
  login: string
  myPersonId: string | null
  myQuals: Qualification[]
  isCommander: boolean
  commanderDays: number
  onCommanderDaysChange: (days: number) => Promise<void>
  onChanged: () => Promise<void>
}) {
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    own_repeat_days: DEFAULT_OWN_REPEAT_DAYS,
    crew_repeat_days: DEFAULT_CREW_REPEAT_DAYS,
  })
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchNotificationPrefs(login).then(setPrefs).catch(() => {})
  }, [login])

  // Wspólna wartość „zaczynaj przypominać” moich terminów; różne → null
  const ownStarts = [...new Set(myQuals.map(q => q.remind_days))]
  const ownStart = ownStarts.length === 1 ? ownStarts[0] : null

  async function save(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await action()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać ustawień.')
    } finally {
      setBusy(false)
    }
  }

  const updatePrefs = (patch: Partial<NotificationPrefs>) => save(async () => {
    await saveNotificationPrefs(login, patch)
    setPrefs(prev => ({ ...prev, ...patch }))
  })

  return (
    <section className="bg-surface-800 rounded-xl border border-slate-700/40 p-3 space-y-4 min-w-0">
      <div className="flex items-center gap-2">
        <BellRing className="w-4 h-4 text-brand-400 shrink-0" />
        <p className="text-sm font-semibold text-white flex-1">Ustawienia przypomnień</p>
        {saved && <span className="flex items-center gap-1 text-[11px] text-emerald-400"><Check className="w-3 h-3" /> Zapisano</span>}
      </div>

      {myPersonId && (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Moje terminy</p>
          <Row label="Zaczynaj przypominać" hint="dla wszystkich moich terminów (pojedynczy zmienisz ołówkiem)">
            <select
              value={ownStart ?? ''}
              disabled={busy || !myQuals.length}
              onChange={e => save(async () => {
                await setRemindDaysForPerson(myPersonId, Number(e.target.value))
                await onChanged()
              })}
              className={FIELD_CLASS}
            >
              {ownStart === null && <option value="" disabled>różnie dla terminów</option>}
              {withCurrent(REMIND_DAYS_OPTIONS, ownStart).map(d => <option key={d} value={d}>{formatRemindDays(d)}</option>)}
            </select>
          </Row>
          <Row label="Powtarzaj powiadomienie" hint="dopóki termin nie zostanie odnowiony">
            <select
              value={prefs.own_repeat_days}
              disabled={busy}
              onChange={e => updatePrefs({ own_repeat_days: Number(e.target.value) })}
              className={FIELD_CLASS}
            >
              {OWN_REPEAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Row>
        </div>
      )}

      {isCommander && (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Terminy strażaków (dowódca)</p>
          <Row label="Zaczynaj przypominać" hint="wspólne dla wszystkich dowódców zmiany">
            <select
              value={commanderDays}
              disabled={busy}
              onChange={e => save(() => onCommanderDaysChange(Number(e.target.value)))}
              className={FIELD_CLASS}
            >
              {withCurrent(REMIND_DAYS_OPTIONS, commanderDays).map(d => <option key={d} value={d}>{formatRemindDays(d)}</option>)}
            </select>
          </Row>
          <Row label="Powtarzaj powiadomienie" hint="moje ustawienie, dotyczy listy terminów zmiany">
            <select
              value={prefs.crew_repeat_days}
              disabled={busy}
              onChange={e => updatePrefs({ crew_repeat_days: Number(e.target.value) })}
              className={FIELD_CLASS}
            >
              {CREW_REPEAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Row>
        </div>
      )}

      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <p className="text-[11px] text-slate-500">
        Powiadomienia przychodzą rano (ok. 8:00), gdy masz włączony 🔔 na stronie głównej.
        Gdy komuś zacznie się okres przypomnienia lub minie termin, dowódcy dostają powiadomienie zawsze.
      </p>
    </section>
  )
}

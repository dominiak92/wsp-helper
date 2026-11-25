import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, CheckCircle, ChevronDown, ChevronUp, RefreshCw, X, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/utils'
import { currentOrNextDutyDate, todayYmdKey } from '../lib/duty'
import type { RoleType } from '../lib/crew'
import { sendPushTrigger } from '../lib/pushNotifications'
import {
  type Qualification, type QualKind, type QualLevel, type StandardQualKind,
  STANDARD_QUAL_KINDS, QUAL_KIND_LABELS, COMMANDER_REMIND_DAYS,
  fetchQualifications, setValidUntil, submitPending, approvePending, rejectPending,
  setRemindDays, addCustom, updateCustom, deleteQualification, setPlannedOn, compareAttention,
  fetchCommanderRemindDays, saveCommanderRemindDays,
  qualLevel, qualTitle, isApprover, compareUrgency, daysLeft, formatQualDate, formatRemainingShort,
} from '../lib/qualifications'
import { ReminderSettings } from '../components/qualifications/ReminderSettings'
import { QualItemRow, type QualEditMode } from '../components/qualifications/QualItemRow'
import { AddCustomQualForm } from '../components/qualifications/AddCustomQualForm'
import { QualTile, RemainingBar, LevelSummary } from '../components/qualifications/QualVisuals'
import { LEVEL_STYLES } from '../components/qualifications/qualStyles'

interface PersonRow {
  id: string
  name: string
  login: string | null
  roles: RoleType[]
}

const SHORT_KIND: Record<StandardQualKind, string> = { komora: 'Komora', medyk: 'Medyk', badania: 'Badania' }

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">{children}</p>
}

// ── Lista terminów jednej osoby (3 standardowe + własne) ────────────────────────

interface PersonQualActions {
  setDate: (target: Qualification | { person_id: string; kind: QualKind }, date: string, remind: number) => Promise<void>
  requestDate: (target: Qualification | { person_id: string; kind: StandardQualKind }, date: string) => Promise<void>
  setRemind: (q: Qualification, days: number) => Promise<void>
  addCustom: (personId: string, label: string, date: string, remind: number) => Promise<void>
  updateCustom: (q: Qualification, date: string, remind: number) => Promise<void>
  remove: (q: Qualification) => Promise<void>
  plan: (target: Qualification | { person_id: string; kind: StandardQualKind }, plannedOn: string | null) => Promise<void>
}

function PersonQualList({ personId, quals, today, standardMode, ownCustom, canEditRemind, canPlan, actions }: {
  personId: string
  quals: Qualification[]
  today: string
  standardMode: QualEditMode   // jak zmienia się data komory/medyka/badań
  ownCustom: boolean           // własne terminy: pełna edycja bez zatwierdzania
  canEditRemind: boolean
  canPlan: boolean             // zapis na termin (sam strażak albo zatwierdzający)
  actions: PersonQualActions
}) {
  const custom = quals.filter(q => q.kind === 'custom').sort(compareUrgency)
  const customMode: QualEditMode = ownCustom || standardMode === 'direct' ? 'direct' : 'readonly'

  return (
    <div className="space-y-2">
      {STANDARD_QUAL_KINDS.map(kind => {
        const q = quals.find(x => x.kind === kind) ?? null
        return (
          <QualItemRow
            key={kind}
            title={QUAL_KIND_LABELS[kind]}
            q={q}
            today={today}
            mode={standardMode}
            canEditRemind={canEditRemind}
            onSetDate={(date, remind) => actions.setDate(q ?? { person_id: personId, kind }, date, remind)}
            onRequestDate={date => actions.requestDate(q ?? { person_id: personId, kind }, date)}
            onRemindChange={days => (q ? actions.setRemind(q, days) : Promise.resolve())}
            canPlan={canPlan}
            onPlan={plannedOn => actions.plan(q ?? { person_id: personId, kind }, plannedOn)}
          />
        )
      })}
      {custom.map(q => (
        <QualItemRow
          key={q.id}
          title={qualTitle(q)}
          q={q}
          today={today}
          mode={customMode}
          canEditRemind={canEditRemind || customMode === 'direct'}
          canDelete={customMode === 'direct'}
          onSetDate={(date, remind) => actions.updateCustom(q, date, remind)}
          onRequestDate={() => Promise.resolve()}
          onRemindChange={days => actions.setRemind(q, days)}
          onDelete={() => actions.remove(q)}
          canPlan={canPlan}
          onPlan={plannedOn => actions.plan(q, plannedOn)}
        />
      ))}
      {customMode === 'direct' && (
        <AddCustomQualForm onAdd={(label, date, remind) => actions.addCustom(personId, label, date, remind)} />
      )}
    </div>
  )
}

// ── Strona ───────────────────────────────────────────────────────────────────

export function QualificationsPage() {
  const { user } = useAuth()
  const today = todayYmdKey()
  const dutyDate = currentOrNextDutyDate()

  const [people, setPeople] = useState<PersonRow[]>([])
  const [quals, setQuals] = useState<Qualification[]>([])
  const [shiftCommanderId, setShiftCommanderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openPersonId, setOpenPersonId] = useState<string | null>(null)
  const [crewView, setCrewView] = useState<'people' | 'dates'>('people')
  const [levelFilter, setLevelFilter] = useState<QualLevel | null>(null)
  const [commanderDays, setCommanderDays] = useState(COMMANDER_REMIND_DAYS)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const [pRes, q, aRes, cDays] = await Promise.all([
        supabase.from('personnel').select('id, name, login, roles'),
        fetchQualifications(),
        supabase
          .from('duty_assignments')
          .select('assignment_json')
          .eq('duty_date', dutyDate)
          .order('created_at', { ascending: false })
          .limit(1),
        fetchCommanderRemindDays(),
      ])
      if (pRes.error) throw new Error('Nie udało się wczytać załogi — sprawdź połączenie.')
      setCommanderDays(cDays)
      setPeople((pRes.data ?? []).map(r => ({ id: r.id, name: r.name, login: r.login ?? null, roles: (r.roles ?? []) as RoleType[] })))
      setQuals(q)
      const aj = aRes.data?.[0]?.assignment_json as { shiftCommanderId?: string | null } | undefined
      setShiftCommanderId(aj?.shiftCommanderId ?? null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Nie udało się wczytać terminów.')
    } finally {
      setLoading(false)
    }
  }, [dutyDate])

  useEffect(() => { load() }, [load])

  if (!user) return null

  const me = people.find(p => p.login === user.login) ?? null
  const isAdmin = user.role === 'admin'
  // Zatwierdza admin albo dowódca zmiany; załogę widzi też dzisiejszy dowódca zmiany z obsady
  const approver = isApprover(me?.roles, user.role)
  const canSeeCrew = approver || (!!me && me.id === shiftCommanderId)
  const nameOf = (id: string) => people.find(p => p.id === id)?.name ?? id
  const loginOf = (id: string) => people.find(p => p.id === id)?.login ?? null

  // Wspólne opakowanie akcji: sukces → przeładuj listę (błąd pokazuje wiersz, który ją wywołał)
  async function run(action: () => Promise<void>) {
    setActionError(null)
    await action()
    await load()
  }

  const actions: PersonQualActions = {
    setDate: (target, date, remind) => run(() =>
      setValidUntil('id' in target ? { id: target.id } : target, date, remind, user.login)),
    requestDate: (target, date) => run(async () => {
      await submitPending('id' in target ? { id: target.id } : target, date, user.login)
      sendPushTrigger({
        type: 'qualification_pending',
        senderLogin: user.login,
        senderName: user.displayName,
        message: `${QUAL_KIND_LABELS[target.kind as StandardQualKind]} — nowa data ${formatQualDate(date)}`,
      })
    }),
    setRemind: (q, days) => run(() => setRemindDays(q.id, days)),
    addCustom: (personId, label, date, remind) => run(() => addCustom(personId, label, date, remind)),
    updateCustom: (q, date, remind) => run(() => updateCustom(q.id, q.label ?? '', date, remind)),
    remove: q => run(() => deleteQualification(q.id)),
    plan: (target, plannedOn) => run(() =>
      setPlannedOn('id' in target ? { id: target.id } : target, plannedOn, user.login)),
  }

  async function decide(q: Qualification, approve: boolean) {
    setBusyId(q.id)
    setActionError(null)
    try {
      if (approve) await approvePending(q, user!.login)
      else await rejectPending(q)
      const target = loginOf(q.person_id)
      if (target) {
        sendPushTrigger({
          type: approve ? 'qualification_approved' : 'qualification_rejected',
          targetLogin: target,
          message: approve
            ? `${qualTitle(q)}: ważne do ${formatQualDate(q.pending_valid_until)}`
            : `${qualTitle(q)}: data ${formatQualDate(q.pending_valid_until)} nie została przyjęta — porozmawiaj z dowódcą zmiany`,
        })
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Nie udało się zapisać decyzji.')
    } finally {
      setBusyId(null)
      await load()
    }
  }

  async function changeCommanderDays(days: number) {
    await saveCommanderRemindDays(days, user!.login)
    setCommanderDays(days)
  }

  function showPerson(personId: string) {
    setCrewView('people')
    setLevelFilter(null)
    setOpenPersonId(personId)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="px-4 py-10 flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-red-400">{loadError}</p>
        <button
          onClick={() => { setLoading(true); load() }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-white text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Spróbuj ponownie
        </button>
      </div>
    )
  }

  const myQuals = me ? quals.filter(q => q.person_id === me.id) : []
  // Dowódca zmiany nie zatwierdza własnej daty (admin może)
  const pending = approver
    ? quals.filter(q => q.pending_valid_until && (isAdmin || q.person_id !== me?.id))
    : []

  // ── Załoga ──
  const crewPeople = canSeeCrew ? people.filter(p => p.id !== me?.id || isAdmin) : []
  const crewIds = new Set(crewPeople.map(p => p.id))
  const crewQuals = quals.filter(q => crewIds.has(q.person_id) && q.valid_until)
  const levelCounts: Record<QualLevel, number> = { expired: 0, critical: 0, soon: 0, planned: 0, ok: 0, missing: 0 }
  for (const q of crewQuals) levelCounts[qualLevel(q, today)]++

  const timeline = crewQuals
    .filter(q => !levelFilter || qualLevel(q, today) === levelFilter)
    .sort(compareUrgency)

  // Na górze ten, kto ma najpilniejszy NIEZAŁATWIONY termin; zaplanowane schodzą niżej
  const byAttention = (a: Qualification, b: Qualification) => compareAttention(a, b, today)
  const peopleCards = crewPeople
    .map(p => {
      const pq = quals.filter(q => q.person_id === p.id)
      return { person: p, quals: pq, soonest: [...pq].filter(q => q.valid_until).sort(byAttention)[0] }
    })
    .filter(c => !levelFilter || c.quals.some(q => q.valid_until && qualLevel(q, today) === levelFilter))
    .sort((a, b) => {
      if (!a.soonest) return b.soonest ? 1 : a.person.name.localeCompare(b.person.name, 'pl')
      if (!b.soonest) return -1
      return byAttention(a.soonest, b.soonest) || a.person.name.localeCompare(b.person.name, 'pl')
    })

  return (
    <div className="max-w-3xl mx-auto w-full px-3 sm:px-5 py-4 space-y-6 pb-10">
      <div className="flex items-start gap-3">
        <CalendarClock className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <h1 className="text-xl font-bold text-white">Terminy</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Komora dymowa, medyk (KPP), badania okresowe i własne przypomnienia
          </p>
        </div>
      </div>

      {actionError && (
        <div className="flex items-start gap-2 bg-red-950/40 border border-red-900/50 rounded-xl px-4 py-3">
          <p className="text-sm text-red-300 flex-1">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-200" aria-label="Zamknij">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Do zatwierdzenia */}
      {pending.length > 0 && (
        <section>
          <SectionLabel>Do zatwierdzenia ({pending.length})</SectionLabel>
          <div className="space-y-2">
            {pending.map(q => (
              <div key={q.id} className="bg-surface-800 rounded-xl border border-brand-800/60 p-3 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-white truncate">{nameOf(q.person_id)}</p>
                  <p className="text-[10px] text-slate-500 shrink-0">
                    {q.pending_at && new Date(q.pending_at).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}
                  </p>
                </div>
                <p className="text-sm text-slate-300">
                  {qualTitle(q)}: <span className="text-slate-500 line-through">{formatQualDate(q.valid_until)}</span>
                  {' → '}
                  <span className="font-bold text-brand-300">{formatQualDate(q.pending_valid_until)}</span>
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => decide(q, false)}
                    disabled={busyId === q.id}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-300 transition-colors disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" /> Odrzuć
                  </button>
                  <button
                    onClick={() => decide(q, true)}
                    disabled={busyId === q.id}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white transition-colors disabled:opacity-50"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Zatwierdź
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Moje terminy */}
      {me ? (
        <section>
          <SectionLabel>Moje terminy</SectionLabel>
          <PersonQualList
            personId={me.id}
            quals={myQuals}
            today={today}
            standardMode={isAdmin ? 'direct' : 'request'}
            ownCustom
            canEditRemind
            canPlan
            actions={actions}
          />
          {!isAdmin && (
            <p className="mt-2 text-[11px] text-slate-500">
              Po odnowieniu kliknij ✏️ i wpisz nową datę — zacznie obowiązywać po zatwierdzeniu przez dowódcę zmiany lub admina.
              Na stronie głównej termin pojawi się, gdy zacznie się okres przypomnienia.
            </p>
          )}
        </section>
      ) : !isAdmin && (
        <p className="text-sm text-slate-500">Twoje konto nie jest powiązane z nikim z załogi — poproś admina o uzupełnienie loginu.</p>
      )}

      {/* Załoga — admin, dowódcy zmiany i dzisiejszy dowódca zmiany z obsady */}
      {canSeeCrew && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Załoga — wszystkie terminy</p>
            <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
              {([['people', 'Wg osób'], ['dates', 'Wg daty']] as const).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setCrewView(v)}
                  className={cn(
                    'px-3 py-1.5 transition-colors',
                    crewView === v ? 'bg-brand-700 text-white' : 'bg-surface-800 text-slate-400 hover:text-white',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <LevelSummary counts={levelCounts} active={levelFilter} onSelect={setLevelFilter} />

          {crewView === 'dates' ? (
            <div className="bg-surface-800 rounded-xl border border-slate-700/40 divide-y divide-slate-800/70 overflow-hidden">
              {timeline.length === 0 && <p className="px-3 py-4 text-sm text-slate-500">Brak terminów.</p>}
              {timeline.map(q => {
                const level = qualLevel(q, today)
                const style = LEVEL_STYLES[level]
                return (
                  <button
                    key={q.id}
                    onClick={() => showPerson(q.person_id)}
                    className="w-full text-left px-3 py-2.5 hover:bg-surface-700/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', style.dot)} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">
                          <span className="font-semibold">{nameOf(q.person_id)}</span>
                          <span className="text-slate-400"> · {qualTitle(q)}</span>
                        </p>
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          {formatQualDate(q.valid_until)}
                          {q.pending_valid_until && (
                            <span className="ml-2 inline-flex items-center gap-0.5 text-brand-300">
                              <Clock className="w-3 h-3" /> {formatQualDate(q.pending_valid_until)}
                            </span>
                          )}
                          {level === 'planned' && q.planned_on && (
                            <span className="ml-2 text-sky-300">📅 zapisany na {formatQualDate(q.planned_on)}</span>
                          )}
                        </p>
                      </div>
                      <span className={cn('text-sm font-bold tabular-nums shrink-0 whitespace-nowrap', style.text)}>
                        {formatRemainingShort(daysLeft(q, today))}
                      </span>
                    </div>
                    <RemainingBar q={q} today={today} className="mt-1.5 ml-5" />
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {peopleCards.length === 0 && <p className="text-sm text-slate-500">Brak terminów.</p>}
              {peopleCards.map(({ person, quals: pq, soonest }) => {
                const open = openPersonId === person.id
                const custom = pq.filter(q => q.kind === 'custom').sort(compareUrgency)
                const direct = approver && (isAdmin || person.id !== me?.id)
                const level = soonest ? qualLevel(soonest, today) : 'missing'
                const style = LEVEL_STYLES[level]
                // Kropki pozostałych terminów — szybki rzut oka bez rozwijania
                const others = pq.filter(q => q.valid_until && q.id !== soonest?.id).sort(compareUrgency)
                return (
                  <div key={person.id} className={cn('bg-surface-800 rounded-xl border overflow-hidden', open ? 'border-slate-600' : style.border)}>
                    <button
                      onClick={() => setOpenPersonId(open ? null : person.id)}
                      className="w-full px-3 py-2.5 text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', style.dot)} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">{person.name}</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {soonest ? <>
                              {level === 'planned' ? 'Zapisany: ' : 'Najbliżej: '}
                              <span className="text-slate-200">{qualTitle(soonest)}</span> · {formatQualDate(soonest.valid_until)}
                              {soonest.planned_on && level === 'planned' && <span className="text-sky-300"> · 📅 {formatQualDate(soonest.planned_on).slice(0, 5)}</span>}
                            </> : 'Brak dat'}
                          </p>
                        </div>
                        {pq.some(q => q.pending_valid_until) && (
                          <Clock className="w-3.5 h-3.5 text-brand-300 shrink-0" aria-label="do zatwierdzenia" />
                        )}
                        <span className={cn('text-base font-bold tabular-nums shrink-0 whitespace-nowrap', style.text)}>
                          {soonest ? formatRemainingShort(daysLeft(soonest, today)) : '—'}
                        </span>
                        {open ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
                      </div>
                      <div className="mt-2 flex items-center gap-2 pl-5">
                        <RemainingBar q={soonest ?? null} today={today} className="flex-1" />
                        {others.map(q => (
                          <span
                            key={q.id}
                            title={`${qualTitle(q)}: ${formatQualDate(q.valid_until)}`}
                            className={cn('w-2 h-2 rounded-full shrink-0', LEVEL_STYLES[qualLevel(q, today)].dot)}
                          />
                        ))}
                      </div>
                    </button>
                    {open && (
                      <div className="px-3 pb-3 space-y-3">
                        <div className="grid grid-cols-3 gap-1.5">
                          {STANDARD_QUAL_KINDS.map(kind => (
                            <QualTile key={kind} title={SHORT_KIND[kind]} q={pq.find(x => x.kind === kind) ?? null} today={today} />
                          ))}
                          {custom.map(q => (
                            <QualTile key={q.id} title={qualTitle(q)} q={q} today={today} />
                          ))}
                        </div>
                        <PersonQualList
                          personId={person.id}
                          quals={pq}
                          today={today}
                          standardMode={direct ? 'direct' : 'readonly'}
                          ownCustom={false}
                          canEditRemind={direct}
                          canPlan={direct}
                          actions={actions}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Od kiedy i jak często przypominać — moje terminy + (dowódca) terminy strażaków */}
      <ReminderSettings
        login={user.login}
        myPersonId={me?.id ?? null}
        myQuals={myQuals}
        isCommander={approver}
        commanderDays={commanderDays}
        onCommanderDaysChange={changeCommanderDays}
        onChanged={load}
      />
    </div>
  )
}

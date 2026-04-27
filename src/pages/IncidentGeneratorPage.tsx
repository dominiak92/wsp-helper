import { useState, useMemo } from 'react'
import { Copy, Check, FileText, ChevronDown, Plus, Trash2 } from 'lucide-react'
import {
  VEHICLES,
  LOCATIONS,
  DEFAULT_FORM,
  generateDescription,
  totalZastepy,
  pluralZastep,
  type IncidentFormData,
  type VehicleEntry,
  type ExternalUnit,
  type ExternalUnitType,
  type IncidentCategory,
} from '../lib/incident'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'

// ── primitives ────────────────────────────────────────────────────────────────

function FormRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-600 mt-1">{hint}</p>}
    </div>
  )
}

function StyledSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full h-10 rounded-md border border-slate-700 bg-surface-900 px-3 pr-8',
          'text-sm appearance-none cursor-pointer',
          'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
          value ? 'text-slate-100' : 'text-slate-500'
        )}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 pb-1 border-b border-slate-800 mb-3 mt-5 first:mt-0">
      {children}
    </p>
  )
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <div
        className={cn(
          'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
          checked ? 'bg-alert-green border-alert-green' : 'border-slate-600'
        )}
        onClick={() => onChange(!checked)}
      >
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
      <span className="text-sm text-slate-300 group-hover:text-slate-100 transition-colors">
        {label}
      </span>
    </label>
  )
}

// ── category tabs ─────────────────────────────────────────────────────────────

function CategoryTabs({
  value,
  onChange,
}: {
  value: IncidentCategory
  onChange: (v: IncidentCategory) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
      {(['MON', 'CIVILIAN'] as const).map((cat) => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          className={cn(
            'px-5 py-2 text-sm font-semibold transition-colors',
            value === cat
              ? 'bg-brand-700 text-white'
              : 'bg-surface-800 text-slate-400 hover:text-slate-200 hover:bg-surface-700'
          )}
        >
          {cat === 'MON' ? 'Teren MON' : 'Pozar cywilny'}
        </button>
      ))}
    </div>
  )
}

// ── vehicle selector ──────────────────────────────────────────────────────────

function VehicleSelector({
  selected,
  onChange,
}: {
  selected: VehicleEntry[]
  onChange: (v: VehicleEntry[]) => void
}) {
  function toggle(vehicleId: string, defaultCrew: number) {
    const exists = selected.find((e) => e.vehicleId === vehicleId)
    if (exists) onChange(selected.filter((e) => e.vehicleId !== vehicleId))
    else onChange([...selected, { vehicleId, crew: defaultCrew }])
  }

  function setCrew(vehicleId: string, crew: number) {
    onChange(selected.map((e) => (e.vehicleId === vehicleId ? { ...e, crew } : e)))
  }

  return (
    <div className="space-y-2">
      {VEHICLES.map((veh) => {
        const entry = selected.find((e) => e.vehicleId === veh.id)
        const isSelected = !!entry
        return (
          <div
            key={veh.id}
            onClick={() => toggle(veh.id, veh.defaultCrew)}
            className={cn(
              'flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors cursor-pointer select-none',
              isSelected
                ? 'border-brand-600/60 bg-brand-900/20'
                : 'border-slate-700/60 bg-surface-900 hover:border-slate-600'
            )}
          >
            <div
              className={cn(
                'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                isSelected ? 'bg-brand-600 border-brand-600' : 'border-slate-600'
              )}
            >
              {isSelected && <Check className="w-3 h-3 text-white" />}
            </div>
            <span
              className={cn(
                'text-sm font-medium flex-1',
                isSelected ? 'text-slate-100' : 'text-slate-400'
              )}
            >
              {veh.name}
            </span>
            <span className="text-[10px] text-slate-600 font-mono">max {veh.defaultCrew}</span>
            {isSelected && (
              <div
                className="flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="w-6 h-6 rounded bg-surface-700 text-slate-300 hover:bg-surface-600 text-sm font-bold flex items-center justify-center"
                  onClick={() =>
                    setCrew(veh.id, Math.max(1, (entry?.crew ?? veh.defaultCrew) - 1))
                  }
                >
                  −
                </button>
                <span className="w-5 text-center text-sm font-mono text-slate-100">
                  {entry?.crew ?? veh.defaultCrew}
                </span>
                <button
                  className="w-6 h-6 rounded bg-surface-700 text-slate-300 hover:bg-surface-600 text-sm font-bold flex items-center justify-center"
                  onClick={() =>
                    setCrew(
                      veh.id,
                      Math.min(veh.defaultCrew, (entry?.crew ?? veh.defaultCrew) + 1)
                    )
                  }
                >
                  +
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── external units manager ────────────────────────────────────────────────────

const UNIT_TYPE_OPTIONS: { value: ExternalUnitType; label: string }[] = [
  { value: 'PSP', label: 'PSP' },
  { value: 'OSP', label: 'OSP' },
  { value: 'OTHER', label: 'Inna' },
]

function ExternalUnitsManager({
  units,
  onChange,
}: {
  units: ExternalUnit[]
  onChange: (v: ExternalUnit[]) => void
}) {
  function add() {
    const id = Math.random().toString(36).slice(2)
    onChange([...units, { id, type: 'PSP', name: '', zastepCount: 1 }])
  }

  function remove(id: string) {
    onChange(units.filter((u) => u.id !== id))
  }

  function update(id: string, patch: Partial<ExternalUnit>) {
    onChange(units.map((u) => (u.id === id ? { ...u, ...patch } : u)))
  }

  return (
    <div className="space-y-2">
      {units.length === 0 && (
        <p className="text-xs text-slate-600 italic py-1">
          Brak jednostek zewnętrznych — kliknij poniżej aby dodać.
        </p>
      )}
      {units.map((unit) => (
        <div
          key={unit.id}
          className="flex items-center gap-2 rounded-md border border-slate-700/60 bg-surface-900 px-3 py-2"
        >
          {/* type */}
          <div className="relative flex-shrink-0 w-[72px]">
            <select
              value={unit.type}
              onChange={(e) => update(unit.id, { type: e.target.value as ExternalUnitType })}
              className="w-full h-8 rounded border border-slate-700 bg-surface-800 px-2 pr-5 text-xs text-slate-200 appearance-none"
            >
              {UNIT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
          </div>

          {/* name */}
          <Input
            value={unit.name}
            onChange={(e) => update(unit.id, { name: e.target.value })}
            placeholder="Nazwa (np. Sulęcin)"
            className="flex-1 h-8 text-xs"
          />

          {/* count */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              className="w-6 h-6 rounded bg-surface-700 text-slate-300 hover:bg-surface-600 text-sm font-bold flex items-center justify-center"
              onClick={() => update(unit.id, { zastepCount: Math.max(1, unit.zastepCount - 1) })}
            >
              −
            </button>
            <span className="w-5 text-center text-sm font-mono text-slate-100">
              {unit.zastepCount}
            </span>
            <button
              className="w-6 h-6 rounded bg-surface-700 text-slate-300 hover:bg-surface-600 text-sm font-bold flex items-center justify-center"
              onClick={() => update(unit.id, { zastepCount: unit.zastepCount + 1 })}
            >
              +
            </button>
          </div>

          {/* delete */}
          <button
            onClick={() => remove(unit.id)}
            className="text-slate-600 hover:text-alert-red transition-colors flex-shrink-0 ml-1"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={add} className="w-full gap-1.5 text-xs">
        <Plus className="w-3.5 h-3.5" />
        Dodaj jednostkę zewnętrzną
      </Button>
    </div>
  )
}

// ── preview panel ─────────────────────────────────────────────────────────────

function PreviewPanel({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="sticky top-6">
      <CardHeader className="pb-0 flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5" />
          Podgląd opisu
        </CardTitle>
        <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-alert-green" />
              Skopiowano
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Kopiuj
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="rounded-md bg-surface-950 border border-slate-800 p-4 min-h-[220px]">
          {text.split('\n').map((line, i) => (
            <p key={i} className="text-sm text-slate-200 leading-relaxed mb-2 last:mb-0">
              {line}
            </p>
          ))}
        </div>
        <p className="text-[10px] text-slate-600 mt-2 text-right">
          {text.length} znaków · podgląd na żywo
        </p>
      </CardContent>
    </Card>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

const REPORTER_SUGGESTIONS = [
  'kierownik pasa ćwiczeń taktycznych',
  'dyżurny oficer jednostki',
  'strzelniczy',
  'kierownik ośrodka zurbanizowanego',
  'szef szkolenia',
  'obserwator',
]

const LOCATION_OPTIONS = LOCATIONS.map((l) => ({ value: l.label, label: l.label }))

export function IncidentGeneratorPage() {
  const [form, setForm] = useState<IncidentFormData>(DEFAULT_FORM)

  function set<K extends keyof IncidentFormData>(key: K, value: IncidentFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const description = useMemo(() => generateDescription(form), [form])
  const total = useMemo(() => totalZastepy(form), [form])

  const isMON = form.category === 'MON'

  return (
    <div className="max-w-7xl space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-100">Generator opisu zdarzenia</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Uzupełnij formularz — opis generuje się automatycznie po prawej stronie.
          </p>
        </div>
        <CategoryTabs
          value={form.category}
          onChange={(cat) => set('category', cat)}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* ── FORM ── */}
        <Card>
          <CardContent className="p-5 space-y-1">

            {/* ── MON sections ── */}
            {isMON && (
              <>
                <SectionHeading>Dane podstawowe</SectionHeading>
                <div className="grid grid-cols-2 gap-3">
                  <FormRow label="Data zdarzenia">
                    <Input
                      type="date"
                      value={form.date}
                      onChange={(e) => set('date', e.target.value)}
                    />
                  </FormRow>
                  <FormRow label="Godzina zgłoszenia">
                    <Input
                      type="time"
                      value={form.reportTime}
                      onChange={(e) => set('reportTime', e.target.value)}
                    />
                  </FormRow>
                </div>
                <div className="pt-2">
                  <Checkbox
                    checked={form.showYear}
                    onChange={(v) => set('showYear', v)}
                    label="Pokaż rok w dacie"
                  />
                </div>
                <div className="pt-2">
                  <FormRow label="Kto zgłosił" hint="np. kierownik pasa ćwiczeń taktycznych">
                    <Input
                      list="reporter-list"
                      placeholder="Wpisz lub wybierz…"
                      value={form.reporter}
                      onChange={(e) => set('reporter', e.target.value)}
                    />
                    <datalist id="reporter-list">
                      {REPORTER_SUGGESTIONS.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </FormRow>
                </div>

                <SectionHeading>Lokalizacja i zdarzenie</SectionHeading>
                <FormRow label="Miejsce zdarzenia">
                  <StyledSelect
                    value={form.locationLabel}
                    onChange={(v) => set('locationLabel', v)}
                    options={LOCATION_OPTIONS}
                    placeholder="Wybierz lokalizację…"
                  />
                </FormRow>
                <div className="pt-2">
                  <FormRow
                    label={'Opis zdarzenia (po „o“)'}
                    hint='np. "pożarze traw", "pożarze krzewów", "pożarze budynku"'
                  >
                    <Input
                      value={form.incidentText}
                      onChange={(e) => set('incidentText', e.target.value)}
                      placeholder="pożarze traw"
                    />
                  </FormRow>
                </div>
              </>
            )}

            {/* ── CIVILIAN sections ── */}
            {!isMON && (
              <>
                <SectionHeading>Zgłaszający</SectionHeading>
                <div className="grid grid-cols-2 gap-3">
                  <FormRow label="Stopień" hint="np. st. kpt.">
                    <Input
                      value={form.reporterRank}
                      onChange={(e) => set('reporterRank', e.target.value)}
                      placeholder="st. kpt."
                    />
                  </FormRow>
                  <FormRow label="Imię i nazwisko">
                    <Input
                      value={form.reporterName}
                      onChange={(e) => set('reporterName', e.target.value)}
                      placeholder="Jan Kowalski"
                    />
                  </FormRow>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <FormRow label="Funkcja" hint="np. oficer operacyjny">
                    <Input
                      value={form.reporterFunction}
                      onChange={(e) => set('reporterFunction', e.target.value)}
                      placeholder="oficer operacyjny"
                    />
                  </FormRow>
                  <FormRow label="Jednostka" hint="np. SK PSP Sulęcin">
                    <Input
                      value={form.reporterUnit}
                      onChange={(e) => set('reporterUnit', e.target.value)}
                      placeholder="SK PSP Sulęcin"
                    />
                  </FormRow>
                </div>
                <div className="pt-2 flex gap-2">
                  {(['M', 'F'] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => set('reporterGender', g)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                        form.reporterGender === g
                          ? 'bg-brand-700/50 border-brand-600 text-brand-300'
                          : 'border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                      )}
                    >
                      {g === 'M' ? 'powiadomił' : 'powiadomiła'}
                    </button>
                  ))}
                </div>

                <SectionHeading>Lokalizacja i zdarzenie</SectionHeading>
                <div className="grid grid-cols-2 gap-3">
                  <FormRow label="Data zdarzenia">
                    <Input
                      type="date"
                      value={form.date}
                      onChange={(e) => set('date', e.target.value)}
                    />
                  </FormRow>
                  <FormRow label="Godzina zgłoszenia">
                    <Input
                      type="time"
                      value={form.reportTime}
                      onChange={(e) => set('reportTime', e.target.value)}
                    />
                  </FormRow>
                </div>
                <div className="pt-2">
                  <FormRow
                    label={'Opis zdarzenia (po „o“)'}
                    hint='np. "pożarze Wielowsi koło Zarzynia", "pożarze lasu"'
                  >
                    <Input
                      value={form.incidentTextCivilian}
                      onChange={(e) => set('incidentTextCivilian', e.target.value)}
                      placeholder="pożarze lasu koło Zarzynia"
                    />
                  </FormRow>
                </div>
              </>
            )}

            {/* ── CZASY (common) ── */}
            <SectionHeading>Czasy</SectionHeading>
            <div className="grid grid-cols-3 gap-3">
              <FormRow label="Wyjazd">
                <Input
                  type="time"
                  value={form.departureTime}
                  onChange={(e) => set('departureTime', e.target.value)}
                />
              </FormRow>
              <FormRow label="Przyjazd">
                <Input
                  type="time"
                  value={form.arrivalTime}
                  onChange={(e) => set('arrivalTime', e.target.value)}
                />
              </FormRow>
              <FormRow label="Zakończenie">
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => set('endTime', e.target.value)}
                />
              </FormRow>
            </div>

            {/* ── PRZYCZYNA I SKUTKI (common) ── */}
            <SectionHeading>Przyczyna i skutki</SectionHeading>
            <FormRow
              label="Przyczyna pożaru"
              hint='np. "zaprószenie ognia podczas szkolenia", "podpalenie"'
            >
              <Input
                value={form.cause}
                onChange={(e) => set('cause', e.target.value)}
                placeholder="zaprószenie ognia podczas szkolenia ogniowego"
              />
            </FormRow>
            <div className="pt-2">
              <FormRow label="Co spaleniu uległo" hint='np. "ok. 50 arów traw i krzewów", "ponad hektar lasu"'>
                <Input
                  value={form.burned}
                  onChange={(e) => set('burned', e.target.value)}
                  placeholder="ok. 50 arów traw i krzewów"
                />
              </FormRow>
            </div>

            <div className="pt-2 space-y-2">
              <Checkbox
                checked={form.noCasualties}
                onChange={(v) => set('noCasualties', v)}
                label="Bez osób poszkodowanych"
              />
              {!form.noCasualties && (
                <Input
                  value={form.casualtiesCustom}
                  onChange={(e) => set('casualtiesCustom', e.target.value)}
                  placeholder="Opis osób poszkodowanych…"
                />
              )}
              <Checkbox
                checked={form.standardLosses}
                onChange={(v) => set('standardLosses', v)}
                label={
                  isMON
                    ? 'Bez strat w drzewostanie i mieniu wojskowym'
                    : 'Bez strat w mieniu wojskowym'
                }
              />
              {!form.standardLosses && (
                <Input
                  value={form.lossesCustom}
                  onChange={(e) => set('lossesCustom', e.target.value)}
                  placeholder="Opis strat…"
                />
              )}
            </div>

            {/* ── POJAZDY (MON) ── */}
            {isMON && (
              <>
                <SectionHeading>Pojazdy i obsada WSP</SectionHeading>
                <VehicleSelector
                  selected={form.selectedVehicles}
                  onChange={(v) => set('selectedVehicles', v)}
                />
              </>
            )}

            {/* ── JEDNOSTKI (Civilian) ── */}
            {!isMON && (
              <>
                <SectionHeading>Jednostki zewnętrzne (PSP / OSP)</SectionHeading>
                <ExternalUnitsManager
                  units={form.externalUnits}
                  onChange={(v) => set('externalUnits', v)}
                />

                <SectionHeading>Pojazdy WSP OSPWL Wędrzyn</SectionHeading>
                <VehicleSelector
                  selected={form.selectedVehicles}
                  onChange={(v) => set('selectedVehicles', v)}
                />

                {total > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs text-slate-500">Łącznie:</span>
                    <Badge variant="info">
                      {total} {pluralZastep(total)}
                    </Badge>
                  </div>
                )}
              </>
            )}

            {/* reset */}
            <div className="pt-4 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForm(DEFAULT_FORM)}
              >
                Wyczyść formularz
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── PREVIEW ── */}
        <PreviewPanel text={description} />
      </div>
    </div>
  )
}

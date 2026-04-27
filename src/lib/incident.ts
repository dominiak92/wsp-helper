export type IncidentCategory = 'MON' | 'CIVILIAN'

export interface Vehicle {
  id: string
  name: string
  defaultCrew: number
}

export const VEHICLES: Vehicle[] = [
  { id: 'glbm', name: 'GLBM 0,3', defaultCrew: 2 },
  { id: 'gba', name: 'GBA 2,5/16', defaultCrew: 4 },
  { id: 'gcba532', name: 'GCBA 5/32', defaultCrew: 3 },
  { id: 'gcba1060', name: 'GCBA 10/60', defaultCrew: 3 },
  { id: 'gcba850', name: 'GCBA 8/50 lotniskowy', defaultCrew: 3 },
]

export interface LocationDef {
  label: string
  locative: string
  preposition: 'na' | 'w'
}

export const LOCATIONS: LocationDef[] = [
  { label: 'Pas ćwiczeń taktycznych', locative: 'pasie ćwiczeń taktycznych', preposition: 'na' },
  { label: 'Strzelnica wozów bojowych (prawa)', locative: 'strzelnicy wozów bojowych (prawa)', preposition: 'na' },
  { label: 'Strzelnica wozów bojowych (lewa)', locative: 'strzelnicy wozów bojowych (lewa)', preposition: 'na' },
  { label: 'Strzelnica piechoty', locative: 'strzelnicy piechoty', preposition: 'na' },
  { label: 'Ośrodek zurbanizowany', locative: 'ośrodku zurbanizowanym', preposition: 'w' },
  { label: 'Lądowisko ośrodka zurbanizowanego', locative: 'lądowisku ośrodka zurbanizowanego', preposition: 'na' },
  { label: 'Rejon szkolenia taktycznego "SOBOLEWO"', locative: 'rejonie szkolenia taktycznego "SOBOLEWO"', preposition: 'w' },
  { label: 'Strzelnica do strzelań nawodnych "BUSZNO"', locative: 'strzelnicy do strzelań nawodnych "BUSZNO"', preposition: 'na' },
  { label: 'Ośrodek szkolenia inżynieryjno-saperskiego', locative: 'ośrodku szkolenia inżynieryjno-saperskiego', preposition: 'w' },
]

export type ExternalUnitType = 'PSP' | 'OSP' | 'OTHER'

export interface ExternalUnit {
  id: string
  type: ExternalUnitType
  name: string
  zastepCount: number
}

export interface VehicleEntry {
  vehicleId: string
  crew: number
}

export interface IncidentFormData {
  category: IncidentCategory

  // common
  date: string
  showYear: boolean
  reportTime: string
  departureTime: string
  arrivalTime: string
  cause: string
  burned: string
  noCasualties: boolean
  casualtiesCustom: string
  standardLosses: boolean
  lossesCustom: string
  selectedVehicles: VehicleEntry[]
  endTime: string

  // MON-specific
  reporter: string
  locationLabel: string
  incidentText: string

  // Civilian-specific
  reporterRank: string
  reporterName: string
  reporterFunction: string
  reporterUnit: string
  reporterGender: 'M' | 'F'
  incidentTextCivilian: string
  externalUnits: ExternalUnit[]
}

export const DEFAULT_FORM: IncidentFormData = {
  category: 'MON',
  date: '',
  showYear: false,
  reportTime: '',
  departureTime: '',
  arrivalTime: '',
  cause: '',
  burned: '',
  noCasualties: true,
  casualtiesCustom: '',
  standardLosses: true,
  lossesCustom: '',
  selectedVehicles: [],
  endTime: '',

  reporter: '',
  locationLabel: '',
  incidentText: 'pożarze traw',

  reporterRank: '',
  reporterName: '',
  reporterFunction: '',
  reporterUnit: '',
  reporterGender: 'M',
  incidentTextCivilian: '',
  externalUnits: [],
}

// ── helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string, showYear: boolean): string {
  if (!dateStr) return showYear ? '___.__.____' : '___.___'
  const [year, month, day] = dateStr.split('-')
  const base = `${parseInt(day)}.${month}`
  return showYear ? `${base}.${year}` : base
}

function t(val: string, placeholder: string): string {
  return val.trim() || placeholder
}

export function pluralZastep(n: number): string {
  if (n === 1) return 'zastęp gaśniczy'
  if (n >= 2 && n <= 4) return 'zastępy gaśnicze'
  return 'zastępów gaśniczych'
}

function verbZastep(n: number): string {
  if (n === 1) return 'prowadził'
  if (n >= 2 && n <= 4) return 'prowadziły'
  return 'prowadziło'
}

function pluralStrazak(n: number): string {
  return n === 1 ? 'strażak' : 'strażaków'
}

function buildVehicleList(selected: VehicleEntry[]): string {
  return selected
    .map((v) => {
      const veh = VEHICLES.find((x) => x.id === v.vehicleId)
      return veh ? `${veh.name} - ${v.crew} ${pluralStrazak(v.crew)}` : ''
    })
    .filter(Boolean)
    .join(', ')
}

// ── MON generator ─────────────────────────────────────────────────────────────

function generateMON(form: IncidentFormData): string {
  const location = LOCATIONS.find((l) => l.label === form.locationLabel)
  const locationStr = location
    ? `${location.preposition} ${location.locative}`
    : '[lokalizacja]'

  const dateStr = formatDate(form.date, form.showYear)
  const vehicleCount = form.selectedVehicles.length
  const vehicleList = buildVehicleList(form.selectedVehicles)

  const casualties = form.noCasualties
    ? 'Bez osób poszkodowanych'
    : t(form.casualtiesCustom, '[osoby poszkodowane]')
  const losses = form.standardLosses
    ? 'bez strat w drzewostanie i mieniu wojskowym'
    : t(form.lossesCustom, '[straty]')

  const lines: string[] = []

  lines.push(
    `W dniu ${dateStr} o godz. ${t(form.reportTime, '__:__')} ` +
      `${t(form.reporter, '[kto zgłosił]')} powiadomił WSP OSPWL Wędrzyn ` +
      `o ${t(form.incidentText, '[opis zdarzenia]')} ${locationStr}.`
  )
  lines.push(
    `Czas wyjazdu zastępu WSP OSPWL Wędrzyn o godz. ${t(form.departureTime, '__:__')}, ` +
      `czas przyjazdu zastępu na miejsce o godz. ${t(form.arrivalTime, '__:__')}.`
  )
  if (form.cause.trim())
    lines.push(`Prawdopodobną przyczyną pożaru było ${form.cause.trim()}.`)
  if (form.burned.trim())
    lines.push(`Spaleniu uległo ${form.burned.trim()}.`)
  lines.push(`${casualties}, ${losses}.`)

  if (vehicleCount > 0) {
    lines.push(
      `Działania gaśnicze ${verbZastep(vehicleCount)} ${vehicleCount} ` +
        `${pluralZastep(vehicleCount)} z WSP OSPWL Wędrzyn, ${vehicleList}.`
    )
  } else {
    lines.push('Działania gaśnicze prowadziły [brak pojazdów].')
  }

  lines.push(`Działania zakończone o godzinie ${t(form.endTime, '__:__')}.`)
  return lines.join('\n')
}

// ── Civilian generator ────────────────────────────────────────────────────────

function generateCivilian(form: IncidentFormData): string {
  // civilian always shows full date
  const dateStr = formatDate(form.date, true)

  const verb = form.reporterGender === 'F' ? 'powiadomiła' : 'powiadomił'
  const reporterLine =
    `${t(form.reporterRank, '[stopień]')} ${t(form.reporterName, '[imię i nazwisko]')}, ` +
    `${t(form.reporterFunction, '[funkcja]')} ${t(form.reporterUnit, '[jednostka]')}, ` +
    `${verb} dyżurnego WSP OSPWL Wędrzyn`

  const wspCount = form.selectedVehicles.length
  const externalTotal = form.externalUnits.reduce((s, u) => s + u.zastepCount, 0)
  const totalCount = wspCount + externalTotal

  const casualties = form.noCasualties
    ? 'Bez osób poszkodowanych'
    : t(form.casualtiesCustom, '[osoby poszkodowane]')
  const losses = form.standardLosses
    ? 'strat w mieniu wojskowym'
    : t(form.lossesCustom, '[straty]')

  const lines: string[] = []

  lines.push(
    `W dniu ${dateStr} ${reporterLine} ` +
      `o ${t(form.incidentTextCivilian, '[opis zdarzenia]')}.`
  )
  lines.push(
    `Czas wyjazdu zastępu WSP OSPWL Wędrzyn o godz. ${t(form.departureTime, '__:__')}.`
  )
  lines.push(`Czas przyjazdu zastępu na miejsce ${t(form.arrivalTime, '__:__')}.`)
  if (form.cause.trim())
    lines.push(`Prawdopodobną przyczyną pożaru było ${form.cause.trim()}.`)
  if (form.burned.trim())
    lines.push(`Spaleniu uległo ${form.burned.trim()}.`)
  lines.push(`${casualties} oraz ${losses}.`)

  if (totalCount > 0) {
    lines.push(
      `Działania gaśnicze ${verbZastep(totalCount)} ${totalCount} ${pluralZastep(totalCount)}.`
    )

    // build unit parts
    const parts: string[] = []
    for (const u of form.externalUnits) {
      const prefix = u.type === 'OSP' ? 'z ' : ''
      const typeName = u.type !== 'OTHER' ? `${u.type} ` : ''
      parts.push(
        `${u.zastepCount} ${pluralZastep(u.zastepCount)} ${prefix}${typeName}${u.name || '[nazwa]'}`
      )
    }
    if (wspCount > 0) {
      const vList = buildVehicleList(form.selectedVehicles)
      parts.push(
        `${wspCount} ${pluralZastep(wspCount)} WSP OSPWL Wędrzyn` +
          (vList ? ` (${vList})` : '')
      )
    }

    // join: all before last pair as separate sentences, last two with "oraz"
    if (parts.length === 1) {
      lines.push(`${parts[0]}.`)
    } else {
      for (let i = 0; i < parts.length - 1; i++) {
        if (i < parts.length - 2) {
          lines.push(`${parts[i]}.`)
        } else {
          lines.push(`${parts[i]} oraz ${parts[i + 1]}.`)
          break
        }
      }
    }
  }

  lines.push(`Działania zakończono o godz. ${t(form.endTime, '__:__')}.`)
  return lines.join('\n')
}

// ── public API ────────────────────────────────────────────────────────────────

export function generateDescription(form: IncidentFormData): string {
  return form.category === 'MON' ? generateMON(form) : generateCivilian(form)
}

export function totalZastepy(form: IncidentFormData): number {
  const wsp = form.selectedVehicles.length
  const ext = form.externalUnits.reduce((s, u) => s + u.zastepCount, 0)
  return wsp + ext
}

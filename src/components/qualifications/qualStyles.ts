import type { QualLevel } from '../../lib/qualifications'

// Kolory poziomu terminu: po terminie / ≤ 30 dni / w oknie przypomnienia / ważny / brak daty
export const LEVEL_STYLES: Record<QualLevel, {
  label: string; dot: string; bar: string; text: string; border: string; tile: string
}> = {
  expired: {
    label: 'Po terminie', dot: 'bg-red-500', bar: 'bg-red-500', text: 'text-red-300',
    border: 'border-red-800/70', tile: 'bg-red-950/60 border-red-800/70',
  },
  critical: {
    label: 'Do 30 dni', dot: 'bg-orange-500', bar: 'bg-orange-500', text: 'text-orange-300',
    border: 'border-orange-800/60', tile: 'bg-orange-950/50 border-orange-800/60',
  },
  soon: {
    label: 'Kończy się', dot: 'bg-amber-400', bar: 'bg-amber-400', text: 'text-amber-300',
    border: 'border-amber-900/60', tile: 'bg-amber-950/30 border-amber-900/60',
  },
  ok: {
    label: 'Ważne', dot: 'bg-emerald-500', bar: 'bg-emerald-500', text: 'text-emerald-300',
    border: 'border-slate-700/40', tile: 'bg-emerald-950/20 border-emerald-900/40',
  },
  missing: {
    label: 'Brak daty', dot: 'bg-slate-600', bar: 'bg-slate-600', text: 'text-slate-500',
    border: 'border-slate-700/40', tile: 'bg-surface-900 border-slate-800',
  },
}

export const LEVEL_ORDER: QualLevel[] = ['expired', 'critical', 'soon', 'ok', 'missing']

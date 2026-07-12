import { useState } from 'react'
import { Pencil, X, Shield } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { Person, RoleType, AbsenceType } from '../../lib/crew'
import { ALL_ROLES, ROLE_LABELS, ROLE_COLORS, ABSENCE_LABELS, SOLDIER_RANKS } from '../../lib/crew'

export function RoleChip({ role }: { role: RoleType }) {
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium leading-none', ROLE_COLORS[role])}>
      {ROLE_LABELS[role]}
    </span>
  )
}

export function AbsenceSelect({ value, onChange }: {
  value: AbsenceType | null
  onChange: (v: AbsenceType | null) => void
}) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange((e.target.value as AbsenceType) || null)}
      className={cn(
        'text-[10px] py-0.5 px-1 rounded border bg-surface-900 cursor-pointer outline-none',
        value ? 'text-red-400 border-red-800' : 'text-slate-500 border-slate-700 hover:border-slate-500'
      )}
    >
      <option value="">Obecny</option>
      {(Object.keys(ABSENCE_LABELS) as AbsenceType[]).map(k => (
        <option key={k} value={k}>{ABSENCE_LABELS[k]}</option>
      ))}
    </select>
  )
}

export function PersonnelRow({ person, onUpdate, onDelete, notAssigned }: {
  person: Person
  onUpdate: (p: Person) => void
  onDelete: (id: string) => void
  notAssigned?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(person.name)
  const absent = !!person.absence

  function toggleRole(role: RoleType) {
    const has = person.roles.includes(role)
    if (has && person.roles.length === 1) return
    const roles = has ? person.roles.filter(r => r !== role) : [...person.roles, role]
    onUpdate({ ...person, roles })
  }

  function handleSave() {
    const trimmed = editName.trim()
    if (!trimmed) return
    onUpdate({ ...person, name: trimmed })
    setEditing(false)
  }

  function handleCancel() {
    setEditName(person.name)
    setEditing(false)
  }

  return (
    <div className={cn(
      'p-2 rounded-lg border bg-surface-900',
      absent && !editing ? 'border-slate-800 opacity-50' : notAssigned ? 'border-amber-900/50' : 'border-slate-800'
    )}>
      <div className="flex items-center gap-1.5">
        {editing ? (
          <input
            className="text-sm font-medium bg-surface-800 border border-slate-700 rounded px-1.5 py-0.5 text-white flex-1 min-w-0 outline-none focus:border-brand-500"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel() }}
            autoFocus
          />
        ) : (
          <span className={cn('text-sm font-medium text-white flex-1 truncate flex items-center gap-1.5', absent && 'line-through')}>
            {person.isSoldier && (
              <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="currentColor" aria-label="Żołnierz" />
            )}
            <span className="truncate">{person.name}</span>
          </span>
        )}
        {notAssigned && !editing && (
          <span className="text-[10px] font-medium text-amber-600 shrink-0">poza obsadą</span>
        )}
        <button
          onClick={() => editing ? handleCancel() : setEditing(true)}
          className="text-slate-600 hover:text-slate-300 transition-colors shrink-0"
          title={editing ? 'Anuluj' : 'Edytuj'}
        >
          {editing ? <X className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
        </button>
        {!absent && (
          <button
            onClick={() => onUpdate({ ...person, partial8h: !person.partial8h })}
            title="Obecny tylko 8h dzisiaj"
            className={cn(
              'text-[10px] py-0.5 px-1.5 rounded border font-medium leading-none shrink-0 transition-colors',
              person.partial8h
                ? 'text-amber-300 border-amber-700 bg-amber-950/40'
                : 'text-slate-500 border-slate-700 hover:border-slate-500',
            )}
          >
            8h
          </button>
        )}
        <AbsenceSelect value={person.absence} onChange={v => onUpdate({ ...person, absence: v, partial8h: v ? false : person.partial8h })} />
      </div>
      <div className="flex gap-1 flex-wrap mt-1.5">
        {person.roles.map(r => <RoleChip key={r} role={r} />)}
      </div>
      {editing && (
        <div className="mt-2 pt-2 border-t border-slate-800 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onUpdate({ ...person, isSoldier: !person.isSoldier, rank: person.isSoldier ? null : person.rank })}
              className={cn(
                'flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded border font-medium leading-none transition-colors',
                person.isSoldier
                  ? 'text-emerald-300 border-emerald-700 bg-emerald-950/40'
                  : 'text-slate-500 border-slate-700 hover:border-slate-500',
              )}
              title="Żołnierz — liczony w kalkulatorze godzin"
            >
              <Shield className="w-3 h-3" fill={person.isSoldier ? 'currentColor' : 'none'} />
              Żołnierz
            </button>
            {person.isSoldier && (
              <select
                value={person.rank ?? ''}
                onChange={e => onUpdate({ ...person, rank: e.target.value || null })}
                className="text-[10px] py-0.5 px-1 rounded border bg-surface-900 text-slate-300 border-slate-700 hover:border-slate-500 cursor-pointer outline-none"
                title="Stopień"
              >
                <option value="">— stopień —</option>
                {SOLDIER_RANKS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
          </div>
          <div className="flex gap-1 flex-wrap">
            {ALL_ROLES.map(role => {
              const active = person.roles.includes(role)
              return (
                <button
                  key={role}
                  onClick={() => toggleRole(role)}
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                    active
                      ? ROLE_COLORS[role]
                      : 'text-slate-600 border-slate-700 hover:text-slate-400 hover:border-slate-500'
                  )}
                >
                  {ROLE_LABELS[role]}
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => { if (confirm(`Usunąć ${person.name}?`)) onDelete(person.id) }}
              className="text-[10px] text-red-700 hover:text-red-400 transition-colors"
            >
              Usuń osobę
            </button>
            <button
              onClick={handleSave}
              className="text-[10px] px-2 py-0.5 rounded bg-brand-700 hover:bg-brand-600 text-white transition-colors"
            >
              Zapisz
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function AddPersonForm({ onAdd, onCancel }: {
  onAdd: (name: string, roles: RoleType[]) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [roles, setRoles] = useState<RoleType[]>(['RESCUER'])

  function toggleRole(role: RoleType) {
    const has = roles.includes(role)
    if (has && roles.length === 1) return
    setRoles(has ? roles.filter(r => r !== role) : [...roles, role])
  }

  return (
    <div className="p-2 rounded-lg border border-brand-900 bg-surface-900 space-y-2">
      <input
        className="w-full text-sm bg-surface-800 border border-slate-700 rounded px-1.5 py-1 text-white outline-none focus:border-brand-500 placeholder:text-slate-600"
        placeholder="Imię i nazwisko"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onAdd(name.trim(), roles); if (e.key === 'Escape') onCancel() }}
        autoFocus
      />
      <div className="flex gap-1 flex-wrap">
        {ALL_ROLES.map(role => {
          const active = roles.includes(role)
          return (
            <button
              key={role}
              onClick={() => toggleRole(role)}
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                active
                  ? ROLE_COLORS[role]
                  : 'text-slate-600 border-slate-700 hover:text-slate-400 hover:border-slate-500'
              )}
            >
              {ROLE_LABELS[role]}
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-between">
        <button onClick={onCancel} className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
          Anuluj
        </button>
        <button
          onClick={() => { if (name.trim()) onAdd(name.trim(), roles) }}
          disabled={!name.trim()}
          className="text-[10px] px-2 py-0.5 rounded bg-brand-700 hover:bg-brand-600 text-white transition-colors disabled:opacity-40"
        >
          Dodaj
        </button>
      </div>
    </div>
  )
}

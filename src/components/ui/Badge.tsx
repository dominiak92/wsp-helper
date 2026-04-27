import { cn } from '../../lib/utils'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline'
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'bg-slate-700 text-slate-200',
    success: 'bg-alert-green/20 text-alert-green border border-alert-green/30',
    warning: 'bg-alert-amber/20 text-alert-amber border border-alert-amber/30',
    danger: 'bg-alert-red/20 text-alert-red border border-alert-red/30',
    info: 'bg-brand-900/40 text-brand-300 border border-brand-700/40',
    outline: 'border border-slate-600 text-slate-300',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold tracking-wide',
        variants[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }

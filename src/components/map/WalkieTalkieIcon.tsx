// Ikona krótkofalówki (radio do ręki) — własna, bo lucide nie ma walkie-talkie
export function WalkieTalkieIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M16 2.5V6" />
      <rect x="6.5" y="6" width="11" height="15.5" rx="2" />
      <rect x="9.5" y="9" width="5" height="3.2" rx="0.6" />
      <path d="M10 15.5h4M10 18h4" />
      <path d="M4 9.5v3.5" />
    </svg>
  )
}

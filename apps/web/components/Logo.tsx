import { useId } from 'react'

/**
 * My Account logo — ribbon monogram "M" (sand → terracotta) + wordmark.
 * Variants follow brand guideline §03: color (on Warm Beige), reversed (on Dark Espresso), mono.
 * Clear space: keep at least half the M's height around the logo. v1 vector approximation of the supplied master art.
 */
export function LogoMark({ size = 32, variant = 'color' }: { size?: number; variant?: 'color' | 'mono' | 'mono-light' }) {
  const id = useId().replace(/:/g, '')
  const stroke = variant === 'color' ? `url(#${id})` : variant === 'mono' ? '#4A2C22' : '#FFFFFF'
  return (
    <svg width={size} height={(size * 56) / 80} viewBox="0 0 80 56" aria-hidden focusable="false">
      {variant === 'color' && (
        <defs>
          <linearGradient id={id} x1="6" y1="50" x2="74" y2="8" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#F0CFA9" />
            <stop offset="0.45" stopColor="#DDA386" />
            <stop offset="1" stopColor="#C97B63" />
          </linearGradient>
        </defs>
      )}
      <path d="M12 46 26 14 40 38 54 14 68 46" fill="none" stroke={stroke} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ reversed = false, size = 28, tagline = false }: { reversed?: boolean; size?: number; tagline?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" aria-label="My Account">
      <LogoMark size={size * 1.4} />
      <span className="leading-none">
        <span className={`block text-[1.05em] font-extrabold tracking-tight ${reversed ? 'text-white' : 'text-primary-strong'}`}>My Account</span>
        {tagline && <span className={`mt-1 block text-[10px] font-medium ${reversed ? 'text-taupe' : 'text-muted-fg'}`}>One workspace. Every company.</span>}
      </span>
    </span>
  )
}

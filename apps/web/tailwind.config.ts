import type { Config } from 'tailwindcss'

// Colours come from CSS variables defined in app/globals.css (Sand Elegance, see design-system/accounting-os/MASTER.md).
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: v('primary'), strong: v('primary-strong'), soft: v('primary-soft') },
        accent: { DEFAULT: v('accent'), deep: v('accent-deep') },
        surface: v('card'),
        canvas: v('bg'),
        cream: v('cream'),
        taupe: { DEFAULT: v('muted'), deep: v('taupe-deep') },
        muted: { DEFAULT: v('muted'), fg: v('muted-fg') },
        line: v('border'),
        danger: v('danger'),
        success: v('success'),
        warning: v('warning'),
        info: v('info'),
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        // Amounts use Plus Jakarta Sans with tabular-nums (brand guideline); `mono` kept only for codes/IDs.
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { xl: '12px' },
    },
  },
  plugins: [],
} satisfies Config

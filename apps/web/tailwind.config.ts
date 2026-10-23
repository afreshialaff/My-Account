import type { Config } from 'tailwindcss'

// Colours come from CSS variables defined in app/globals.css (see design-system/accounting-os/MASTER.md).
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: v('primary'), strong: v('primary-strong'), soft: v('primary-soft') },
        accent: v('accent'),
        surface: v('card'),
        canvas: v('bg'),
        muted: { DEFAULT: v('muted'), fg: v('muted-fg') },
        line: v('border'),
        danger: v('danger'),
        success: v('success'),
        warning: v('warning'),
      },
      fontFamily: {
        sans: ['"Fira Sans"', 'system-ui', 'sans-serif'],
        mono: ['"Fira Code"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config

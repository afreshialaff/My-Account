# My Account — Design System (MASTER)

Source of truth for UI decisions. Brand: **My Account — Sand Elegance v1.0** ("Quiet Luxury meets Modern Accounting SaaS", tagline *One workspace. Every company.*).
Reference art: `assets/logo-reference.png`, `assets/brand-board-reference.png`. Page-specific overrides live in `pages/<page>.md`.

## Tricolor 60 / 30 / 10

| Share | Colour | Token | Use |
|---|---|---|---|
| 60% | Warm Beige `#F7EFE6` | `--bg` (+ Cream `#FAF7F2` for header/table head, white cards) | canvas, spacious surfaces |
| 30% | Soft Taupe `#D6CCC1` | `--muted`, `--border` (softened), `--taupe-deep #B9A99B` | borders, section fills, sidebar secondary text |
| 10% | Terracotta `#C97B63` | `--accent`, `--accent-deep #9C4A34` | selected-state bar, KPI top bars, icon hover, focus/input accent |
| utility | Dark Espresso `#4A2C22` | `--primary`, `--primary-strong` | text, sidebar, primary buttons |

The ratio is a composition rule, not a pixel quota: dense data pages let Cream/white dominate (guideline §08).

## Contrast (computed, WCAG)

| Pair | Ratio | Decision |
|---|---|---|
| Espresso on Beige / white | 11.0 / 12.5 | all body text, primary button label |
| White on Terracotta | 3.2 | **not used for small text**; terracotta is decoration/selected state only |
| Espresso on Terracotta | 3.9 | not used for small text |
| Terracotta-deep `#9C4A34` on white / beige | 6.1 / 5.4 | links, small accent text |
| Muted text `#6F5A50` on beige / white | 5.7 / 6.5 | secondary text (never on Taupe fills: 4.1) |
| Warning `#B8860B` on white | 3.3 | text uses deepened `#8A6508`; original only as fill |
| Info `#4F7DBC` on white | 4.2 | text uses deepened `#3F6AA5` |

## Typography
Plus Jakarta Sans only. Display 40–48 bold · H1 32–36 bold (app pages use 28) · H2 24–28 semibold · H3 20–24 semibold · body 14–16 · tables/financial data 13–14 medium · caption 12.
Financial figures: `font-variant-numeric: tabular-nums`, right-aligned (`.num`), negatives in parentheses and red **plus** the sign, never colour alone. Monospace is kept only for codes/IDs.

## Components
Radius 8–12 px (inputs/buttons 8, cards 12), 1px taupe borders, very light shadow, sidebar Espresso with terracotta inset bar for the active item, outline Lucide icons, status badges always carry a text label.

## UX rules added in this rebuild
Ctrl/⌘+K menu search · dashboard quick actions · company switcher always visible in the header · unfinished modules stay marked "Segera" (never mock data) · 38px minimum control height.

## Accessibility
4.5:1 text contrast, visible focus ring (`--accent-deep`), labelled icon buttons, `aria-describedby` for errors, error summary `role="alert"`, `prefers-reduced-motion` honoured.

## Still to do (guideline §08)
Master vector logo (the in-app monogram is a v1 vector approximation of the supplied art), reversed/mono SVG files, favicon set, exported design tokens for developers.

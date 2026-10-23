# Accounting OS — Design System (MASTER)

Source of truth for UI decisions. Page-specific overrides live in `pages/<page>.md`.
Derived with the project skill `.claude/skills/ui-ux-pro-max` (searches run 2026-10-23):

| Decision | Choice | Source |
|---|---|---|
| Style | Minimalism & Swiss Style — clean, grid-based, high contrast, functional | `--design-system` result (style) |
| Density | Dense / dashboard (8–32px spacing) | `--density 8` |
| Palette | "Banking/Traditional Finance": trust navy + gold accent, **light** surfaces | `--domain color` result #2 |
| Typography | Fira Sans (UI) + Fira Code (amounts, codes) — "Dashboard Data" pairing | `--domain typography` result #1 |
| Motion | Subtle only (150–250ms colour/opacity), honour `prefers-reduced-motion` | dials `--motion 2` |

Deliberate deviation: the generated system suggested a dark default. Accountants work long sessions
in dense tables and the reference products (Jurnal, Accurate) are light-first, so the app is light-first.
The landing-page "Enterprise Gateway" pattern from the same search did not fit an application UI and was not used.

## Tokens (CSS variables in `apps/web/app/globals.css`)

| Token | Value | Use |
|---|---|---|
| `--primary` | `#1E3A8A` | primary buttons, links, active nav |
| `--primary-strong` | `#0F172A` | sidebar, headings |
| `--accent` | `#A16207` | highlights, "demo/sandbox" marker |
| `--bg` | `#F8FAFC` | page background |
| `--card` | `#FFFFFF` | surfaces |
| `--muted` | `#E8ECF1` | table headers, chips |
| `--muted-fg` | `#475569` | secondary text (≥4.5:1 on white) |
| `--border` | `#E2E8F0` | dividers |
| `--danger` | `#DC2626` | destructive, unbalanced |
| `--success` | `#047857` | posted, balanced |

## Rules (from the skill's priority table)

1. Accessibility: 4.5:1 text contrast, visible focus rings, labelled icon buttons, `aria-describedby` for field errors, error summary with `role="alert"`.
2. Interaction: loading feedback on every async action, disabled state while pending, no hover-only affordances.
3. Layout: desktop-first dense tables in `overflow-x-auto` wrappers; usable at 375px; no horizontal page scroll.
4. Icons: Lucide SVG only, never emoji.
5. Numbers: right-aligned, `tabular-nums`, Fira Code, negatives in parentheses; amounts are formatted from decimal strings (never via JS floats).
6. Status colours always paired with a text label (never colour alone).
7. Unfinished modules are shown as **Segera hadir** with their sprint, never as working screens.

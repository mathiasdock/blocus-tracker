# UI conventions — blocus-tracker

## Design direction — "l'instrument de focus"

L'app est un instrument de mesure du temps d'étude. Trois piliers :
- **Bricolage Grotesque** (`font-display`) pour les titres — h1/h2/h3 l'appliquent automatiquement (700, tracking -0.02em).
- **Space Grotesk** (`font-num` + `tabular-nums`) pour TOUT chiffre affiché en grand : chrono, stats, records, XP.
- **Surface "ink"** (`.card-ink`, vert profond) réservée aux moments de marque : hero chrono "Aujourd'hui", records. Jamais pour du contenu courant.

Les deux fontes sont chargées via Google Fonts dans `pages/_document.js`.

## Design tokens

All colors live in `styles/globals.css` as CSS variables. **Never hardcode** colors except for the brand accent.

### Brand accent (light theme)
| Token | Hex | Use |
|-------|-----|-----|
| `--bt-accent` / `#14B885` | green | primary buttons, active states |
| `--bt-accent-dark` / `#0E8F68` | dark green | hover, success text |
| `--bt-accent-bg` / `#EAFBF4` | tint | hover bg, soft pills |
| `--bt-accent-border` / `#C6EED9` | soft | pill borders |

### Neutrals (light + dark via `.dark`)
| Token | Use |
|-------|-----|
| `--bt-bg` | page background |
| `--bt-surface` | card background |
| `--bt-subtle` | input bg, secondary surface |
| `--bt-border` | dividers, card borders |
| `--bt-text-1` | primary text |
| `--bt-text-2` | secondary text |
| `--bt-text-3` | tertiary / muted text |
| `--bt-text-4` | quaternary / placeholders |
| `--bt-shadow` | card shadows |

### Ink surface (brand moments only)
| Token | Use |
|-------|-----|
| `--bt-ink` | deep green surface bg |
| `--bt-ink-soft` | ink gradient top |
| `--bt-ink-text` | primary text on ink |
| `--bt-ink-muted` | secondary text on ink |
| `--bt-ink-border` | hairline border on ink |

### Misc
| Token | Use |
|-------|-----|
| `--bt-auth-overlay` | veil over auth photo (white in light, dark in dark) |
| `--bt-scrollbar` / `--bt-scrollbar-h` | theme-aware scrollbar thumb |

### Status colors (hardcoded — used sparingly)
- Red: `#ef4444` (delete, errors, heart ♥)
- Amber/gold: `#FBBF24` (XP, badges)

## Component classes (in `styles/globals.css`)

| Class | Use |
|-------|-----|
| `card` | rounded card (20px) with surface bg + border + soft shadow |
| `card-ink` | deep-green brand-moment card (radial accent veil) |
| `card-lift` | subtle hover lift for interactive cards (desktop only) |
| `btn-primary` | green gradient CTA button (press feedback built-in) |
| `btn-ghost` | transparent secondary button |
| `input` | text input with subtle bg |
| `label` | small uppercase form label |
| `font-num` | Space Grotesk — pair with `tabular-nums` for any displayed number |
| `bt-rise` | fade-up entrance for a single element |
| `bt-stagger` | parent class: direct children fade-up with staggered delays |

## Layout

- **Desktop sidebar**: 232px wide, fixed left, visible at `lg:` breakpoint (1024px+).
- **Mobile topbar**: 48px tall, sticky, with `env(safe-area-inset-top)` padding for iOS notch.
- **Mobile bottom nav**: 56px tall + `env(safe-area-inset-bottom)`, 5 tabs.
- **Social sub-nav**: sticky under topbar on mobile when path ∈ `/feed /friends /messages /communautes`.

## Mobile

- Primary breakpoint: `sm:` = 640px+ for tablet, `lg:` = 1024px+ for desktop. Mobile-first by default.
- Use `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)` for any fixed top/bottom bar.
- Touch targets ≥ 44×44px (Apple HIG).
- Long-press: 600ms timer is the project standard (see `feed.js` reactors panel).
- Images in feeds: `aspectRatio: "4/3"` wrapper with `object-cover` for consistent display on iPhone + desktop.
- Hide scrollbars in inner scrollers:
  ```jsx
  className="[&::-webkit-scrollbar]:hidden"
  style={{ overflowY: "auto", scrollbarWidth: "none" }}
  ```

## Inline styles vs Tailwind

The codebase mixes both. Match the surrounding pattern:
- Static layout, generic spacing → Tailwind classes
- Theme-aware colors (CSS vars) → `style={{ color: "var(--bt-text-1)" }}`
- One-off pixel-perfect values → inline `style={{...}}`
- Hover effects on non-button elements → `onMouseEnter` / `onMouseLeave` setting inline styles (look at `Layout.js` patterns)

## Animations

CSS keyframes in `globals.css`:
- `bt-pulse-green` — running chrono glow
- `bt-press` — `scale(0.96)` on `:active`
- `bt-xp-float` — XP gain ghost rising
- `badge-shine` — badge unlock pop
- `bt-check-pop` — mission check stamp

Apply via class names. All respect `@media (prefers-reduced-motion: reduce)`.

## Dark mode

Activated by adding `.dark` class on `<html>` (Tailwind's `darkMode: "class"` strategy). All component classes use CSS variables that switch automatically. **Never** write `dark:` Tailwind variants — the CSS variable system handles it.

## Anti-patterns

- ❌ `color: "white"` for text on a card (breaks dark mode)
- ❌ `bg-gray-100` Tailwind (use `var(--bt-subtle)`)
- ❌ New green shades — use `#14B885` family only
- ❌ Modals without `e.stopPropagation()` on the inner card (clicks bubble to backdrop)
- ❌ Fixed `top: 0` without `env(safe-area-inset-top)` (clipped by iPhone notch)

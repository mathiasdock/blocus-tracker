---
name: ui-fix
description: Apply small, safe UI tweaks to existing pages/components. Use for color, spacing, text, icon, layout, or styling changes that don't change app logic, data flow, or Supabase calls. Keeps the existing design system (CSS variables --bt-*, accent #14B885, Tailwind classes, card/btn-primary/input components) intact.
---

# ui-fix — Small UI changes the safe way

## When to use
- Change a color, padding, font size, border radius
- Swap an icon
- Reword a label (then trigger `add-i18n` too)
- Tighten spacing or alignment
- Move a button, change its variant
- Add/remove a visual badge or pill

## When NOT to use
- Adding a new data source or fetch
- Changing Supabase queries / RLS-relevant code
- Refactoring an entire page
- Adding a new route
- Modifying auth or notification logic

## Hard rules (don't break the design system)
1. **Colors**: use CSS variables (`var(--bt-text-1)`, `var(--bt-surface)`, etc.) or accent `#14B885` / `#0E8F68` / `#EAFBF4` / `#C6EED9`. Never invent a new color.
2. **Components**: prefer `card`, `btn-primary`, `btn-ghost`, `input`, `label` classes from `styles/globals.css` over custom inline styles.
3. **Tailwind**: use existing utilities. The project mixes Tailwind classes + inline `style={{...}}` — match the surrounding style.
4. **Dark mode**: all colors must work in dark mode via CSS variables. Never hardcode `#fff` or `#000` for background/text.
5. **i18n**: every visible string must come from `t("...")`. If you add a new string, follow `add-i18n` skill.
6. **No logic changes**: don't touch fetch calls, state hooks, `useEffect` dependencies, Supabase RPC names.

## Workflow
1. Read the target file (don't read more than 1 file unless required).
2. Identify the exact lines to change.
3. Use `Edit` with precise old_string + new_string (never rewrite the file).
4. If a new string appears, add FR + EN keys in `lib/i18n.js` (use `add-i18n`).
5. Don't run `npm run build` unless the user asks — just confirm the change and stop.

## Reference
- Design tokens: `styles/globals.css` lines 23–56
- Component classes: `styles/globals.css` (`@layer components`)
- See `docs/UI.md` for the full convention guide.

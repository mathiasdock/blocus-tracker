---
name: mobile-polish
description: Apply mobile-first polish to a page or component — touch targets, safe-area insets, iPhone notch/home indicator handling, scroll behavior, responsive breakpoints. Use when the user mentions iPhone, mobile, touch, or PWA rendering issues.
---

# mobile-polish — iPhone-first refinements

## Context
Blocus Tracker is a PWA used primarily on iPhone. Mobile rendering takes priority over desktop. The Layout uses:
- `lg:` breakpoint (1024px+) for desktop sidebar
- Bottom nav (5 tabs) on mobile only (`lg:hidden`)
- `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` for iOS notch & home indicator
- `backdrop-filter: blur(10px)` for sticky top/bottom bars

## Rules
1. **Touch targets ≥ 44×44px** on interactive elements (Apple HIG).
2. **Safe areas**: any fixed/sticky element at top or bottom must respect `env(safe-area-inset-*)`. Look at `components/Layout.js` for the pattern.
3. **Scroll**: prefer `[&::-webkit-scrollbar]:hidden` and `scrollbarWidth: "none"` for clean inner scrollers.
4. **Aspect ratios**: for images in feeds, use `aspectRatio: "4/3"` wrapper + `object-cover` (see feed.js after the recent fix).
5. **No horizontal scroll**: `html { overflow-x: hidden; }` is set globally — don't accidentally let a child overflow with negative margins.
6. **Long-press**: `setTimeout(fn, 600)` is the project standard for long-press gestures (see feed.js reactors panel).
7. **Tap highlight**: don't disable `-webkit-tap-highlight-color` without reason.
8. **Fixed sizes in `px`**: existing code uses many inline `px` values. Match the surrounding style — don't introduce a different system.

## When checking iPhone rendering
- Open Safari DevTools or Chrome DevTools → toggle device toolbar → iPhone 14 Pro (390×844)
- Test both portrait and landscape
- Test scroll past the bottom nav
- Test long-press gestures

## When NOT to use
- Desktop-only fixes (use `ui-fix` instead)
- Logic changes
- Adding new features

## Reference
- Layout patterns: `components/Layout.js`
- Recent mobile improvement examples: `pages/feed.js` (aspect ratio, long-press)
- See `docs/UI.md` → "Mobile" section

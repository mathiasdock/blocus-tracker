---
name: add-i18n
description: Safely add or rename i18n keys in lib/i18n.js without reading the full 1000-line file. Always inserts the key in BOTH the fr and en blocks. Use whenever a new visible string is added or an existing one is edited.
---

# add-i18n — Add bilingual keys without reading the whole file

## Why this skill exists
`lib/i18n.js` is **~1005 lines** with ~465 keys per language. Reading the full file every time wastes tokens. Use targeted `Grep` to find anchor points, then `Edit` to insert.

## Rules
1. **Every key must exist in BOTH `fr` and `en`.** Never add a key to only one block — the missing language fallbacks to displaying the raw key (ugly).
2. **Naming**: dot-namespaced (`feed.editPost`, `stats.publicLeaderTitle`). Use the page or domain as prefix.
3. **Never hardcode French in JSX.** Always `t("...")`.
4. **Casing & punctuation must match between FR and EN.** If FR ends with `…`, so should EN. If FR has a colon, EN does too.

## Workflow (efficient)

### Adding a NEW key

1. Pick a namespace prefix (e.g. `feed.foo`).
2. Grep for an existing key in that namespace to find the FR insertion anchor:
   ```
   Grep pattern: "feed.addReaction", path: lib/i18n.js
   ```
3. Insert the new FR key just after that line using `Edit`.
4. Grep again for the same anchor key — there will be a second match (the EN block). Insert the EN translation there.
5. Verify the file still parses (no missing comma).

### Editing an EXISTING key

1. Grep for the key to find both occurrences (FR + EN).
2. Edit both with separate `Edit` calls (since the surrounding context differs).

## Bilingual style guide
- **Verbs**: FR imperative ("Modifier"), EN imperative ("Edit"). Not gerund.
- **Loading**: FR "Chargement…", EN "Loading…" (ellipsis matches).
- **Empty states**: FR positive ("Rien encore — lance-toi !"), EN matches tone.
- **Time**: FR "Aujourd'hui" / EN "Today", FR "7 derniers jours" / EN "Last 7 days"
- **Levels**: FR "Niv. X" / EN "Lv. X" (key `xp.level`)

## Anti-patterns (never do this)
- ❌ `<span>Modifier</span>` — hardcoded FR
- ❌ Adding key to `fr` only and "I'll do `en` later" — break the UI for EN users immediately
- ❌ Removing a key without checking all usages with `Grep "t(\"key.name\""`
- ❌ Reading the entire `lib/i18n.js` file with `Read` (too expensive)

## Example session
```
User: "Add a button 'Annuler' that says 'Cancel' in English"

1. Grep: "common.cancel" in lib/i18n.js  → already exists! Use t("common.cancel")
2. No need to add anything. Just reference the existing key.
```

```
User: "Add a 'Modifier le profil' button"

1. Grep: "profile.edit" in lib/i18n.js  → not found
2. Grep: "profile." in lib/i18n.js  → find a nearby anchor, e.g. "profile.totalHours"
3. Edit FR block: add "profile.editProfile": "Modifier le profil",
4. Edit EN block: add "profile.editProfile": "Edit profile",
```

## Reference
- Full convention: `docs/I18N.md`
- File: `lib/i18n.js`

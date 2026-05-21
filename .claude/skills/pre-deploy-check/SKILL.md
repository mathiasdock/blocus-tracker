---
name: pre-deploy-check
description: Run a fast pre-deploy checklist before pushing to main. Verifies build passes, no env vars leaked, no hardcoded French strings, no untracked critical files. Vercel auto-deploys on push, so this is the last gate.
disable-model-invocation: true
---

# pre-deploy-check — Last gate before `git push`

> **Manual-only skill.** Invoke explicitly with `/pre-deploy-check` — Claude will never trigger this automatically. This is a deliberate "ready to ship?" gate; only run it when you've decided to deploy.

Vercel deploys automatically on every push to `main`. This skill runs a fast sanity check before committing.

## Checklist

### 1. Build passes locally
```bash
npm run build
```
Must show `✓ Compiled successfully`. If it fails, **stop** and fix before pushing.

### 2. No env vars in git
```bash
git status
git diff --cached
```
Look for accidental `.env*` files in staged changes. The `.gitignore` should catch this but double-check.

### 3. No hardcoded French strings in JSX
```
Grep pattern: >[A-Z][a-zéèêàù][^<{]+<  in pages/ and components/
```
Any visible text should come from `t("...")`. False positives are OK — just review.

### 4. No service_role key client-side
```
Grep pattern: SERVICE_ROLE in pages/ components/ contexts/ lib/
```
Should only appear in `pages/api/login.js`. Anywhere else = leak.

### 5. No untracked assets
```bash
git status --short
```
Look for `??` lines for `public/` images, fonts, or files that the code references but aren't committed. (We had this exact bug with `format pc.png` / `format tel.png`.)

### 6. Lint
```bash
npm run lint
```
Optional but recommended. ESLint errors block Vercel build.

### 7. Migration consistency
If you added a `supabase/migration_*.sql` in this commit, remind the user:
- "You still need to paste this in Supabase SQL Editor and Run before users hit the new code path. Pushing to main won't apply the migration."

### 8. Commit message
Follow the project's commit style:
- `feat: <summary>` for new features
- `fix: <summary>` for bug fixes
- `chore: <summary>` for non-code (assets, docs, config)
- `refactor: <summary>` for code restructure without behavior change

Always end with:
```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

## When to use
- The user says "ready to push" / "let's deploy" / "looks good"
- Before any `git commit` + `git push` sequence
- After a non-trivial change (>30 lines or touches more than 1 file)

## When to skip
- Tiny doc-only changes (`docs/*.md`, `README.md`, comments)
- Local config (`.claude/*`)

## What to do if a check fails
1. Build fails → fix the error, re-run
2. Hardcoded FR → fix with `add-i18n` skill
3. Untracked asset → `git add <file>`
4. Migration in commit → tell user to also run it in Supabase

Never push if build fails. Never bypass with `--no-verify`.

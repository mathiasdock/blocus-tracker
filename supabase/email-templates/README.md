# Auth transaction emails

Source for the hosted Supabase **Confirm sign up** and **Reset password** templates. Only these two templates are in scope. The hosted dashboard does not deploy these files automatically.

| Supabase template | Subject | Body |
| --- | --- | --- |
| Confirm sign up | `{{ if eq .Data.bt_email_lang "fr" }}Confirme ton adresse email · blocus·tracker{{ else }}Confirm your email · blocus·tracker{{ end }}` | `confirmation.html` |
| Reset password | `{{ if eq .Data.bt_email_lang "fr" }}Réinitialise ton mot de passe · blocus·tracker{{ else }}Reset your password · blocus·tracker{{ end }}` | `recovery.html` |

`bt_email_lang` is the effective app language normalized to `fr` or `en`. New email signups save it in `auth.users.raw_user_meta_data`. A successful email/password login or explicit Profile language change updates it if needed. Native Supabase templates can read it as `.Data.bt_email_lang`. A missing value uses English; no legacy accounts are guessed or mass-updated. A logged-out recovery request cannot pass its current device language to Supabase's built-in template, so it uses the account's last known language. No Send Email Hook or custom token/link generation is involved.

Both CTAs and their fallback links must remain `{{ .ConfirmationURL }}`. Email OTP expiration remains 3600 seconds in Supabase. Do not insert real tokens in preview files or logs.

To generate four local, non-functional HTML previews, run `node scripts/render-auth-email-previews.mjs`. Its example link uses `example.invalid`, never a live auth URL. Review the rendered previews before pasting either source file and subject into Supabase; then test both languages and both flows with dedicated accounts before considering the templates live.

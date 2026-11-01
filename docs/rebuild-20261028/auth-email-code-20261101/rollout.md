# Approved email-code transition — 2026-11-01 JST

Start local HEAD 6c556cfcd87cf0a5e351d346ee71b0867f1a8ff2, clean; public source 21c49a673c78ad33c1cdd705eb1095e8cf614520. User explicitly approved shared SMTP/mail-template change while preserving Production link behavior. User subsequently confirmed no existing SMTP and no owned custom domain.

Read-only discovery: connected Resend returns No domains found; Vercel team registered domains list empty; app has only the Vercel-assigned domain. No sender domain was invented, purchased or claimed. No Resend API key created (that tool would require disclosure, contrary to the user's secret handling rules).

Implemented only in isolated real-search Preview:
- email-code-login.js uses existing signInWithOtp with shouldCreateUser=false and exact stable Preview redirect; verifyOtp({email,token,type:email}) then unchanged showApp/server owner authorization.
- Manual numeric code entry; masked input cleared; no token/URL logs; no link navigation, signup, password reset or session transfer.
- Existing send cooldown, no automatic retry, pending double-click suppression, no continuation on 429/provider rejection/missing session. Unknown timeout blocks both sends and verification until a fresh page/session check.
- Existing password path retained as collapsed optional UI; Production app remains unchanged.
- Existing runtime-env reports emailOtpReady only in recovery Preview with explicit operator flag URENAVI_PREVIEW_EMAIL_OTP=smtp-and-template-verified. This attests that SMTP/template configuration was checked, NOT actual email delivery or authentication success. Flag remains absent/off; no automatic email is sent at page load. Unique deployment URLs cannot send OTP because the template condition is bound to the stable alias.
- Conditional template in mail-template.html puts Token in the exact Preview branch and retains ConfirmationURL behavior elsewhere. Existing subject is retained. No shared template has been saved yet.

Verification: core256 + regression464 =720 passes, failures0/skips0, network blocked. New OTP tests cover pending configuration/no-send; exact destination/no signup/cooldown; changed address/malformed code/provider failure/no session; 429/pending/timeout no duplicates; explicit readiness branch restriction. Build succeeds. Real OTP delivery/login remain unverified.

SMTP candidate without buying a domain:
Gmail smtp.gmail.com:587 (STARTTLS), sender and username hirobeya@gmail.com, sender name Urenavi. Google app password must be created by the account owner, kept out of chat/logs/repository, and entered directly in Supabase SMTP Password. Ordinary Google password must not be used. Google requires 2-Step Verification and may restrict app passwords for some account types. This is a candidate, not a proven connection. It uses the personal Gmail account's shared sending quota; do not promise unrestricted or production-ready delivery. No paid service/domain purchase authorized or performed.

Owner action boundary:
Creating an app password grants credential-based account access and must be performed by the owner. The agent must not generate/read/copy it, use browserAuth sign-in collection for a settings credential, or request it in chat. Owner can enter the credential directly in their own authenticated Supabase settings UI. The cloud Supabase session is currently signed out; that does not imply the owner's phone session is signed out. Do not repeat expired cloud handoffs as a substitute for setup.

Rollout after credential/provider preparation:
1. Owner configures SMTP with the above public fields and their app password directly, saves, and confirms non-secret configuration. Leave OTP readiness off.
2. Re-establish authorized Console access if required; capture original subject/template and SMTP enable state, then apply exact conditional template. Do not change Site URL, allowlist, Confirm email, rate-limit numbers, DB/RLS or account passwords.
3. Verify public settings and template condition; enable the readiness flag only for this branch's Preview. First owner email-code login is the real delivery/session/authorization test. No app success or real search until verified. Do not read OTP through Gmail connector.
4. Only after valid browser session plus app-status200 may previously authorized own searches proceed, within the original total2 allowance. Groq remains forbidden.

Rollback: first disable Preview OTP readiness, restore original mail subject/template; if custom SMTP is not working, disable it to return to the original built-in sender. Revoke the dedicated Gmail app password only after disconnecting it and only through owner action. Do not revoke unrelated credentials or invalidate existing sessions. Default built-in sender limits remain limitations, not zero consumption.

Effects this turn: no shared SMTP/template save, no emails sent, no code/password submitted, no paid purchase, no DNS edits, no Production deployment/config changes. Groq0, real searches0/2, application DB/Blob writes0. Only approved recovery source/Preview preparation changes.

Official references: https://supabase.com/docs/guides/auth/auth-smtp ; https://supabase.com/kb/troubleshooting/using-google-smtp-with-supabase-custom-smtp-ZZzU4Y ; https://support.google.com/mail/answer/185833 ; https://developers.google.com/workspace/gmail/imap/imap-smtp .

# Paste verification rejection: verified facts and approval boundary

Start HEAD: 2c21df56a61add0d3ec02f0ae80781f189c38aaf. Worktree clean. Latest deployed source: 820e4c53c94c27948c59a3ac8e98453d513a09dd.

Screenshot provided by user at 20:06 JST shows verification=rejected, session=absent, access=not-observed. Therefore the previous Preview guidance change did NOT achieve a successful user login.

Read-only unified logs: 2026-10-31 11:03:00–11:08:00 UTC.
- 11:05:39.232 POST /auth/v1/otp: 200, iPhone Chrome.
- 11:05:55.215 GET /auth/v1/verify: 303, Safari-family UA. Auth log has completed request without error words.
- 11:06:01.188 GET /auth/v1/verify: 303, Safari-family UA. Auth log reports token/not/found/email/invalid/expired.
- 11:06:11.229 POST /auth/v1/verify: 403, iPhone Chrome. Auth log reports token/not/found.
- GET Auth-log referrer is the recovery Preview hostname; rejected POST Auth-log referrer is the Production hostname (provider metadata; not proof that user visited Production).

Conclusion: GET verification preceded the pasted-link POST. The observed sequence is consistent with consuming a one-use link before paste verification. Identical token identity was NOT inspected or established. The logs do not establish whether the first GET was an intentional tap, long-press preview or another fetch. Do not blame the user or assert a specific gesture as fact. No further resend/copy trial requested.

Provider response to the POST is a rejection, not a local form parser failure. Browser session establishment and server authorization are still unverified. Do not apply speculative session-storage or redirect allowlist changes.

Read-only Console recheck:
Authentication > Emails > Magic link or OTP explicitly displays: Set up custom SMTP to edit templates; Emails will be sent using the default templates. Source and Save changes are disabled. Current subject Your sign-in link. Default body: Your sign-in link; Follow the link below to sign in. This link expires shortly and can only be used once.; Sign in -> ConfirmationURL.

Concrete next implementation (NOT applied):
1. Use an approved SMTP provider/sender and configure shared Supabase Auth custom SMTP. Determine provider availability, sender verification, limits and any cost before application. Do not extract existing credentials or assume a provider is ready. This changes mail transport for the shared project, including Production auth mail.
2. Only for exact recovery Preview RedirectTo, email a one-time Token instead of a clickable confirmation link. All other destinations retain existing ConfirmationURL behavior. Draft template is magic-link-or-otp.pending.html. Draft is not deployed or proven against a real mail delivery.
3. Add code-entry verification only to isolated Preview, using existing Supabase auth.verifyOtp({email,token,type:email}); clear input, retain existing limits, owner/session/server authorization, and no automatic retry. Do not add a new generator, bypass or credential-transfer route. Existing real-search allowance remains gated on proven app authentication.
4. After explicit approval of shared Auth/mail changes, validate sender/template/code in one controlled real login attempt. Do not declare a code-entry UI successful before provider and browser session checks pass. Do not perform a real product search until login succeeds.

Rollback: restore the original email template and subject, then restore standard mail delivery by undoing approved SMTP configuration; retain original app and current protected Preview until the replacement is proven. SMTP and template rollback can affect in-flight links; coordinate before any send.

Authority boundary: user repeatedly forbids main/Production/shared Auth configuration changes. No such mutation is authorized in the current request. Approval required specifically for shared Supabase SMTP/mail-template change (mail delivery impacts Production), not for bypassing auth.

Actions this turn: read-only Auth logs and Console, local evidence/draft only. No email sent; no OTP submitted; no new Preview deployment; no code changes; no tests rerun without changes. Real search 0/2, Groq inference 0, Blob writes 0. Production/main/payment/DB/RLS/Auth configuration unchanged. Login remains FAILED/UNVERIFIED.

Official references: https://supabase.com/docs/guides/auth/auth-email-templates and https://supabase.com/docs/guides/auth/auth-email-passwordless. Single-use links, prefetch risks, Token email templates, and verifyOtp are documented. Those sources do not prove an iOS long-press caused this particular request.

# Recent iPhone authentication attempt — 2026-10-31

Start HEAD: d75c7a9cbaea71c907eb26de676b69507a898850. Worktree was clean. Recovery branch retained.

Read-only Supabase logs, 10:44:45–10:46:00 UTC (19:44:45–19:46:00 JST):
- 10:44:51 POST /auth/v1/otp: 200, iPhone Chrome. This send was successful, not an email-send quota failure.
- 10:45:07 GET /auth/v1/verify: 303, Safari user-agent family. Auth audit and own session metadata confirm provider-side session creation at this time.
- 10:45:09 GET /auth/v1/verify: 303, iPhone Chrome; provider reports invalid/expired token words.
- 10:45:20 POST /auth/v1/verify: 403, iPhone Chrome. Its Auth-log referrer hostname is the Production hostname, unlike the recovery Preview referrer on GET verification.
- 10:45:55 GET /auth/v1/verify: 303, iPhone Chrome, again invalid/expired.
No tokens, auth links, user-agent raw strings, IPs or session identifiers were retrieved for this report. Separate requests cannot be proven to contain the identical credential without inspecting it; no such credential inspection was performed.

Vercel CDN Request Logs (not runtime logs), same Preview deployment:
- 10:45:07.330 GET /app.html: 302. Firewall action allow. No app script requests immediately accompany this first callback arrival.
- 10:45:09.890 GET /app.html: 200; app scripts then load.
- 10:45:55.650 GET /app.html: 200; app scripts then load.
The first callback being redirected, different browser families, and later verification rejection are observed. Deployment Protection is enabled. The precise 302 Location and loss of a real callback fragment are NOT established by available CDN metadata. Do not report protection as conclusively responsible. A credential-free fragment probe in the already-authorized cloud browser retained its fragment and did not reproduce the iPhone's first-entry state.

Supabase administrator Console inspection remains read-only: current Preview matches the allowlist wildcard; default Magic Link template uses ConfirmationURL. Do not change Site URL or allowlist speculatively.

Limited implementation:
Only real-search Preview build guidance is changed: existing link-paste verification is expanded and shown as the primary Preview instruction, with explicit unopened-link, same-browser and no-chat disclosure guidance. Existing public/app.html, SDK verification, server authorization, owner checks, session storage acceptance and Deployment Protection remain unchanged. No wrapping URLs are accepted, no tokens are transferred between origins, and no authentication bypass is introduced.

This is a supported recovery path for a fresh unconsumed link, not proof of successful real browser authentication. If an email scanner consumes a link before the user copies it, this path also cannot authenticate that consumed link. Supabase officially documents single-use links and prefetch failure; durable alternatives (OTP or confirmation page) require email-template/SMTP changes which affect shared authentication and are not authorized here.

No email resend or OTP submission was made by the agent. Real searches remain 0/2; Groq inference 0; Blob writes 0. Production/main/payment/Auth configuration/DB/RLS unchanged. No auth success or product-quality pass is claimed.

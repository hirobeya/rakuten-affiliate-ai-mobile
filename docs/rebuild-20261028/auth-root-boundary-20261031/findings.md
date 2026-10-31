# Authentication failure boundary investigation

Date: 2026-10-31. No additional email send, OTP submission or user retry requested.

New direct evidence:
1. Read-only own auth.sessions metadata confirms a session created at 11:05:55.265371 UTC, iPhone browser (non-CriOS). No session/token identifiers read.
2. Auth audit at 11:05:55 records action=login, target_owner_matches=true, status=303. This conclusively distinguishes the first verification from the later failed ones. It does NOT establish an app browser session.
3. CDN Request Logs filtered through the visible search UI to /app.html:
   11:05:24.55: 200
   11:05:32.55: 200
   11:05:55.45: 302 (immediately after successful Auth GET)
   11:06:01.36: 302 (after failed second GET)
   11:08:16.12: 200
   11:09:14.40: 200
   11:09:22.44: 302
4. One credential-free HTTP request to the exact stable Preview /app.html, with redirect following disabled, returned HTTP 302. Only sanitized response metadata was printed: redirect host vercel.com, path /sso-api, query present=true, fragment present=false. No cookies, nonce values, auth links, response body or query values printed. This confirms the current unauthenticated Preview entry redirects to Vercel SSO. No protection bypass was used.
5. The pasted-link SDK POST at 11:06:11 is provider-rejected HTTP 403, with internal token/not/found words. It occurs after successful own login on the GET path. It is not a local URL-parser rejection or a server app-status entitlement failure.

Causal assessment:
The first successful one-use verification happens in a Safari-family context, then that context receives a Preview redirect instead of the application document. The later iPhone Chrome POST tries verification after this initial successful login and is rejected. The current unauthenticated route is demonstrably Vercel SSO. This places the failure at the protected Preview entry/session handoff, with subsequent one-use credential rejection, rather than at email sending or a missing owner account.

Limits: the exact historical Location header and whether the first Safari-family request was a tap, long-press preview, or another fetch are unavailable. Do not claim a particular user gesture or historical fragment loss as proven. Log request header names were inspected: only accept, provider network headers, user_agent are retained; purpose/sec-purpose is not available. No production identity/session was imported or impersonated. Token equality between GET and POST was not inspected. Current public Supabase implementation accepts type=email with token_hash, so there is no supporting evidence that converting magiclink to SDK email type caused this failure. Public source is informative, not a proof of the hosted server's exact commit.

Correction to earlier recommendation: SMTP/code migration is a possible design alternative, not an established prerequisite to repair the current failure. No SMTP, mail template, allowlist, session storage, Deployment Protection or application authorization changes are made while the root path is being investigated.

No implementation changes; no redundant test rerun. Existing 712-pass evidence retained. Real search 0/2; Groq 0; Blob writes 0. Main/Production/payment/DB/RLS/Auth config unchanged. Login remains unverified in the operating browser.

Sources reviewed: Supabase auth internal/api/verify.go (GET vs POST, type=email token_hash lookup); internal/utilities/request.go (referrer fallback can use SiteURL; Production hostname in provider referrer metadata alone does not prove browser origin); Apple Safari iPhone guide (long-press previews exist, but not proof of this attempt's gesture).

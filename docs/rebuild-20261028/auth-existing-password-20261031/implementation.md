# Existing-password login in isolated Preview

Start: 8cc2d690b343413dce2257a2951e9d3fdcb17fb3, clean. Read-only own Auth metadata confirms email confirmed and existing_password_configured=true. No password/hash value read. Email enabled; Google and other external providers disabled. Password availability does not prove the user knows it; do not claim login success until browser/server checks pass.

Only isolated real-search Preview build gains a password input and sign-in handler. It uses Supabase signInWithPassword and existing showApp -> app-status -> Billing.authorize -> verified session/owner checks. No password issue/reset, email send or auth configuration change. Broken email-link controls are hidden in this Preview; Production public/app.html remains unchanged. No session/cookie migration or auth bypass. Only allowlisted Preview API paths remain present; search quota30 and maximum2 own searches remain unchanged.

Secrets never logged or embedded in artifacts. Input cleared before SDK call and in finally. Failed or missing session does not call showApp. 429 has no automatic retry; pending clicks ignored; timeout leaves button disabled until page reload/session recovery. Authentication observations retain fixed enums only.

Verification: core251/regression464=715 passes, fail0 skip0. Final observation-wrapper adjustment also passed targeted6 tests. These are offline boundary tests, NOT real account authentication success. New3 tests cover existing-session authorization entry, rejection/missing session/429 sanitization, pending/timeout no duplicate submission.

No Groq, Blob write, search, email send or password submission by agent in offline work. Main/Production/payment/DB/RLS/Auth configuration/Deployment Protection unchanged. This is an alternative using an existing credential; original cross-browser email-link return issue remains separate. If the user does not know the existing Urenavi password, do not guess it, use Google/Vercel passwords or claim this path resolves their login.

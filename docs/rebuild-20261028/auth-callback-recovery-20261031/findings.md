# Email callback investigation — 2026-10-31

Start 55781038b9f68680ca7d4cb07b8a5202602a8fde, clean. No email resend, OTP submit, real search, Blob write or Groq inference in this investigation.

## Evidence
User screenshot: existing app login gate inside iPhone in-app browser; storageRead absent, storageWrite removed, verification not-observed, session absent, INITIAL_SESSION, access not-observed, email-send limit message. This snapshot does not prove a past SDK verification never occurred; observations reset on a new page/origin.

Read-only unified Supabase logs queried for the last 24 hours. Only path/method/status, coarse browser family, public referring/redirect hosts and fixed diagnostic words were returned. No token, complete request URL/query, raw agent, IP, key or session ID was fetched.
- OTP POST: three 200 and three 429 entries.
- Verification GET: eight 303 entries; a redirect status alone is not successful Auth. Requested redirect host on all eight was the stable recovery Preview host.
- Verification POST: two 403 entries.
- Auth log errors included token/not/found/email/invalid/expired on failed GET and token/not/found on POST. Two rejected POST records carried the Production referring host. These are project-wide metadata, not proof every entry belongs to this identity or the same browser.
- Some GET verification events had no error, followed shortly by failed GET events. One-time link reuse is consistent with the sequence, but matching a specific link or who opened it was not established and is not asserted.

Supabase URL Configuration UI was attempted read-only and redirected to dashboard sign-in. Site URL and redirect allowlist therefore remain unconfirmed; no settings changed. A Preview redirect allowlist fallback remains a hypothesis, not a proved cause. Google wrapper URL was not provided or read, so no wrapper acceptance change was made. Existing parser accepts only same-provider verification links, and rejection rules are maintained.

## Reproduced application defect and limited fix
checkAuth previously parsed a callback error, cleaned error-bearing URL, and showed a sanitized message. A subsequent empty-session check called showLogin with no message, clearing the explanation. The same clearing affected pasted-link verification failures. This makes the failure look like an unexplained return to email input.

The existing app now retains only its sanitized failure message in page memory until an explicit new email/link attempt, successful server-authorized app entry, or explicit logout. It never retains URL/code/token/raw provider text and does not create a session or weaken Auth/owner/session checks. Callback otp_expired text now accurately says expired OR already used.

Three tests exercise actual existing handler functions: callback cleanup plus repeated empty-session checks, pasted-link rejection without retries and with cleared input, and explicit logout reset. Existing core/search/cache/copy/async regressions pass: 248 core + 464 regression = 712, fail 0, skip 0. Real Auth remains unpassed; do not claim the UI explanation fix resolves token validity or cross-browser login.

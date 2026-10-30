# Authentication-state diagnosis — 2026-10-30

Start HEAD: 911dc6d692998c6ba6577395d17c0aa069ce0e11 (clean). Baseline 2767308 remains in history. Public source before this work: 65a383b680e6e03b6e71392601db7c323a98d754.

## Newly established facts
Read-only auth.sessions lookup restricted to the approved identity returned two sessions created at 04:36:34.465153 and 04:39:47.095082 UTC. Both user-agent classifications were iPhone browser. No raw agent, session ID, credential, or user ID is recorded here. The selected automated browser is Chrome. Thus the prior account last-sign-in timestamp was not evidence of a session in the target Chrome browser. The UI remained at the login gate in the original and a fresh same-origin tab. browserAuth submitted alone did not prove SDK verification or persisted login in that target.

The two contexts cannot be assumed to share browser storage. This is the confirmed evidentiary mismatch. Whether an email button was opened separately, the secure authentication entry occurred in a different context, or another client action caused the iPhone sign-ins is not established. Do not assert that the user clicked a link or that storage is broken.

## Reviewed path
Existing app requests emailRedirectTo = current origin + /app.html. Implicit-flow SDK detectSessionInUrl=true, persistSession=true, localStorage retained. Manual same-provider link verification uses verifyOtp token_hash/type=email without following redirect_to. Existing verifier checks origin/path/type/token multiplicity. Preview build omits only old device/payment handoff decorator, keeps real SDK and server bearer/session/owner/approved-user checks. The completed bridge remains behind server authorization and cannot create a session. No cache/Groq fallback is added.

Actual Supabase redirect allowlist and the actual credential-bearing email redirect were not inspected; no secrets or production auth settings were read or changed. A missing allowlist entry is not asserted as the cause. Vercel deployment was READY/Preview; no app evidence of a Vercel protection wall. Historical runtime-log query exceeded Hobby retention; corrected 50-minute grouped query returned no log groups, which does not prove requests never occurred.

## Limited response
No authentication acceptance rule was changed on speculation. Added passive observations only in the isolated real-search Preview build: SDK verification result, SDK session-read result, auth event, underlying storage access outcome and server app-status acceptance. Outputs are fixed enums, never keys, tokens, URLs, email or user ID. Delegates are called exactly once; values, exceptions and SDK persistence are preserved. No extra Auth request, retry, service login or session injection. Not a new login mechanism or harness.

Reproduction verifies distinct browser stores do not share sessions, and that provider verification success alone does not imply a later SDK session read succeeds. Rejection, storage exceptions and rendering errors preserve fail-closed behavior. Core 248 + regression 461 = 709 pass, fail 0, skip 0, network blocked.

## Status and boundary
No new email or OTP request in this diagnosis. Previous provider email-send rate limit is observed, reset time unknown. No real search (0/2), quota RPC, Groq or Blob write in this work. No main/Production/DB/RLS/payment/auth configuration change. Real target-browser authenticated success remains unverified. A future authorized, rate-limit-permitted login must show verification present, session present and server access accepted in the same target; only then perform the approved own-account searches. Do not fake a ready state or bypass authorization.

References: https://supabase.com/docs/guides/auth/auth-email-passwordless ; local public/email-link-login.js, public/app.html, lib/billing.js.

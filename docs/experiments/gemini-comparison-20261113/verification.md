# Gemini comparison revision, 2026-11-13

Scope: PR #174 only; no Production, payment, entitlement, auth configuration or Groq records are changed. Gemini is still a comparison experiment. No new generation rules or intermediate representation are added.

## History and release

`history.json` pins the one-call grant to `shopworld:10138423`, `gemini-3.8-flash` and the exact request hash. The administrator's 15:55 Safari screenshot (`IMG_0121.png`, SHA-256 recorded in history.json) shows the same storage-bench title, offline-ready state, disabled generation button and the pattern error. It proves the UI's execution path was entered. It does not prove provider dispatch or consumption.

The screenshot is retained in its original personal file location; neither the screenshot nor account data is committed to the repository. The model/hash binding is an explicitly labelled inference from the deployed revision and unchanged request body, not a provider receipt.

- A: pre-dispatch stop proved; this alone does not replenish an already reserved one-call grant.
- B: provider response obtained; never resend on the same grant.
- C: provider submission attempted, terminal result unknown; never resend.
- D: provider dispatch cannot be established from available records. D stays D. A matching unresolved product/request is held; unscoped missing logs do not automatically become C or a universal product ban.

`GEMINI_PRIOR_ATTEMPTS_RECONCILED` is no longer read. A release needs a reviewed, versioned pre-dispatch proof with exact product/model/hash, reviewer, review time, coverage period and hashed evidence references. That evidence must establish what happened in the prior execution window. A new approval, an empty new Blob namespace, or a missing old log is not such evidence. The matching storage-bench D record has not been cleared.

## Persistence

`gemini-attempt-store.js` uses only `urenavi-gemini-comparison-20261113/`. Legacy Gemini claims are read and preserved. Groq paths are never used.

An immutable grant-level claim and request-specific claim are written before dispatch intent. Claim, dispatch intent and terminal result use create-only private writes followed by independent uncached readback. A crash/timeout/ambiguous write leaves its claim consumed; no reset or resubmission is attempted. GET retrieves the stored terminal receipt without a provider call, including original generated text that mechanical validation rejected. The UI marks that text unreviewed.

The Blob SDK defaults to retries. SDK storage operations therefore run in isolated child processes with `VERCEL_BLOB_RETRIES=0`, bounded time, ignored stdout/stderr and IPC containing only operation results. No retry environment variable is changed in the shared Groq process. Credentials stay in inherited server environment only.

The storage-only probe uses separate `storage-probes/<id>/` mock records and cannot invoke a generation adapter. It checks two competing creates (exactly one success), independent worker readback, mock-result recovery, duplicate rejection and unauthenticated private URL denial. A later deployment reads an earlier deployment's immutable proof. Build-context proof and owner-authenticated runtime-context proof are labelled separately; build success never substitutes for runtime success. Storage failures are reported as diagnostics, not ignored execution grants.

## Time budget (designed bounds, not a successful-generation measurement)

The existing `api/room-ai.js` Function is configured to 60 seconds on this branch. No thirteenth Function is added. Other request handlers and Production configuration on main are not modified.

| Stage | Bound |
|---|---:|
| Owner authorization | 8 s |
| Ledger and runtime proof read | 7 s |
| Claim/readback and dispatch intent | 7 s |
| Gemini request and response | 25 s |
| Existing mechanical verifier | 1 s |
| Result save and readback | 7 s |
| Overhead reserve | 2 s |
| Total designed bound | 57 s |

No provider dispatch begins if pre-dispatch elapsed time exceeds 15 seconds. Auth or storage timeouts stop before dispatch. Termination after dispatch intent leaves consumption unknown and the grant reserved. Runtime stage durations and execution SHA are included in safe responses. A successful real generation is still required to validate this time budget empirically.

## Browser diagnostics

Stages distinguish fetch initiation/failure, response received, response-body read, JSON parsing, server processing, result recovery and clipboard operations. Response HTML is not printed or saved. No keys, cookies or auth tokens are exposed. A local hash-only attempt marker survives reload as an additional stop; the private server claim is authoritative. Manual GET result retrieval remains available after POST failure. No generation POST is retried.

The original Safari pattern error's exact source remains unknown; the screenshot contains no stack or HTTP response. A non-JSON response can now be identified separately, but is not asserted to be the historical cause.

## Outstanding release evidence

1. Correlated pre-dispatch evidence or the original provider result for the matching Safari storage-bench execution.
2. Keep the scoped Free-tier/model-limit observation fresh. It was verified directly in Google AI Studio and recorded in readiness.json; unknown remaining consumption is not converted to zero.
3. Successful owner-authenticated Preview runtime storage probe and receipt recovery. Build-context storage checks alone do not satisfy this.
4. One authorized real generation only after all above gates, current CI and deployment SHA match; quality assessment then uses the exact generated output.

## Observed build storage result

Deployment `dpl_F96njLdjShMsFEpdx2EukLixZJQm`, revision `4a1a656e37797d19492edf910e7be4ad98859288`: the storage-only build probe passed in 4447 ms. Two create contenders produced exactly one success, independent-process reads recovered the mock result, duplicate creation was rejected, and the private blob returned HTTP 403 without credentials. Gemini provider calls: 0. The proof was recovered on a subsequent build execution. This is build-context evidence only; owner-authenticated Function execution remains unverified.

The first CI run failed because SDK dependency resolution occurred at module load while CI intentionally runs without dependency installation. Resolution was moved inside the real-storage adapter constructor, preserving the dependency-free offline regression workflow. Parallel immutable ledger reads reduce cold-process overhead without weakening the create-only grant.

## Live observations after second deployment

Google AI Studio existing session was reused without new sign-in or API-key access. Default Gemini Project (`gen-lang-client-0210652653`) is Free. Gemini 3.8 Flash limits displayed: 5 RPM / 250,000 TPM / 20 RPD. The 28-day peak view shows 1 RPM, 1.36K TPM and 1 RPD; it is not a current remaining-capacity counter or a per-request token receipt. Individual API logging is Disabled, and enabling it requires billing setup in the observed UI. No billing or logging setting was changed. These aggregates do not identify the storage-bench request or recover its generated text, so the scoped D record remains unresolved.

The owner session on the old Preview was still valid. Its existing approval-link flow returned approved:true, and the new Preview accepted the transferred session without sending a login email. The initial Function storage probe returned a storage-stage failure before any Gemini call; its low-level cause was not yet returned by that revision. Functions supply OIDC via the platform request context, which a child process cannot inherit as request-local context; the platform request OIDC header is now forwarded only in the storage worker environment, never returned, logged or stored. Safe operation/error-name diagnostics are added to distinguish credentials, worker startup and Blob service failures. Runtime proof must be rerun and confirmed; build proof remains a separate result.

## Runtime storage result and stricter proof

Revision `bb20f05b41dfb38b186760c406e8065230895f6b` accepted the inherited owner session and returned HTTP 200 for the Function storage probe. The private mock-record probe completed in 6382 ms (HTTP stage, including extra work: 7541 ms; owner authorization: 1106 ms). Private anonymous access was 403, one of two creates succeeded, and the mock result was recovered by independent workers. A subsequent owner GET took 2388 ms for storage state and retained the correct target-history hold. No Gemini call occurred.

The final protocol additionally requires an explicit already-exists conflict, rather than accepting any rejected contender as exclusion proof. It injects claim-readback and result-save failures around real private mock writes, confirms each consumed mock grant independently, and proves a second attempt is rejected. These checks have offline tests and must be observed in the final live Function proof. The recovered proof is exposed through owner GET and displayed after page reload, clearly separate from generated content. Invalid Gemini schema/JSON output retains its original candidate text and provider-reported usage; a non-JSON provider envelope gets its own safe error code.

## Scoped release proof and refreshed Free-tier evidence

The screenshot timestamp is recorded as an observation time, not an invented provider dispatch timestamp. The scoped D record carries an explicit investigation coverage window. A future A proof must have the exact 64-character request hash and cover that entire window; a null hash or unrelated period cannot unlock the grant.

The Free project/model-limit gate uses the directly observed, time-bounded project evidence in readiness.json. It does not require an invented exact remaining counter: the UI peak view is not such a counter, unknown remaining consumption stays null, and provider 429 stops without retry. This Free-tier evidence cannot clear the independent matching-request history hold.

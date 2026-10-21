# Cross-product provider admission control

## Problem and scope

The active Preview app sends verified-copy requests through /api/room-copy -> /api/room-ai-v3?urenaviContract=1 -> room-copy-handler -> room-semantic-engine. Search/pro candidate selection do not call this provider. The existing semantic state held rate headers and nextAt per product; after final verification nextAt became zero. The following product had no access to those observed remaining tokens. Browser-only delays or a nextDelayMs field would not coordinate separate tabs, users, requests or Vercel workers.

This repair changes admission control only. Product understanding, quality thresholds, product/sentences schemas, prompts, fixed review questions, unclear rejection, one-rewrite maximum and ready-cache identity remain unchanged. Production/main/payments and PR draft status are untouched. Legacy experimental endpoints and external applications using the organization are outside this active Preview control path.

## Request order

1. Preserve Preview/owner authorization and input validation.
2. Return safe local-ready text without touching the provider budget.
3. Return completed source-bound semantic caches or read-only status without acquiring a provider lease.
4. Before consuming the existing daily quota, load shared budget observations and compare the exact upcoming stage's estimated messages/schema/output allowance with remaining tokens.
5. If waiting is required, return existing pending/202/retryAfterMs metadata. Spend neither provider tokens nor daily quota. Do not save a stale product snapshot while another server may be completing it.
6. Acquire an exclusive lease with an atomic conditional database update on a random revision. Only the winner proceeds. Conflicts return pending; they do not retry the provider. After admission, re-read source-bound product progress so a worker holding an older cache snapshot cannot regenerate a stage another worker just finished.
7. Consume the existing daily quota and perform one provider call. Release the lease while persisting response/error observations, absolute reset deadlines and a minimum request spacing. The last verifier response therefore survives product completion and local/cache-only intervening requests.
8. Keep normal semantic validation and product caching. The existing browser pauses on 202 and requires manual continuation; 429 still terminates the batch, with no provider retry or timer-driven follow-up.

## Storage and failure behavior

Server-only coordination rows use the existing service-role-only understanding-cache table in a reserved, separate namespace and schema version. No database migration, grants or security changes are needed. Their key is a server-side hash of the Preview key scope; no secret value, user identity or product text is stored in these rows. Token observations are model-specific; the active reservation and minimum spacing are shared across the configured key's Preview requests and deployments. Existing ready-cache version is retained because this does not change its quality meaning.

The reservation expires after 120 seconds, longer than the provider's current 10-second transport timeout. An old owner cannot release or overwrite a replacement lease. Missing observations or failed provider calls use conservative 65-second cooldowns, respecting a longer Retry-After. Coordination failures stop before new provider use. A real provider error, especially 429, is preserved even if lease cleanup also fails; the lease then expires conservatively. No automatic retry is added.

Known boundaries: headers and upcoming token usage are estimates/observations, not a guarantee against 429. Separate ITPM/OTPM limits may not be exposed in these response headers; external apps, other keys in the same Groq organization and old deployments that do not run this code cannot be reserved by this control. No new keys, models, paid plans, prompt truncation or relaxed quality gates are used to hide the limit.

## Evidence

- Local complete node suite: 497 passing, zero failed (12 admission-control tests total). vercel-build passed for the final implementation.
- Actual HTTP-handler test: first product consumes one mocked generation; another product returns 202 with zero calls, zero tokens, no extra daily quota and no publishable text.
- Independent-controller contention test permits exactly one reservation. Tests cover shared carry-over, expiry, read-only/cache bypass, daily-quota denial, failed DB access, missing headers, 429 preservation and no stale product overwrite.
- Existing batch/429/semantic/quality regressions remain passing. These tests use synthetic providers and do not consume Groq.
- Supabase transaction verified one conditional revision claim succeeds and a stale claim fails. The test transaction was rolled back and zero fixture rows remained. Actual table RLS is enabled and anon/authenticated SELECT privileges are absent.
- Before the live follow-up below, this repair was tested with synthetic providers and no additional live Groq call after the earlier 429.

References: https://console.groq.com/docs/rate-limits ; https://supabase.com/docs/reference/javascript/using-filters


## Live follow-up: 2026-10-21 18:37–18:40 JST

Serving code: 850f14b288a0e7c86c0a44a43e0b15141fe867b6, Preview dpl_J9V5LzXWsYMQuJdkCptFRKCLtHhg, READY/target=null. The user explicitly requested real verification. Existing owner login restored without another login or a protection change. A handheld-cleaner search returned 10 products.

- 09:37:13.738 UTC: generation succeeded, 3424 input / 1345 output tokens.
- 09:38:09.481 UTC: every-sentence verification succeeded, 2924 input / 1383 output tokens. No rewrite was needed. Total actual provider calls: 2, input 6348 / output 2728 tokens, free policy. These numbers are usage measurements, not an invoice.
- 09:38:12.010 UTC: automatic progression reached the following product, which returned pending before generation. This request recorded calls=0, inputTokens=0, outputTokens=0, basis=no_provider_call. The UI showed the next generation stage and manual resumption time 18:38:36; it did not automatically resume.
- Server-side coordination data retained the preceding verifier's remainingTokens=4689 and absolute token-reset deadline. The lease was released (null), rather than lost at product completion.
- The daily quota row was call_count=7, updated_at=09:38:05.990795 UTC (the verification admission). A subsequent read after the zero-call request still showed this timestamp and count; the waiting product did not advance daily quota.
- The completed second-ranked product was copied through the normal UI. Clipboard text matched the displayed reviewed text: 500gの軽量コードレスハンディクリーナーなので、車内の砂や食べこぼしなどのゴミを手軽に吸い取れます。 The affiliate disclosure was retained. No external ROOM posting or false posted/sales record was made.
- No 429 or provider failure appeared in this bounded run. No further generation was requested once the intended carry-over/wait/copy path was verified.

This is real evidence that final verification hands its budget observations to a different product, that the next product waits without provider/daily-quota consumption, and that verified text remains copyable. It is a small controlled sample, not proof that all future 429s are impossible, that all tabs/workers have been load-tested live, or that the whole app's release/quality gates are met. No implementation changes were required by this live check.

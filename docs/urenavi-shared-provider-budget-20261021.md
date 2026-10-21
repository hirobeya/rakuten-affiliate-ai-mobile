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
6. Acquire an exclusive lease with an atomic conditional database update on a random revision. Only the winner proceeds. Conflicts return pending; they do not retry the provider.
7. Consume the existing daily quota and perform one provider call. Release the lease while persisting response/error observations, absolute reset deadlines and a minimum request spacing. The last verifier response therefore survives product completion and local/cache-only intervening requests.
8. Keep normal semantic validation and product caching. The existing browser pauses on 202 and requires manual continuation; 429 still terminates the batch, with no provider retry or timer-driven follow-up.

## Storage and failure behavior

Server-only coordination rows use the existing service-role-only understanding-cache table in a reserved, separate namespace and schema version. No database migration, grants or security changes are needed. Their key is a server-side hash of the Preview key scope; no secret value, user identity or product text is stored in these rows. Token observations are model-specific; the active reservation and minimum spacing are shared across the configured key's Preview requests and deployments. Existing ready-cache version is retained because this does not change its quality meaning.

The reservation expires after 120 seconds, longer than the provider's current 10-second transport timeout. An old owner cannot release or overwrite a replacement lease. Missing observations or failed provider calls use conservative 65-second cooldowns, respecting a longer Retry-After. Coordination failures stop before new provider use. A real provider error, especially 429, is preserved even if lease cleanup also fails; the lease then expires conservatively. No automatic retry is added.

Known boundaries: headers and upcoming token usage are estimates/observations, not a guarantee against 429. Separate ITPM/OTPM limits may not be exposed in these response headers; external apps, other keys in the same Groq organization and old deployments that do not run this code cannot be reserved by this control. No new keys, models, paid plans, prompt truncation or relaxed quality gates are used to hide the limit.

## Evidence

- Local complete node suite: 495 passing, zero failed, followed by the additional expired-lease regression passing (11 admission-control tests total). vercel-build passed for the final implementation.
- Actual HTTP-handler test: first product consumes one mocked generation; another product returns 202 with zero calls, zero tokens, no extra daily quota and no publishable text.
- Independent-controller contention test permits exactly one reservation. Tests cover shared carry-over, expiry, read-only/cache bypass, daily-quota denial, failed DB access, missing headers, 429 preservation and no stale product overwrite.
- Existing batch/429/semantic/quality regressions remain passing. These tests use synthetic providers and do not consume Groq.
- Supabase transaction verified one conditional revision claim succeeds and a stale claim fails. The test transaction was rolled back and zero fixture rows remained. Actual table RLS is enabled and anon/authenticated SELECT privileges are absent.
- No additional live Groq call was made after the earlier 429. Live reduction of 429 frequency is not yet established by this fix's controlled tests.

References: https://console.groq.com/docs/rate-limits ; https://supabase.com/docs/reference/javascript/using-filters

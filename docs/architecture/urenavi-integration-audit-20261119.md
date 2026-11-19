# Urenavi integration audit — 2026-11-19

## GitHub evidence (verified at audit)
- PR #174 (Gemini isolated lab) is the base for PR #175.
- PR #175 → #176 → #177 → #178 → #179 → #180 → #181 → #182 is the cumulative source-grounded/local copy + actual iPhone API quality line. All these PRs are Draft/unmerged.
- PR #183 forked from PR #174 rather than PR #182; the feature branch does NOT automatically inherit the mobile copy improvements.
- PR #179 documents that the actual iPhone endpoint is /api/room-copy, routed through /api/room-ai-v3?urenaviContract=1 and lib/room-copy-handler.js. Changes only to legacy /api/room-ai-v3 did not suffice.
- PR #182 includes real route/quality regression tests; its tests explicitly state six-axis certification is **not** established. Passing CI is not human qualification.
- PR #183 introduced policy + adapter + draft DB SQL, tested with disposable Postgres in GitHub Actions; no live Supabase migration or AI send integration.

## Decision
Converge on PR #182 HEAD 53ea12e1963ebdbb93954248629a06d1b11d6ba7 as the quality baseline.
Port only the independent capacity pieces from #183 into this isolated integration branch.
Do not merge PR #183 in its entirety into the quality line, and do not enable external AI dispatch.
Preserve the existing server/client publication veto and all real-mobile route tests.
No Production/main/Auth/Stripe/real provider/real DB change.

## Integration dependencies
1. This branch: co-locate local quality and quota safety tests; verify regression and disposable Postgres.
2. Fix failures based on CI evidence, not guesswork; confirm exact Preview SHA and iPhone route.
3. Implement isolated transactional send-intent/outcome persistence and reconciler **after** agreement on consumption rules; no refund of ambiguous sends.
4. Integrate server-side verified tenant, provider-wide limits, and ledger behind Preview flag into real mobile endpoint; use DB atomic lock instead of precheck alone; note that currently the adapter is NOT wired in.
5. Inspect existing v3 quota, owner/device session, and Stripe entitlement paths before writing any adapter glue; never trust client plan or user IDs.
6. Perform current authoritative provider usage/rate verification (or fail closed), fixed-corpus six-axis review, cross-category publication rejection, iPhone E2E, and finance/cost acceptance.
7. Release only after external platform/Rakuten usage terms, host commercial plan, and privacy/security constraints are verified; keep paid release gate closed until then.

## Stop conditions
- No client-copiable draft if its exact source/semantic basis fails validation.
- Unknown provider consumption, stale dashboard, missing verified global limit or owner/tenant ID => no external AI attempt.
- SQL draft remains un-applied to production; no paid Supabase branch; free disposable PostgreSQL for tests.
- No provider retry; no duplicate claim; no claims of launch readiness from mocked results alone.

## Current limitations
The branch combines code history for independent CI only, not runtime quota enforcement.
Do not assume a Gemini Free remaining count from the historical owner dashboard.
No six-axis manual acceptance, real device validation, concurrent-user live RPC validation, or verified commercial operating margins yet.

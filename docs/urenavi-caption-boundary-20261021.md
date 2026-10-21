# Caption and final-copy boundary repair

Scope: existing Preview branch only. No main, Production, payment, PR readiness, provider retry policy, quality thresholds, product/sentences contract, or AI verification questions changed.

The owner-visible five-search export obtained on 2026-10-20 returned 49 products across handheld cleaners (10), laundry nets (10), portable power stations (9), dog beds (10), and dog drive beds (10). These were ordinary search results, not 49 AI-approved drafts.

The replay exposed source section headings, specification fragments and ambiguous washed-part language being accepted as direct caption claims. Clean leading headings are stripped while retaining the contiguous source sentence; embedded headings, table/keyword fragments and uncertain cover-washing scope remain available to the existing semantic path. Safety assurances require semantic review. No product IDs or category-specific exception lists were added.

The existing browser final benefit guard now also gates local-ready responses. A rejected local text goes to the existing AI path rather than being advertised as copyable. The folding hook uses its literal supported shape without adding carrying claims.

The conservative local replay yielded 9/49 locally completed items with no final-guard conflict. This is not an acceptance rate or evidence of attractive copy across all 49 products; remaining items require the existing semantic verification flow. The live AI flow and full release acceptance gates remain separate checks.

Validation on 2026-10-21: node --test: 483 passed, 0 failed. npm run vercel-build: passed. Regression coverage retains clean source sentences, explicit cover-only washing, folding facts and the unchanged browser safety boundary.

## Live Preview follow-up

Preview b827a0b8e2b55e7bd31ddb63545a01d0bc01d220 / dpl_7nJ7crxQ9Ac1uTEQ93pSR67K1j4B was READY, target=null; both CI workflows succeeded. Existing approved login restored without a new sign-in. A fresh laundry-net search returned 10 products. Three actual copy-button operations matched clipboard text; the outcome view reported 0 posted / 3 copied and unconfirmed, with sales and fees unknown.

The second-ranked product completed generation, verification, one bounded rewrite and reverification but was rejected for unsupported content; it remained uncopyable. Logs showed successful free-policy calls, not an authentication failure. At 02:00:33 UTC the seventh product hit upstream 429; the rest of the search stopped. No further provider call or automatic retry was requested. Five items were locally copyable, one semantically blocked, one rate-limited, and three stopped behind the limit. This does not satisfy overall copy quality: the local copies still repeat a generic opening and title feature. Do not represent this run as release acceptance.

Pending-stage UX previously hid the actual wait duration. It now shows the next stage and a fixed device-local resumption time derived from the server response, alongside explicit manual continuation. This is display-only; no polling, timers or retry calls were added. All 485 node tests and vercel-build passed after the display change, including existing 429/batch-stop safety coverage.

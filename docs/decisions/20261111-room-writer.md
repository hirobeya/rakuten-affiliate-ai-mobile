# ROOM Writer S0–S3 decision (2026-11-11)

**Status:** isolated experiment; no release authorization.
**Frozen source:** `563e65e0339aa2e33708b998af7e4e47a884ccd3` (commit immutable; this branch descends from it).
**Work branch:** `experiment/room-writer-s0-s3-20261111`.
**Prior PR #164:** stop additional development. Do not merge.

## Architecture
1. Local code extracts exact-text facts from itemName/itemCaption/catchcopy without interpreting their truth or assigning benefits.
2. One Groq request (`openai/gpt-oss-120b`, `reasoning_effort=low`, output cap 2000) proposes a JSON post grounded by source fact IDs; no span/quote-position or internal plan in model output.
3. Local verifier rejects invalid structure, unsupported numeric claims, altered conditions, mismatched product identity, unsafe expressions, and unsupported scenes. A textual overlap test alone is **not** proof of semantic support; unresolved semantic support must be held.
4. Only independently reviewed results may advance. No automatic rewrite or retry in S0–S3.
5. Composer is separate from model output and app/UI routing. Existing application remains unchanged.

## Prohibited in S0–S3
No modification to API, UI, DB, auth, billing, Stripe, existing claims/journals/usage reservations/Private Blob or any files under docs/rebuild-20261028. Do not execute resume-free-calibration. Do not loosen old source-fact safety constraints. Do not create product-/category-specific exception rules.

## Evaluation protocol
40 fixed products: 20 selected from historical 44 (max two per category), 20 truly unused source items across at least eight genres, distinct from historical and tuning material. Never relabel used items as unseen. If 20 genuinely unused items are unavailable, freeze the historical 20 and report the blocked S1 component rather than fabricate a complete 40-set.

S2: on an independent balanced set, correct sentences 30 with <=3 false rejections and incorrect sentences 30 with **zero** missed rejections. Do not tune safety to passing tests.

S3: start with five-item dry run and stop if mean usage >6000 tokens, 429, unknown usage, lack of minute capacity, or any unresolved prior claim/usage risk. Audit usage in the isolated run only; Groq's 8000 TPM and 200000 TPD Free ceiling remain external authoritative bounds. No 4000-token guess may authorize another request. Compare source, full post, basis IDs, validation reasons, latency, and measured usage. User and independent reviewer assign six-axis grades.

Advance to S4 **only if all**: generation >=85%, all-six-axis pass >=60%, severe unsupported claims=0, selling product correct >=95%, mean tokens <=4500, human approval >=6/10. This is an experimental promotion threshold, not a production-ready or complete-product certificate. Maximum three prompt-only tuning rounds on the tuning split; independent held-out set stays untouched.

## Known uncertainty
The historic 44-item dataset and room-unseen-products.json overlap in all 17 records; those are **not** 20 holdouts. Twenty distinct public Rakuten product URLs in nine categories have now been added as factual, normalized merchant-page summaries with provenance, with zero overlap against the frozen 44. They are **not raw Rakuten API itemCaption values** and the independent source-equivalence review is outstanding; the S1 status remains pending, so no E1 Groq request is authorized. S2 synthetic 30 positive/30 negative verifier tests passed existing CI, but no live quality proof exists. Capacity and SHA-bound live execution permission remain mandatory.

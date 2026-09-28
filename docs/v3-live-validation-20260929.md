# Super Urenavi v3 — live validation gate (2026-09-29)

## Purpose
A successful deployment or HTTP 200 is not the sales gate. The gate is whether real Rakuten products produce grounded, product-specific copy with a verified customer value layer.

## Evaluation path
- Use owner-authenticated Preview only.
- Search through `/api/search`; search/page load must not invoke Groq.
- Generate through `/api/room-ai-v3` only after an explicit product action.
- Review identity, factual meaning, customer value, hook relevance, evidence, and repeated-template risk across categories.
- `needs_value`, empty output, unsupported inference, or generic-only copy is not a pass.

## Hardening added on 2026-09-29
- Replaced keyword-based value detection (`時短`, `手間`, `選べる`, etc.) with structural grounded-value checks.
- Final saleable copy requires grounded attribute references plus independently verified `supported=true` value.
- Unsafe health/safety/beauty/reassurance/fatigue/hygiene/promo language is filtered from hooks, scenes, appeals and decision axes.
- Decision axes must resolve to surviving grounded attributes.
- Free-form AI decision-axis wording is not reused as a fallback claim; fallback leads use product identity + grounded attribute names.
- Source evidence must be literal contiguous source text. Unicode-equivalent substitutions such as source `℃` -> AI `°C` are rejected rather than presented as quotations.
- Customer-facing source symbols are preserved exactly after validation; normalization is only an internal comparison tool outside literal-evidence checks.
- Historical unsupported-value patterns observed in shaver and air-fryer Preview cache are now regression tests.

## Groq / cache discipline
- No Groq call on search/page load.
- Save successful pass1 understanding before optional verification/retry.
- Resume after 429 without repeating successful inference.
- Cache hit means zero Groq calls unless a specifically incomplete stage must resume.
- No hidden retries.

## Release gate
Do not change main/Production merely because CI is green. Merge only after:
1. CI and Preview deployment are READY.
2. Meaning-changing factual errors are zero in the evaluation set.
3. Unsupported customer-value claims are zero.
4. Openings/body do not collapse into repeated generic templates.
5. Persuasion is materially useful: the reader can state a concrete reason to consider the product.
6. Groq request behavior remains bounded and cache reuse is verified.
7. Real authenticated Preview evaluation is completed across product categories.

Production/main remains unchanged until this gate passes.

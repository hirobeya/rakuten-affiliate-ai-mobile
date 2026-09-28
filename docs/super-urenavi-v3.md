# Super Urenavi v3

## Goal
Generate short Rakuten ROOM copy that moves a shopper from “interested” to “want this” while remaining grounded, scalable to unknown products, economical with Groq, and stable in mobile UX.

## Non-negotiables
1. Purchase motivation: make the reason to consider the product clear.
2. Factual integrity: do not invent performance, effects, compatibility, quantities, scenes, testimonials, health/safety/beauty claims, or promotional facts.
3. Groq sustainability: no Groq on search/listing; explicit post generation only; cache reuse; bounded calls; no hidden retries.
4. Generality: no product/genre hardcoded patch architecture.
5. UX/stability: fail closed instead of emitting bland or unsafe copy.

## Two-layer model
### Reader layer
Create self-relevance through a situation, question, or buying concern without asserting product performance. Reader hooks are machine-filtered for unsupported health, safety, beauty, reassurance, fatigue, hygiene, popularity, ranking, promotional, numeric/spec, and product-performance claims.

### Product layer
Explain why the product is worth considering using grounded attributes and independently verified customer-value inference. Every factual statement must trace to literal source evidence.

## Pass 1 — product understanding
Return structured JSON:
- `productType { specific, general, quote }`
- `attributes [{ name, value, unit, qualifier, valueType, quote }]`
- `decisionAxes [{ text, attributeRefs }]`
- `appeals [{ text, noHassle, scene, attributeRefs, strength }]`
- `hooks [{ type, text }]`

Machine validation:
- product identity evidence must be literal source text;
- attribute quote must be literal contiguous source text;
- attribute value must occur literally inside its quote;
- visible source symbols are preserved for customer-facing copy;
- conflicting attributes are removed;
- unsafe hooks/appeals/axes are removed;
- decision axes without grounded attribute references are removed;
- AI semantic inference is never trusted merely because wording sounds plausible.

## Pass 2 — independent value verification
Only top inferred appeals are verified. The verifier receives grounded attributes and the proposed appeal, not an invitation to invent new facts. `supported=true` is required before inferred customer value can be used in saleable output. Failed inference falls closed; direct grounded facts remain available internally.

## Copy architecture
A saleable variant is built in this order:
1. product-specific reader lead;
2. verified purchase value;
3. verified friction/scene when non-duplicative;
4. literal grounded evidence;
5. optional user-written experience memo;
6. price and affiliate disclosure.

Fallback lead construction must never reuse free-form AI claims. If AI hooks are unavailable, leads are built from product identity plus grounded attribute names. No generic fixed hook bank is used as a substitute for product understanding.

## Structural quality gate
Do not use keyword presence such as `時短`, `手間`, `選べる`, `場面` as proof of value. A strong appeal requires:
- grounded attribute references;
- strength >= 2;
- more than a bare restatement of a source value, unless supported scene/friction adds verified meaning;
- independent verification before final copy.

No verified customer value => `needs_value`; do not emit a bland “facts only” sales post and call it complete.

## Groq / cache budget
- Search/list page: 0 Groq calls.
- Pass1: one call on cache miss.
- Targeted value retry: at most one, only when identity/facts are valid and value/hook is missing.
- Pass2: at most one when verification is actually needed.
- Save successful pass1 before optional retry/pass2.
- Resume incomplete stages after 429 without repeating successful inference.
- Cache hit: zero Groq calls unless resuming a specifically incomplete stage.
- Never cache 429/failure as successful inference.

## Output state
- `A`: grounded facts + independently supported customer value + product-relevant lead.
- `needs_value`: identity/facts may exist but a saleable verified value layer is not ready.
- `invalid`: product identity is not safely established.

AI never fabricates testimonials. `ひとことメモ（実際に使用した場合のみ）` remains blank for the user.

## Current implementation status
- [x] v3 metrics / Groq accounting.
- [x] versionless product cache with revalidation.
- [x] pass1 schema + machine validator.
- [x] pass2 verifier, fail closed.
- [x] resumable bounded-call engine.
- [x] structural customer-value quality gate (keyword-value heuristic removed).
- [x] product-specific copy composer using verified value before evidence.
- [x] unsafe hook/scene/decision-axis filtering.
- [x] grounded-attribute fallback leads; free-form AI decision-axis text is not reused as a claim.
- [x] literal source quote enforcement and visible-symbol preservation.
- [x] regression coverage for historical shaver/fryer unsupported-value leakage.
- [x] owner-only Preview `/api/room-ai-v3`; Production `/api/room-ai` unchanged.
- [x] explicit-run live evaluation page; no Groq on page load/search.
- [ ] authenticated real-product cross-category evaluation on the current hardened head.
- [ ] balanced 100-product human evaluation / model comparison.
- [ ] real app UI wiring after evaluation passes.
- [ ] persisted copy-action analytics / copy-rate aggregation.
- [ ] image identity recovery in v3.

## Release rule
CI green is necessary but not sufficient. Do not switch production merely because tests/deployment pass. Release only when:
1. current Preview is READY;
2. meaning-changing factual errors = 0 in the evaluation set;
3. unsupported customer-value claims = 0;
4. copy does not collapse into repeated generic templates;
5. persuasion is materially better than baseline and gives a concrete reason to consider the product;
6. Groq behavior remains bounded and cache reuse is verified;
7. authenticated real-product Preview evaluation is completed across categories.

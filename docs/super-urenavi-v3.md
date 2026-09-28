# Super Urenavi v3 — product copy architecture

## Goal
Generate short Rakuten ROOM copy that moves a shopper from “I’m interested” toward “I want this”, while remaining grounded, scalable across unknown products, economical with Groq usage, and stable for users.

## Non-negotiable priorities
1. Purchase motivation: the copy must make the product’s value understandable and give the reader a concrete reason to want it.
2. Factual integrity: product claims must be supported by source text and must not change meaning.
3. Groq sustainability: no Groq call on search/listing; only on explicit post generation; reuse cached product understanding; avoid duplicate inference.
4. Generality: no product-specific or genre-specific hardcoded rules in logic.
5. UX/stability: fast fallback, no accidental Groq storms, no broken production flow.

A change is not accepted if it improves one priority while materially damaging another.

## Two-layer copy model
### Reader layer
Purpose: create self-relevance through a pain point, scene, feeling, or common situation.
- Must not claim product performance.
- Must not contain unsupported causal claims such as “this makes your morning easier”.
- Can be vivid and persuasive because it does not assert product facts.
- Machine guard rejects product-specific numeric/spec/performance claims and malformed/non-natural Japanese.

### Product layer
Purpose: explain why this specific product is worth considering.
- Every factual statement must be traceable to product title/caption evidence.
- Inference from fact -> appeal must be separately validated when the appeal goes beyond the fact itself.
- Promotion/claim safety rules still apply even when the wording appears in the merchant source.

## Groq pass 1 — product understanding
Triggered only when the user presses Generate.

Expected JSON:
- productType `{ specific, general, quote }`
- attributes `[{ name, value, unit, qualifier, valueType, quote }]`
- decisionAxes `[{ text, attributeRefs }]`
- appeals `[{ text, noHassle, scene, attributeRefs, strength }]`
- hooks `[{ type, text }]`

`valueType`: `single | range | options | identifier | text`.

Rules:
- Specific product type is used in customer-facing copy; general type is taxonomy only.
- Attributes are semantic facts, not raw strings.
- Qualifiers such as “maximum”, “when on high”, “excluding attachment”, etc. must be preserved.
- Variants/options must not be collapsed into a single definitive value.

## Machine validation after pass 1
No Groq required.
- quote must be grounded in itemName or itemCaption after normalization.
- value must be supported by quote.
- attributeRefs must resolve only to surviving attributes.
- reject unsafe promotional/medical/safety claims even if the source contains them.
- reject promotional/claim text as product identity.
- reject malformed Japanese / obvious mixed-language contamination from reader hooks.
- detect conflicts: if the same semantic attribute has incompatible values, do not use that attribute in copy.
- AI path must not use legacy specLike/unit-shape heuristics as semantic judges.

## Groq pass 2 — inference verification
Run only for top 2–3 appeals that contain an inference beyond a direct source fact.
- One batched request.
- Input only: source quote(s), structured attribute(s), proposed appeal/noHassle/scene.
- Do not provide pass-1 rationale, reducing confirmation bias.
- Output: supported + keepDirectFact + short reason per appeal.
- Meaning-changing inference is rejected; direct grounded fact may remain.
- Missing verification fails closed for the inferred wording.
- Direct source facts require no pass 2.

## Groq budget behavior
- Pass 1 cache miss: at most one Groq request.
- Pass 2: at most one Groq request and only if qualifying inference exists.
- Same cached product/source: zero requests after both passes are cached.
- Pass 1 is saved before pass 2. If pass 2 is blocked by quota/error, a later attempt resumes at pass 2 without repeating pass 1.
- v3 has no hidden retry loop behind one logical pass.
- 429/transient failure is never cached as successful knowledge.

## Expression tools
Data-driven generic semantic categories only; no product-specific logic.
Examples:
- quantity/time/capacity -> simple lifestyle conversion only when mathematically direct and low-condition.
- effort/operation -> “don’t have to …” only after inference validation.
- material/taste/origin/texture -> wording grounded in source terms; inferred pairing/use goes through pass 2.
- size/compatibility -> failure-avoidance framing.
- if no tool fits -> use the fact directly.

Lifestyle conversion requirements:
1. mathematically correct,
2. low dependence on hidden usage conditions,
3. unlikely to mislead purchase judgment,
4. assumptions stated in copy.

Never infer battery charge counts, electricity cost, or other condition-heavy conversions without explicit trustworthy inputs.

## Output tiers
A. Grounded facts + independently supported purchase appeal -> full persuasive copy.
B. Grounded facts but no supported inferred appeal -> reader hook + direct facts.
C. Valid identity with sparse facts -> reader hook + product identity + price, no invented performance/target-user claim.
Invalid. No normal product copy when product identity itself is invalid.

Up to three hook variants are produced. Final copy contains `ひとことメモ（実際に使用した場合のみ）`; AI never fabricates first-person usage or testimonials. Final copy is not cached.

## Cache policy
- Product understanding key: itemCode + normalized hash(itemName + itemCaption).
- Store raw pass-1 output and pass-2 result.
- Revalidate cached raw output with latest rules on read.
- Do not include PROMPT_VERSION or VALIDATION_RULE_VERSION in cache keys.
- Prompt/schema versions are metadata only.
- Image cache remains separate and is only eligible when text cannot establish valid product identity.
- Type-level knowledge cache is not used by v3.
- Cache writes are best effort; a cache outage must not turn a valid generation into a user-facing failure or cause hidden retry storms.

## Observability
For every Generate attempt record:
- route/cache status,
- pass1/pass2/image Groq call counts,
- output tier A/B/C/invalid,
- hook type and decision axis,
- machine validation result,
- copied/not copied when available,
- elapsed time.

## Evaluation harness
`public/v3-live-30.html` is explicit-run only and never starts Groq on page load.
- First button runs 5 products.
- Second button runs the remaining 25 only after the first check.
- Search itself does not call v3 Groq.
- The harness stops on 429.
- It records tier and actual pass1/pass2 call counts in result JSON.

## Acceptance tests
### Safety
Human classification: appropriate / not-a-real-spec / meaning-changed.
Release requirement: **meaning-changed = 0**.

### Persuasiveness
Human score per output:
- first line feels personally relevant,
- strongest grounded fact is translated into a clear purchase reason,
- after reading, the evaluator can state one reason to want/buy the product.
Numeric lifestyle conversion is optional, not mandatory.

### Coverage
- 30 live products.
- 100 balanced samples from the fixed 780 set across 39 genres, including fashion, food, alcohol, daily goods, and gifts.
- report A/B/C distribution by genre.
- report pass1/pass2 Groq call counts separately.
- compare current Groq model vs stronger candidate on same 30 before any model switch.

## Current implementation status
- [x] v3 usage metrics and Groq pass accounting.
- [x] versionless product cache reuse + raw pass1/pass2 storage + current-rule revalidation.
- [x] pass-1 schema and machine validator.
- [x] independent pass-2 verifier with fail-closed inference behavior.
- [x] two-pass engine with bounded calls, partial-pass resume and cache reuse.
- [x] A/B/C/invalid composer with 2–3 hooks and blank user note.
- [x] structured Groq caller with one request per logical pass and no hidden retries.
- [x] owner-only, preview-only `/api/room-ai-v3`; current production `/api/room-ai` remains unchanged.
- [x] preview cache namespace isolates v3 tests from legacy production understanding rows.
- [x] 30-item explicit-run evaluation page with 5-first / remaining-25 safeguards.
- [ ] generic expression-tools data and safe transforms.
- [ ] image identity recovery in v3.
- [ ] real app UI wiring after evaluation.
- [ ] persisted copy-action analytics and copy-rate aggregation.
- [ ] live30 + balanced100 human evaluation and model comparison.

## Release rule
Do not merge/switch production because CI is green. v3 is complete only when:
- agreed evaluation has meaning-changing errors = 0,
- persuasion is materially better than the current baseline,
- Groq usage is sustainable,
- production flow remains stable,
- final deployment is READY and canonical production behavior is verified.

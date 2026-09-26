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
- Machine guard rejects product-specific numeric/spec/performance claims.

### Product layer
Purpose: explain why this specific product is worth considering.
- Every factual statement must be traceable to product title/caption evidence.
- Inference from fact -> appeal must be separately validated when the appeal goes beyond the fact itself.
- Promotion/claim safety rules still apply even when the wording appears in the merchant source.

## Groq pass 1 — product understanding
Triggered only when the user presses Generate.

Expected JSON:
- productType
  - specific
  - general
  - quote
- attributes[]
  - name
  - value
  - unit
  - qualifier
  - valueType: single | range | options | identifier | text
  - quote
- decisionAxes[]
  - text
  - attributeRefs[]
- appeals[]
  - text
  - noHassle
  - scene
  - attributeRefs[]
  - strength: 1..3
- hooks[]
  - type: question | relatable | failure_avoidance | number | scene
  - text

Rules:
- Specific product type is used in customer-facing copy; general type is taxonomy only.
- Attributes are semantic facts, not raw strings.
- Qualifiers such as “maximum”, “when on high”, “excluding attachment”, etc. must be preserved.
- Variants/options must not be collapsed into a single definitive value.

## Machine validation after pass 1
No Groq required.
- quote must be an exact contiguous substring of itemName or itemCaption after normalization.
- value must be supported by quote.
- attributeRefs must resolve.
- numeric/unit claims in the product layer must originate from referenced attributes.
- reject unsafe promotional/medical/safety claims when required by existing guards.
- reject malformed Japanese / obvious mixed-language contamination.
- detect conflicts: if the same semantic attribute has incompatible source values, do not use that attribute in copy.
- AI path must not use legacy specLike/ambiguous heuristics as semantic judges.

## Groq pass 2 — inference verification
Run only for top 2–3 appeals that contain an inference beyond a direct source fact.
- One batched request.
- Input only: source quote(s), structured attribute(s), proposed appeal/noHassle/scene.
- Do not provide pass-1 reasoning or justification text, to reduce confirmation bias.
- Output: yes/no + short reason per appeal.
- Reject only the unsupported inferred part when a direct factual statement can remain.
- Direct source facts that require no inference do not need pass 2.

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
A. Grounded facts + usable expression tool -> full persuasive copy.
B. Grounded facts but no safe expression tool -> hook + strongest facts + optional user note slot.
C. Very sparse facts -> reader hook + product name + price + optional user note slot; no unsupported performance/target-user claims.
No post is generated only when product identity itself is invalid.
If Groq quota/availability fails, fall back to local grounded-fact copy.

## Copy composition
1. Reader-layer hook or safe lifestyle number.
2. Strongest product fact + validated purchase relevance.
3. Second supporting fact when useful.
4. Safe lifestyle conversion if available.
5. Optional user-written note field; AI must not fabricate first-person use/testimonial experience.
6. Price + PR disclosure.

Generate 2–3 hook variants from different hook types. Final copy is never cached.

## Cache policy
- Product understanding key: itemCode + normalized hash(itemName + itemCaption).
- Store raw pass-1 output and pass-2 result.
- Revalidate cached raw output with latest rules on read.
- Do not include PROMPT_VERSION or VALIDATION_RULE_VERSION in cache keys.
- Prompt/schema versions are metadata only.
- Image cache key: normalized image URL without presentation-size params.
- Image analysis only if text still cannot establish valid product identity.
- Remove product-type-level knowledge cache from the new v3 path.
- Cache analyzed-but-unknown for a short negative TTL only.
- Never cache 429/transient failures.

## Router
cache -> local -> Groq text -> Groq image

Local can return “certain” only from allowlisted/structured evidence. Groq is never called merely from search/list rendering.

## Observability
For every Generate attempt record:
- route: cache/local/text/image
- pass1Calls
- pass2Calls
- cache hit/miss
- output tier A/B/C
- hook type
- decision axis
- machine validation result
- copied/not copied when available
- elapsed time

The purpose is both cost protection and later copy-quality optimization.

## Acceptance tests
### Safety
Human classification: appropriate / not-a-real-spec / meaning-changed.
Release requirement: meaning-changed = 0.

### Persuasiveness
Human score per output:
- hook feels personally relevant,
- strongest fact is translated into a clear purchase reason,
- after reading, the evaluator can state one reason to want/buy the product.
Numeric lifestyle conversion is a bonus when appropriate, not a mandatory criterion for every category.

### Coverage
- 30 live production products.
- 100 balanced samples from the fixed 780 regression set across 39 genres, including non-numeric categories such as fashion, food, alcohol, daily goods, and gifts.
- report A/B/C distribution by genre.
- report pass1/pass2 Groq call counts separately.
- compare current Groq model vs a stronger available model on the same 30 items before changing the production model.

## Implementation order
1. Route/pass1/pass2 Groq usage logs and quotas.
2. Cache adaptation for raw v3 understanding + pass2 verification.
3. Pass-1 schema + machine validation.
4. Pass-2 inference verifier.
5. Data-driven expression tools + A/B/C output tiers.
6. Final 2–3 copy variants + optional user-note slot.
7. Copy analytics / copy-rate tracking.
8. 30 live + balanced 100 evaluation.

## Release rule
Do not call v3 complete because it is safe or because CI is green. It is complete only when:
- meaning-changing errors are zero in the agreed evaluation set,
- copy quality materially improves over the current baseline,
- Groq usage remains within sustainable operational limits,
- production flow remains stable.

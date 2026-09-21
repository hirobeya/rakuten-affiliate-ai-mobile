# Shadow V2 design (2026-09-21)

## Purpose
Shadow V2 is comparison-only. It must not change `makeRoomCopy`, ranking, search results, production output, or production configuration.

Feature flags:
- `genericFull=false`
- `benefitCopy=false`
- `queryCanPromote=false`

Search query is a constraint only. It may cause a fallback recommendation when it disagrees with the title-derived primary product. It cannot promote an item to full output.

## Pipeline
1. Normalize title text.
2. Extract role-tagged spans from the title.
3. Extract primary-product candidates only from title spans.
4. Select a title-grounded primary product.
5. Validate every span against exact title offsets.
6. Detect attribute/accessory scope collisions.
7. Compare search query with title-derived primary product.
8. Emit title-grounded facts only.
9. Emit a shadow decision only: `fact_only_shadow` or `fallback`.
10. Never call or modify `makeRoomCopy`.

## Span data structure
Example:
```json
{
  "role": "feature",
  "text": "防水",
  "start": 8,
  "end": 10,
  "source": "title"
}
```

Roles:
- `product_noun`: candidate for the main product
- `target`: target user/item such as 犬用/猫用/車用
- `use_context`: context/location such as 車中泊/網戸/後部座席
- `accessory`: accessory or bundle component such as ケース/ケーブル/リード/パネル
- `feature`: explicit title feature
- `spec`: explicit numeric/size/count specification
- `promo`: promotion/ranking/coupon text

Primary product:
```json
{
  "text": "ドライブベッド",
  "start": 0,
  "end": 7,
  "source": "title",
  "method": "title_product_noun",
  "grounded": true
}
```

## Safety invariants
- Every accepted span must exactly equal `title.slice(start,end)`.
- Features scoped to an accessory are not exported as main-product facts.
- Search query mismatch can only lower confidence / recommend fallback.
- Search query match cannot promote to full.
- Shadow facts are factual title spans only.
- No lifestyle benefit text is generated.
- Generic full stays disabled.

## Existing-test rewrite proposal
No existing test is changed in this shadow-only step.

| Existing test intent | Current rule | Proposed future wording | Change now |
|---|---|---|---|
| Unknown product defaults to fallback | unknown => fallback | unknown that does not satisfy future generic criteria => fallback | No |
| Unknown item must not invent a concrete use | fallback must stay factual | unchanged; Shadow V2 may emit title-grounded facts but no benefit/use invention | No |
| Low-confidence product must not get fabricated sales pitch | fallback/safe copy | unchanged | No |
| Mop holder is not a mop body | classify holder safely | keep existing output test; add Shadow V2 role/span assertion separately | No |
| Drive-bed conflict cases | conflict/fallback safety | keep existing output test; Shadow V2 comparison can be added without changing expected output | No |
| Accessory feature must not leak to main product | ad-hoc regression examples | add structural scope assertion: feature/accessory adjacency/overlap cannot become main-product fact | New shadow-only test later |
| Search query can influence classification | legacy behavior varies | search query is constraint-only in Shadow V2 and can never promote | New shadow-only test later |

Any future rewrite of an old fallback test must preserve a one-to-one mapping from old test ID to new expectation and explain why the safety invariant is unchanged.

## Evaluation sets
- Tuning set: existing regression products plus explicitly designated development examples.
- Hold-out set: must be created from search terms selected by Hiro.
- Hold-out search terms are currently **未確認**.
- Hold-out results must not be used to tune rules during implementation.

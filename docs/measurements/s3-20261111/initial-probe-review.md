# S3 initial live probe — 2026-11-11

Result: one real Groq generation completed; draft rejected. No publication, copy authorization, rewrite, retry, or second product request.

- Branch: `experiment/room-writer-s0-s3-20261111`
- Before: `1926f19ae828d4a6b643e90a18378601dc0bf94c`
- Execution: `ba22436c7b188ad49ad0cf74581aa9dcbe2123d9`
- Sandbox: `urenavi-s3-20261111-five` (nonpersistent)
- Item: `pasoro:10001354`; model: `openai/gpt-oss-120b`; reasoning: low; output cap: 2000.
- Timestamp: 2026-11-11 00:39:32 UTC / 09:39:32 JST.
- Generation requests: 1. Earlier read-only models request: 1. Automatic retries: 0.
- HTTP 200; prompt 1798; completion 478 (including 61 reasoning); total 2276 tokens.
- Wall latency: 1445 ms; provider inference total_time: 1.095539689 seconds (queue_time separately 0.152004605).

## Generated draft in full (rejected, review only)

本革（山羊革）ならではの柔らかさと高いグリップ力で、長時間のツーリングも快適に。
ナックルプロテクターと前面の大きなベルクロでしっかり固定、風の侵入を防ぎます。
指先はタッチ対応素材を採用し、手袋をしたままスマホ操作が可能です。
季節に合わせてシンプルモデルと防風モデルの2タイプから選べ、10℃前後の寒さにも対応します。
レビュー700件以上、累計5,000セット突破の実績が信頼の証です。

The last line is the model's `post.note`. Full text above is 196 characters including line breaks. No price/disclosure was composed because the machine rejected the draft; this is not a finished, publishable ROOM post. Model tag metadata: 本革 / ナックルプロテクター / スマホ対応 / 防風 / 季節選択 (model supplied no `#` prefixes).

## Independent source comparison

| Axis | Result | Evidence |
| --- | --- | --- |
| Product understanding | FAIL | Selling object is correctly identified as bike gloves, but windproof-model-only specifications become general product claims. Output selling unit `1個` is not established by the source. |
| Specificity | PASS | Goat leather, knuckle protectors, touch operation, and two model choices are concrete item features. This does not excuse scope errors. |
| Reason to choose | PASS | Flexibility/grip for touring and operating a phone while wearing gloves provide understandable source-linked selection reasons. |
| Audience/scene/value | PASS | Touring and seasonal selection are relevant to the supplied source. Thermal performance still needs correct model attribution. |
| Naturalness/appeal | FAIL | Feature introductions accumulate; the note ends with generic promotional `信頼の証`, rather than a concrete selection criterion. |
| Grounding | FAIL | Source `風が入りにくく` becomes absolute `風の侵入を防ぎます`. Front Velcro and 10℃ specification belong to the windproof model. Source touch material is limited to thumb/index, while output broadens it to `指先`. September-2026 date for review count disappears. Sales/reviews do not prove trustworthiness. |

These are this assistant's independent comparisons of source and output, not a human user's approval and not machine-derived quality approval. Overall: FAIL. One sample cannot establish stable quality or superiority to the previous system. No standard comparison generation was performed.

## Mechanical outcome and root causes

- Machine: rejected; `V4_qualifier_lost` (body[0]) and `V9_product_not_in_hook` (hook). Publication and copy remain false.
- V4's literal trigger comes from `なし` in the combined fact containing simple-model perforation choice and windproof-model Velcro. This does not demonstrate detection of the real model-scope or strength changes.
- A/C: source-pack splits sentence context: `防風モデル` ownership is not carried into the next `10℃` fact; another fact combines two model descriptions. Model received exact quotations but insufficient explicit ownership relationships.
- B/C: writer merges feature scope and strengthens degree; review-count date is omitted.
- D: verifier does not examine free `post.note` or tags as grounded claims; lexical qualifier checks can reject unrelated clauses. V9 is a contract rejection, not independent evidence of factual error. Safety must not be loosened to obtain a passing score.
- Required next work: preserve source context/model ownership in the fact representation, cover all generated text in verification, and validate on the frozen independent cases before another live experiment. No unmeasured fix is claimed here.

## Capacity and one-attempt controls

Administrator explicitly approved changing the initial admission condition for one request only. Planned input estimate 3061 + output reserve 2000 = 5061; this was a reservation, never represented as measured balance. Pre-send minute/day balances stayed null.

After the response, Groq reported TPM limit 8000, remaining minute tokens 5802, RPD limit 1000 and remaining requests 999. Daily token balance remains unknown. No response header was interpreted as a daily token balance. These are observations at the response time, not current balances.

The runner writes/fsyncs a separate one-use marker and attempt record before transport. It rejects an existing attempt and stops after the initial result with `initial_probe_complete_review_required`. 429, absent usage, transport uncertainty, invalid JSON and reservation excess still stop without retry. No old claim/journal/reservation/Private Blob was accessed or changed.

## Validation and boundaries

Seven targeted tests passed (including three new admission safety tests and the existing S2 test files). Existing `test:copy`, `test:ai`, `test:shadow` completed without failures. Execution SHA GitHub workflows: ROOM Copy Regression #3153 SUCCESS; Verify Urenavi #3894 SUCCESS.

Only experimental runner/admission/test files changed. Main, Production, application API/UI, auth, billing and DB unchanged. Sandbox egress restored to deny-all after the single generation. Four remaining products were not sent. S3 incomplete; no production adoption.

Raw source, draft, basis IDs, usage, headers and verdict are preserved in `initial-probe.json`. No credential is included.

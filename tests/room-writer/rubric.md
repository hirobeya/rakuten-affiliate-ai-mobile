# ROOM Writer S1 — independent human rubric

Each item: evaluate **the entire displayed post** against the underlying source, not the model's claimed basis. Record PASS/FAIL for every axis. Any uncertainty = FAIL pending evidence. Claude and Hiro score separately; no self-grading in the generator.

| Axis | PASS requirement |
| --- | --- |
| understanding | Correct selling product and selling unit; no mix-up with parts, accessories, variants or other products |
| specificity | At least one specific verified feature relevant to this exact item |
| choice | Feature connects to a genuine, non-invented reason to choose the item, not feature restatement |
| audience_value | An appropriate audience/scene/decision value grounded in the item and not promising an unproven effect |
| naturalness | Natural Japanese, attractive without hype, no generic template repetition, readable at ROOM scale |
| grounded | Every factual claim, number, part, scope, degree and negation survives exact comparison with source |

Record separately:
- **severe_unsupported_claim**: any materially unsupported performance/health/safety claim, wrong compatibility/model, denied or missing condition, or other materially misleading fact. Target zero.
- **selling_product_correct**: sale object and unit correct. Target at least 95%.
- **generate_success**: a verified draft exists; a refusal/hold does not count as generated.
- **tokens/latency**: actual provider-reported usage and wall time only; never guessed in place of observed data.
- **human_approval**: Hiro selects at least 6 of 10 independently sampled items.

S3 promotion thresholds: generation >=85%, all-six-axis PASS >=60%, severe_unsupported_claim = 0, selling_product_correct >=95%, average actual tokens <=4500, Hiro approval >=6/10. These are S4 *experiment gate* thresholds, not a completion certificate.

Source-control: historical 20 used for exploratory error classification; independent 20 must be new to all existing fixtures and prior evaluations. Until an actual unseen 20 has been verified, S1 is incomplete and external communications remain blocked. No safety threshold tuning against the independent set.

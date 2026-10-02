# ROOM semantic draft contract

Scope: fix/room-copy-structure-20261002 and owner-only Preview. No production, main, billing or sales changes.

Retain source matching (NFKC + whitespace only), quotas, preview cache namespace, explicit final safety verdict and audit ledger. Remove AI ordinal selection, attribute name/value/unit decomposition in model output, and semantic draft postprocessing that adds unrelated facts or mechanically rewrites purchase reasons.

Writer produces a natural product identity with an independently grounded original identity quote, one publishable paragraph (opening scene + purchase reason) together. No separate attribute extraction is requested; features are the evidence quotes accompanying the completed draft. Each paragraph returns original evidence quotes. Server matches all quotes against source; any unmatched quote invalidates the entire paragraph. Evidence may be absent from the separately listed features. Server-generated numeric references exist only for internal compatibility; the model never selects them.

Final independent verifier must return complete sentence-by-sentence checks with matched original evidence for every scene and body sentence. Missing/duplicate/rejected/ungrounded checks block the entire draft even if the paragraph-level boolean is true. It receives source title/caption and every proposed scene/text with associated evidence. It checks identity, negation, conditions, options, unsupported benefits, inappropriate claims and unsafe scenes. Familiar use scenes directly implied by features are allowed; invented performance and promised lifestyle outcomes are not. All semantic draft paragraphs require approval; rejected paragraphs cannot silently disappear from a ready post. Renderer emits approved wording with paragraph breaks and disclosure, without adding feature lists or price. Ready reflects rendered completion, not merely having a purchase reason candidate.

Cache identity is derived from the actual writer/verifier schemas and prompts, so obsolete verification cannot be reused after a contract change. Output limits total 960 tokens (writer 500, verifier 460); this is a configured bound, not a measured free-tier throughput claim.

Verification: npm run vercel-build passed locally. semantic-room-draft.test.js covers 17 synthetic categories and adversarial cases with mocked verifier. It does not prove live model accuracy, safety recall, naturalness, or universal product coverage. Live Preview evaluation and CI are separate release gates and must be recorded independently.

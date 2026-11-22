# Groq ROOM copy plan configuration

`URENAVI_GROQ_PLAN` is either `free` (the default) or `paid`. Keep the Groq API key and evidence in server-only variables. Preview remains a Free environment. The existing Free evidence and trial SHA/source-hash approvals continue to apply there.

Paid dispatch additionally requires the existing production capacity approval and `URENAVI_GROQ_PAID_ENABLED=approved_paid`. The single-call ROOM candidate path also requires `URENAVI_GROQ_PAID_ROOM_COPY_ENABLED=approved_copy`. Keep these switches unset until release is approved and the real database and publication path have been validated.

The server-side `URENAVI_GROQ_PAID_EVIDENCE` object contains `plan`, `approved`, `keyHash`, `evidenceHash`, `verifiedAt`, `expiresAt`, `inputNanoUsdPerToken`, `outputNanoUsdPerToken`, `organizationDailyBudgetNanoUsd`, and `tenantDailyBudgetNanoUsd`. One US dollar is one billion nano-USD. Refresh the evidence against the exact organization, key and contract. Load the observed limits into the existing authoritative capacity windows. Keep window ingestion restricted to the operator and preserve existing balances at refresh. A plan label alone grants no capacity.

The additive migration `db/20261122_groq_paid_capacity.sql` requires the existing v2 tables and RPCs. It locks the same provider row, checks that the active organization and account day windows are capped within their budgets, and calls the existing atomic reservation. The higher input/output price is used for the budget check. The original intent and settlement RPCs still account for both tenant and organization, and fail closed on unknown results. A missing migration, missing windows, or a higher token limit blocks paid sends. This is an application limit for the active daily ledger windows, not a statement about the provider's billed total or a separate monthly budget.

The cost estimate for a successful paid request is calculated from reported input/output usage and the confirmed tariff; the ROOM candidate record retains this estimate. Reconcile that estimate with actual provider billing before setting customer allowances. The generation, publication review, and stored copy format do not depend on the plan setting.

## Review a new ROOM candidate

The isolated Preview stores each raw candidate privately. Before publication, the operator compares every sentence with the fixed source and completes the quality and appeal rubric in the trial plan. Add only the digest produced by `reviewDigest(item, raw)` in `lib/urenavi-core/room-copy-review.js` to the JSON array `URENAVI_ROOM_COPY_REVIEWED_HASHES`. A changed listing, price, draft, or cited evidence requires a new review. The existing evidence validator and text guards still run. The hash binds the review to the exact draft; it does not itself prove semantic support.

An authenticated owner can use `/app.html?groqReview=1` to retrieve reviewed copy for a matching listing. This lookup never sends to Groq. The candidate stays private if review is absent or validation fails.

# Next independent trial preparation — no generation approval

This phase preserves the accepted baseline HEAD `843306a02cd746a86fe470cc4b0ec1e864fdb3ad`. Closed evidence sources are recorded in history-finalization.json and are not queried again. Its historyHash pins the existing D evidence unchanged. Private results are read only via owner GET for the exact item/model/requestHash. A missing result never proves no prior dispatch; a mismatched result is marked unverified instead of presented as this product's output.

`next-execution.json` is an inactive template. No new approval or execution ID has been issued: both are null, as are approver, approval time and Free-tier confirmation. It cannot create a claim or generate. Claim/result paths are only derived after a valid, separately approved trusted manifest exists. The browser cannot supply or approve that manifest.

For a future explicitly approved independent trial, the administrator must supply approval ID, execution ID, approver/time, exact item/model/request hash, maximum one request, fresh scoped Free-tier evidence and explicit acknowledgement of the preserved D history. The two IDs must be included in the request and match the trusted manifest. This is not a means to resolve or retry the original approval. The original route and history still stop at target_history_unresolved.

The new store uses an approval-level create-only object shared across execution IDs, plus an independent execution namespace. Changing execution ID cannot replenish the same approval. All writes are private and read back; GET is read-only. The original Gemini paths and Groq paths are not rewritten. Browser attempt keys include both IDs, so an independent trial does not inherit the legacy browser marker; legacy markers are retained and still read for the original request.

## Additional offline verification

- Two separate OS processes race using a shared create-only filesystem Mock: exactly one is admitted. This tests cross-process logic; it is not a claim that two real Vercel Function instances were forced to run simultaneously.
- SIGKILL after claim and before dispatch leaves the approval consumed, with no mock provider marker.
- SIGKILL after mock dispatch preserves unknown consumption and prevents replay.
- Mock response followed by result-save failure leaves the approval consumed and GET does not create another request.
- A changed execution ID cannot bypass an already consumed approval.
- A separately approved Mock grant does not alter or clear the original D, and its saved result GET makes no model call.
- The original history is frozen in memory and its canonical digest matches the finalization record.
- A virtual-clock near-budget test covers 7.999s auth, 6.999s state, 6.999s claim, 25.001s provider timeout and 6.999s result save; response is below 57s with usage null. The configured Function limit remains 60s and designed total remains 57s. Whether 25s is enough for successful real generation remains unverified.

The previously accepted real Private Blob proof is reused through read-only GET in builds and the lab. No new accepted-baseline probe claims are created for each deployment. A future live independent trial still needs current runtime storage readiness and refreshed Free-tier evidence; the historical accepted proof is displayed separately and does not silently satisfy a new execution's prerequisites.

Safari/iPhone verification is not inferred from desktop Chromium or Mock browser tests. The historical pattern error remains cause unknown. Existing stage diagnostics and browser tests distinguish fetch, response reading and JSON parsing without replaying that historical request.

The independent manifest contains the fresh verified Free-tier/model-limit observation (project, model, limits, observation/expiry and evidence reference). The route uses that same observation for the independent trial, so the administrator does not have to update a second stale Free-tier gate. This is still separate from issuing the approval itself.

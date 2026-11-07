# Fixed incident: one pre-send continuation, not a retry

The immutable `evidence.json` correlates the persisted API409 result, the exact
original source ordering, reproduced Private Blob ETag semantics, protected
claim/old record hashes and a read-only Groq Logs observation. Missing HTTP
journals or missing Console rows alone never prove zero sends. The Console
full ID was not reobtained; its displayed suffix and token counts corroborate
the historical full ID. Unmanaged consumption/in-flight counts remain unknown.

Only the claim hash in the evidence is eligible. The actual claim, its8000
reservation entry, old6000 and previous receipt are never rewritten. Fresh
namespace inspection must find both calibration and HTTP journals absent and
all three resume audit files absent. Any journal, changed claim, missing
proof, prior resume or unknown managed send rejects continuation.

`resume-v1/attempt.json` is create-only, permanent and maximum1. Its confirmed
readback precedes the create-only handoff record, which precedes the existing
runner. A process crash or partial save never deletes the attempt. Separate
instances compete on the same create-only path. Completion or failure appends
a terminal record; failure to append does not reopen the consumed attempt.
The runner and transport require an acquired in-process capability, not a
posted JSON object or a read-only preflight context.

Reservation disposition is carry_forward_existing_claim:8000, additional0.
The runner instantiates that held request once in its calibration journal;
claim and journal are references to the same reservation. Old usage3729 is
represented by the full retained6000, not added again. Historical separate8000
remains; known encumbrance22000 includes this same comparison8000 once.

Authenticated `preflight-resume-free-calibration` is read-only and does not
approve execution. `resume-free-calibration` requires the existing Free live
flag, operator authentication, a fresh SHA-bound grant and existing risk
acceptances PLUS `resumePreSend:true`, `resumeApproved:true`, the exact
`resumeClaimHash`/`resumeEvidenceHash`, `maxResumes:1`. The existing execution
adapter supports those fields. No live grant is configured by this work.

`probe-resume-connection` is accepted only while all inference is disarmed and
the execution grant is empty. It copies the exact claim into an independent
`urenavi-resume-probes/<diagnostic-id>` storage scope, then uses the same
dispatch/runner/transport with an unforgeable fixed mock capability. It cannot
read a provider credential or substitute a real HTTP implementation. Synthetic
capacity is labelled and never usable as live evidence. Actual records and
resume audit files are hash-checked before/after. Diagnostic IDs never change
the real experiment ID and cannot be used for inference.

Optional build verifier `URENAVI_RESUME_API_TARGET` targets an already READY
isolated deployment of the same SHA; `URENAVI_RESUME_PROBE_ID` supplies a fresh
32hex diagnostic prefix. It checks actual read-only readiness and success,
duplicate, concurrent, calibration-save failure, audit-save failure, HTTP-save
failure,400,429,timeout through authenticated HTTP and real Private Blob.
It has no execute action. Clear both temporary variables after verification.

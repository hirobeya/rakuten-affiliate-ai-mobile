# Live validation acceptance contract

The sales gate is the generated copy, not HTTP 200 or successful deployment.
Use the owner-authenticated Preview `/api/search` and `/api/room-ai-v3` paths.
Search and page load must never trigger Groq. Select a real search result, generate
explicitly, preserve its source and all output variants, and review product identity,
factual meaning, purchase value and a product-relevant hook across categories.
No empty output or `needs_value` result counts as a pass.

The baseline 0b9f1cdc used a separate evaluation caller that discarded quality retry
reasons and bypassed application authorization/quota. Its screen counted HTTP 200
as success even for empty variants. On 2026-09-29 the shaver returned needs_value;
the next air-fryer request failed with provider OTPM limit 1000 vs requested 1600.
These are cross-category validation and inference-budget defects.

Required behavior:
- A compact bounded understanding response within the observed provider budget.
- One targeted quality retry only when identity and grounded attributes survive,
  and customer value or hook is missing. No product-specific branches.
- No hidden transport retry. Report every attempted Groq HTTP request, including
  failures, and return retry-after when supplied by the provider.
- Save successful understanding before verification or quality retry. After 429,
  explicit retry resumes the unfinished stage; never cache a failed HTTP response
  as successful knowledge. A completed cached result makes zero Groq requests.
- Application daily quota remains enforced. Distinguish it from upstream rate limit.
- Grounding, verification and final-copy quality failures are explicit.
- Production and main remain unchanged until the live sales gate passes.

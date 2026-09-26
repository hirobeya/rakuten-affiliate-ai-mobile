# Super Urenavi cache v2

Implementation target from `docs/super-urenavi-policy.md`.

- Product understanding key: `itemCode + sha256(normalized itemName + normalized itemCaption)`.
- Image understanding key: normalized image URL with presentation-size query parameters removed.
- Product type knowledge key: normalized validated `productType`.
- `PROMPT_VERSION` and `VALIDATION_RULE_VERSION` are metadata only and never key material.
- Cache hits always rerun the latest validation rules against raw AI JSON.
- Unknown results use a short negative-cache TTL.
- 429/transient upstream errors are never cached.
- Final copy is never cached.

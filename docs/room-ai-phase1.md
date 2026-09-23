# ROOM AI Phase 1 notes

- Preview + owner only. Production must return before reading OPENAI_API_KEY or invoking AI.
- One product per browser request; browser concurrency limit: 3.
- OpenAI timeout: 8 seconds. Failures render the existing safe short copy.
- Phase 1 post uses only validated itemName-derived features. itemCaption-derived features are review-only.
- productType requires value/source/evidence. Invalid evidence means the UI uses existing buildSafeDisplayName instead of productType.
- Image is product-type corroboration only. If the image hint differs from validated productType, use fallback.
- itemCaption feature release threshold: start with 30–50 human-reviewed examples overall, then revise from observed accuracy.
- Phase 2 is not implemented. supportedBy is AI self-report; code can only verify the reference exists, so human review remains mandatory.

## Cache table proposal (not implemented)

Table: urenavi_ai_room_cache

Columns:
- item_code text
- input_hash text
- model text
- model_version text
- prompt_version text
- raw_ai_json jsonb
- validation_rule_version text
- created_at timestamptz

Store raw AI JSON, not a frozen final post. On read, rerun current validation and post assembly so rule changes apply without another model call.

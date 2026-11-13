'use strict';
// Isolated Gemini comparison transport. No live endpoint calls this module.
// Does not replace or alter the existing Groq contract or local generator.
const {prepare, intact, hash} = require('./source');
const {SYSTEM, schema, valid} = require('./contract-v2');
const MODEL = 'gemini-2.5-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent';

function buildGeminiComparison(item) {
  const envelope = prepare(item);
  if (!intact(envelope) || envelope.held) {
    return {held: true, reason: envelope.reason || 'raw_source_integrity_failed', request: null};
  }
  // Reuse the exact original input text and writer instructions; no additional
  // product-category rules, summaries, buyer-plan layers, or source truncation.
  const request = {
    systemInstruction: {parts: [{text: SYSTEM}]},
    contents: [{role: 'user', parts: [{text: JSON.stringify({productData: envelope.source})}]}],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
      maxOutputTokens: 2000
    }
  };
  return {held: false, model: MODEL, request, inputHash: hash(request.contents[0].parts[0].text),
    requestHash: hash(request), sourceHash: envelope.sourceHash};
}

function extractResponse(payload) {
  const candidate = payload?.candidates?.[0];
  if (candidate?.finishReason !== 'STOP') throw Error('gemini_response_incomplete_or_blocked');
  const text = candidate?.content?.parts?.map(part => part.text || '').join('');
  if (!text) throw Error('gemini_empty_response');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw Error('gemini_invalid_json'); }
  if (!valid(parsed, schema)) throw Error('gemini_schema_invalid');
  return {draft: parsed, tokens: {
    input: payload.usageMetadata?.promptTokenCount ?? null,
    output: payload.usageMetadata?.candidatesTokenCount ?? null,
    total: payload.usageMetadata?.totalTokenCount ?? null
  }};
}

async function compareOnce(item, {
  apiKey, freeTierConfirmed = false, execute = false, fetchImpl = globalThis.fetch
} = {}) {
  const prepared = buildGeminiComparison(item);
  if (prepared.held || !execute) return {...prepared, status: prepared.held ? 'held' : 'offline_ready'};
  // Intentional fail-closed: explicit, current owner confirmation of a FREE
  // project is required. No paid tier, automatic retry, or background job.
  if (!freeTierConfirmed) throw Error('gemini_free_tier_unverified');
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw Error('gemini_api_key_missing');
  if (typeof fetchImpl !== 'function') throw Error('fetch_unavailable');
  const response = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'x-goog-api-key': apiKey},
    body: JSON.stringify(prepared.request),
    signal: AbortSignal.timeout(30000)
  });
  // Exactly one HTTP attempt, including 429/5xx; never retry or auto-switch.
  if (!response.ok) throw Error('gemini_http_' + response.status + '_no_retry');
  const payload = await response.json();
  return {...prepared, status: 'generated_unreviewed', ...extractResponse(payload)};
}
module.exports = {MODEL, ENDPOINT, buildGeminiComparison, extractResponse, compareOnce};

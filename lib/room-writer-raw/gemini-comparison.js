'use strict';
// Isolated Gemini comparison transport. No live endpoint calls this module.
// Does not replace or alter the existing Groq contract or local generator.
const {prepare, intact, hash} = require('./source');
const {SYSTEM, schema, valid} = require('./contract-v2');
const MODEL = 'gemini-3.8-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent';
// GenerateContent accepts a limited JSON Schema subset. Keep the authoritative
// original schema and validator untouched; remove only unsupported keywords
// from the transport copy (e.g. minLength/maxLength).
const GEMINI_SCHEMA_KEYS = new Set([
  '$id','$defs','$ref','$anchor','type','format','title','description',
  'enum','items','prefixItems','minItems','maxItems','minimum','maximum',
  'anyOf','oneOf','properties','additionalProperties','required'
]);
function toGeminiSchema(value, isProperties = false) {
  if (Array.isArray(value)) return value.map(entry => toGeminiSchema(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => isProperties || GEMINI_SCHEMA_KEYS.has(key))
      .map(([key, child]) => [key, toGeminiSchema(child, key === 'properties')]));
  }
  return value;
}

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
      responseJsonSchema: toGeminiSchema(schema),
      maxOutputTokens: 2000
    }
  };
  return {held: false, model: MODEL, request, inputHash: hash(request.contents[0].parts[0].text),
    requestHash: hash(request), sourceHash: envelope.sourceHash};
}

// A *future separately approved* trial. Do not mutate a consumed grant's
// original request/hash or enable an automatic fallback after provider 503.
// Gemini 3.8 Flash supports thinkingLevel=low in generateContent REST.
// Output ceiling includes thinking tokens and is not a spending authorization.
function buildGeminiLowThinkingCandidate(item) {
  const baseline=buildGeminiComparison(item);
  if (baseline.held) return baseline;
  const request=structuredClone(baseline.request);
  request.generationConfig.thinkingConfig={thinkingLevel:'low'};
  request.generationConfig.maxOutputTokens=4000;
  return {...baseline,request,profile:'low-thinking-next-trial',
    requestHash:hash(request),approved:false,execute:false};
}

function extractResponse(payload) {
  const candidate = payload?.candidates?.[0];
  if (candidate?.finishReason !== 'STOP') throw Error('gemini_response_incomplete_or_blocked');
  const text = candidate?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('');
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

// Retain allowlisted diagnostics only; never persist free-form provider messages,
// request headers, echoed input, credentials or arbitrary response headers.
async function failureDiagnostic(response,apiKey) {
  const headers={};
  for(const name of ['x-request-id','x-goog-request-id','retry-after']) {
    const value=response.headers?.get?.(name);
    if(typeof value==='string'&&/^[A-Za-z0-9_.:+\/-]{1,128}$/.test(value)&&!value.includes(apiKey))headers[name]=value;
  }
  let status=null,code=null,timer;
  try { const data=await Promise.race([response.json(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('diagnostic_timeout')),500);})]);
    if(['UNAVAILABLE','RESOURCE_EXHAUSTED','INVALID_ARGUMENT','FAILED_PRECONDITION','PERMISSION_DENIED','NOT_FOUND','INTERNAL','DEADLINE_EXCEEDED','UNAUTHENTICATED'].includes(data?.error?.status))status=data.error.status;
    if(Number.isInteger(data?.error?.code)&&data.error.code>=100&&data.error.code<=599)code=data.error.code;
  } catch {} finally {clearTimeout(timer);} // Diagnostic reads are bounded and never trigger another request.
  return {httpStatus:response.status,status,code,headers};
}

async function compareOnce(item, {
  apiKey, freeTierConfirmed = false, execute = false, profile = 'baseline', fetchImpl = globalThis.fetch
} = {}) {
  if (!['baseline','low-thinking-next-trial'].includes(profile)) throw Error('gemini_profile_invalid');
  const prepared = profile === 'low-thinking-next-trial'
    ? buildGeminiLowThinkingCandidate(item) : buildGeminiComparison(item);
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
    signal: AbortSignal.timeout(25000)
  });
  // Exactly one HTTP attempt, including 429/5xx; never retry or auto-switch.
  if (!response.ok) {const error=Error('gemini_http_' + response.status + '_no_retry');error.httpStatus=response.status;error.providerDiagnostic=await failureDiagnostic(response,apiKey);throw error;}
  let payload;try{payload=await response.json();}catch{throw Error('gemini_response_json_invalid');}
  try { return {...prepared, status: 'generated_unreviewed', modelVersion:payload.modelVersion || MODEL, providerRequestId:typeof payload.responseId==='string'?payload.responseId:null, ...extractResponse(payload)}; }
  catch(error){ error.httpStatus=200;error.rawCandidateText=payload?.candidates?.[0]?.content?.parts?.filter(part=>!part.thought).map(part=>part.text||'').join('')||null;error.providerRequestId=typeof payload.responseId==='string'?payload.responseId:null;error.tokens={input:payload.usageMetadata?.promptTokenCount ?? null,output:payload.usageMetadata?.candidatesTokenCount ?? null,total:payload.usageMetadata?.totalTokenCount ?? null}; throw error; }
}
module.exports = {MODEL, ENDPOINT, toGeminiSchema, buildGeminiComparison, buildGeminiLowThinkingCandidate, extractResponse, compareOnce};

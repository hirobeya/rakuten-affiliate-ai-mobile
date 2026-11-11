'use strict';
// Independent API acquisition. No local preprocessing, AI, DB, quota, or Blob imports.
const S=require('./source');
const ENDPOINT='https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const VERSION='rakuten-raw-acquisition-v1',MAX_RESPONSE_BYTES=262144;
const FIELDS=['itemCode','itemName','itemCaption','catchcopy','itemPrice','itemUrl'];
function fieldState(item){return Object.fromEntries(FIELDS.map(k=>{
 const present=Object.hasOwn(item,k),value=item[k];
 return [k,{present,type:present?(value===null?'null':typeof value):'missing',hash:present?S.hash(JSON.stringify(value)):null,
  utf16Length:typeof value==='string'?value.length:null,utf8Bytes:typeof value==='string'?Buffer.byteLength(value):null,preserved:present}];
}));}
function fromResponse({body,itemCode,observedAt,executionSha,responseHeaders={}}){
 if(typeof body!=='string'||Buffer.byteLength(body)>MAX_RESPONSE_BYTES)throw Error('response_too_large_no_truncation');
 if(!/^[a-f0-9]{40}$/.test(executionSha||'')||!Number.isFinite(Date.parse(observedAt)))throw Error('acquisition_provenance_required');
 let parsed;try{parsed=JSON.parse(body);}catch{throw Error('rakuten_json_invalid');}
 const items=Array.isArray(parsed?.items)?parsed.items:Array.isArray(parsed?.Items)?parsed.Items:null;
 if(!items||items.length!==1)throw Error('exactly_one_original_item_required');
 const item=items[0]?.Item??items[0];
 if(!item||item.itemCode!==itemCode)throw Error('rakuten_item_identity_mismatch');
 const fields=fieldState(item);
 const record={version:VERSION,origin:'rakuten_api_response',endpoint:ENDPOINT,request:{itemCode,format:'json',formatVersion:'2',carrier:'0'},
  observedAt,executionSha,responseHeaders,originalBody:body,responseHash:S.hash(body),originalItem:structuredClone(item),fields,
  transformations:[],localTruncation:false,apiFieldRetention:'exact',sellerPageCompleteness:'unverified',
  missingRequiredFields:FIELDS.filter(k=>!fields[k].present),source:null,sourceHash:null,fieldHashes:null,held:false,reason:null};
 try{
  if(record.missingRequiredFields.length)throw Error('raw_api_field_missing');
  const url=new URL(item.itemUrl);if(url.protocol!=='https:'||url.hostname!=='item.rakuten.co.jp'||url.pathname.split('/')[1]!==itemCode.split(':')[0])throw Error('rakuten_item_url_mismatch');
  const envelope=S.prepare(item);record.source=envelope.source;record.sourceHash=envelope.sourceHash;record.fieldHashes=envelope.fieldHashes;
  record.held=envelope.held;record.reason=envelope.reason;
 }catch(e){record.held=true;record.reason=['raw_api_field_missing','rakuten_item_url_mismatch'].includes(e.message)?e.message:'raw_api_source_not_usable';}
 return S.freeze(record);
}
function verify(record){
 try{
  if(record?.version!==VERSION||record.origin!=='rakuten_api_response'||record.endpoint!==ENDPOINT||record.localTruncation!==false||record.transformations?.length!==0)return false;
  const rebuilt=fromResponse({body:record.originalBody,itemCode:record.request.itemCode,observedAt:record.observedAt,executionSha:record.executionSha,responseHeaders:record.responseHeaders});
  const {wireResponse,responseProjection,...base}=record;
  if(wireResponse||responseProjection){
   if(!/^[a-f0-9]{64}$/.test(wireResponse?.hash||'')||!Number.isSafeInteger(wireResponse?.utf8Bytes)||wireResponse.utf8Bytes<1||wireResponse.retained!==false||responseProjection?.operation!=='retain_exact_item_drop_non_product_envelope'||responseProjection.writingSourceFieldsChanged!==false)return false;
   if(responseProjection.itemUrlProjection){
    const u=responseProjection.itemUrlProjection,f=base.fields.itemUrl;
    if(u.operation!=='drop_credential_query_fragment'||!/^[a-f0-9]{64}$/.test(u.originalValueHash)||f.originalValueHash!==u.originalValueHash||f.preserved!==false||u.publicURL!==base.originalItem.itemUrl)return false;
    base.fields={...base.fields,itemUrl:{...f,preserved:true}};delete base.fields.itemUrl.originalValueHash;
   }
  }
  return S.hash(rebuilt)===S.hash(base);
 }catch{return false;}
}
async function readComplete(response){
 if(!response.body||typeof response.body.getReader!=='function')throw Error('complete_stream_required');
 const reader=response.body.getReader(),chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_RESPONSE_BYTES){await reader.cancel();throw Error('response_too_large_no_truncation');}chunks.push(Buffer.from(value));}
 return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
}
async function fetchItem({itemCode,credentials,executionSha,fetchImpl=global.fetch,now=()=>new Date().toISOString()}){
 if(!/^[a-z0-9_-]+:[A-Za-z0-9_-]+$/.test(itemCode||'')||!/^[a-f0-9]{40}$/.test(executionSha||''))throw Error('acquisition_scope_invalid');
 if(!credentials?.appId||!credentials?.accessKey)throw Error('rakuten_credentials_unavailable');
 const url=new URL(ENDPOINT);url.search=new URLSearchParams({applicationId:credentials.appId,itemCode,format:'json',formatVersion:'2',carrier:'0',hits:'1'});
 let response;
 try{response=await fetchImpl(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{accessKey:credentials.accessKey,Origin:'https://rakuten-affiliate-ai-mobile.vercel.app',Referer:'https://rakuten-affiliate-ai-mobile.vercel.app/'}});}catch{throw Error('rakuten_result_unknown_no_automatic_retry');}
 if(response.status===429)throw Error('rakuten_429_stop');
 if(response.status!==200)throw Error('rakuten_http_'+response.status);
 let body;try{body=await readComplete(response);}catch(e){throw Error(e.message==='response_too_large_no_truncation'?e.message:'rakuten_body_unknown_no_automatic_retry');}
 const headers=Object.fromEntries(['date','content-type','etag'].filter(k=>response.headers.has(k)).map(k=>[k,response.headers.get(k)]));
 // A provider may echo request authentication in its outer envelope. Never export
 // that envelope. The original product object must still be entirely secret-free.
 const secrets=[credentials.appId,credentials.accessKey],echoed=s=>secrets.some(secret=>s.includes(secret)||s.includes(encodeURIComponent(secret)));
 let parsed;try{parsed=JSON.parse(body);}catch{throw Error('rakuten_json_invalid');}
 if(!echoed(body)&&!echoed(JSON.stringify(parsed)))return fromResponse({body,itemCode,observedAt:now(),executionSha,responseHeaders:headers});
 const rows=Array.isArray(parsed.items)?parsed.items:parsed.Items;
 if(!Array.isArray(rows)||rows.length!==1)throw Error('provider_echoed_credential_refuse_export');
 const originalItem=rows[0]?.Item??rows[0],archivedItem={},omitted=[];let itemUrlProjection=null;
 const sourceFields=new Set([...FIELDS,...S.ATTRIBUTES]);
 for(const [key,value]of Object.entries(originalItem)){
  if(echoed(JSON.stringify(value))){
   if(key==='itemUrl'&&typeof value==='string'){
    let url;try{url=new URL(value);}catch{throw Error('rakuten_item_url_mismatch');}
    const publicURL=url.origin+url.pathname;
    if(url.username||url.password||echoed(publicURL)||url.hostname!=='item.rakuten.co.jp'||url.protocol!=='https:')throw Error('provider_credential_in_url_path_refuse_export');
    archivedItem[key]=publicURL;itemUrlProjection={operation:'drop_credential_query_fragment',originalValueHash:S.hash(JSON.stringify(value)),originalPlaintextRetained:false,publicURL};continue;
   }
   if(sourceFields.has(key)){
    const error=Error('provider_echoed_credential_in_source_refuse_export');error.safeDetails={sourceField:key};throw error;
   }
   // Non-writing transport fields (e.g. tracking/image URLs) cannot export a secret.
   omitted.push(['affiliateUrl','smallImageUrls','mediumImageUrls'].includes(key)?key:'non_source_field');
  }else archivedItem[key]=value;
 }
 const archivedBody=JSON.stringify({items:[archivedItem]});
 const base=fromResponse({body:archivedBody,itemCode,observedAt:now(),executionSha,responseHeaders:headers});
 return S.freeze({...base,...(itemUrlProjection?{fields:{...base.fields,itemUrl:{...base.fields.itemUrl,preserved:false,originalValueHash:itemUrlProjection.originalValueHash}}}:{}),wireResponse:{hash:S.hash(body),utf8Bytes:Buffer.byteLength(body),retained:false,reason:'credential_echo_in_transport_metadata'},
  responseProjection:{operation:'retain_exact_item_drop_non_product_envelope',writingSourceFieldsChanged:false,metadataOmissionExplicit:true,
   originalProductHash:S.hash(originalItem),originalProductFullyRetained:omitted.length===0&&!itemUrlProjection,omittedCredentialEchoFields:omitted,itemUrlProjection}});
}
module.exports={VERSION,ENDPOINT,MAX_RESPONSE_BYTES,fieldState,fromResponse,verify,fetchItem};

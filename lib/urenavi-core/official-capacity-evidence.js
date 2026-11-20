'use strict';
const {createHash}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {MODEL}=require('./generation-comparison');
const SHA256=/^[a-f0-9]{64}$/;
const DIMENSIONS=['rpm','rpd','tpm','tpd'];
const UNKNOWN={limit:null,remaining:null,resetAt:null};
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const iso=value=>typeof value==='string'&&ISO.test(value)&&Number.isFinite(Date.parse(value))&&
 new Date(value).toISOString()===value;
const uint=value=>Number.isSafeInteger(value)&&value>=0&&value<=1000000000;

function normalizeCounter(counter={}){
 const {limit=null,remaining=null,resetAt=null}=counter??{};
 if((limit!==null&&!uint(limit))||(remaining!==null&&!uint(remaining))||
  (limit!==null&&remaining!==null&&remaining>limit)||(resetAt!==null&&!iso(resetAt)))
  throw Error('invalid_official_counter');
 return {limit,remaining,resetAt};
}

function durationMillis(text){
 const parts=typeof text==='string'&&text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d{1,3})?)s)?(?:(\d+)ms)?$/);
 if(!parts||!text||(!parts[1]&&!parts[2]&&!parts[3]&&!parts[4]))return null;
 const ms=Number(parts[1]||0)*3600000+Number(parts[2]||0)*60000+
  Math.round(Number(parts[3]||0)*1000)+Number(parts[4]||0);
 return Number.isSafeInteger(ms)&&ms<=86400000?ms:null;
}

function readHeaders(bytes,capturedAt){
 const artifact=JSON.parse(bytes.toString('utf8'));
 if(!artifact||typeof artifact!=='object'||Array.isArray(artifact))throw Error('invalid_rate_header_artifact');
 const entries=Object.entries(artifact);
 const headers=new Map();
 for(const [name,value] of entries){
  const key=name.toLowerCase();
  if(!/^x-ratelimit-(?:limit|remaining|reset)-(?:requests|tokens)$/.test(key)||headers.has(key)||
   typeof value!=='string')throw Error('invalid_rate_header_artifact');
  headers.set(key,value);
 }
 function counter(kind){
  function integer(field){
   const value=headers.get('x-ratelimit-'+field+'-'+kind);
   if(value===undefined)return null;
   if(!/^\d+$/.test(value))throw Error('invalid_rate_header_counter');
   return Number(value);
  }
  const duration=durationMillis(headers.get('x-ratelimit-reset-'+kind));
  return normalizeCounter({limit:integer('limit'),remaining:integer('remaining'),
   resetAt:duration===null?null:new Date(Date.parse(capturedAt)+duration).toISOString()});
 }
 return {rpm:{...UNKNOWN},rpd:counter('requests'),tpm:counter('tokens'),tpd:{...UNKNOWN}};
}

function importOfficialEvidence(observation,artifact){
 const {organization,project,credentialSha256}=observation?.account??{};
 if(!Buffer.isBuffer(artifact)||!artifact.length||artifact.length>20*1024*1024||
  !iso(observation?.verifiedAt)||!['groq_console','groq_headers'].includes(observation.source)||
  observation.model!==MODEL||typeof organization!=='string'||!organization.trim()||
  typeof project!=='string'||!project.trim()||!SHA256.test(credentialSha256||''))throw Error('invalid_official_observation');

 const counters=observation.source==='groq_headers'?readHeaders(artifact,observation.verifiedAt):
  Object.fromEntries(DIMENSIONS.map(name=>[name,normalizeCounter(observation.counters?.[name])]));
 const artifactSha256=createHash('sha256').update(artifact).digest('hex');
 return {source:observation.source,artifactSha256,verifiedAt:observation.verifiedAt,
  model:observation.model,account:{organization,project,credentialSha256},plan:observation.plan==='free'?'free':null,
  billable:observation.billable===false?false:null,exclusiveWindow:observation.exclusiveWindow===true,
  unresolvedSends:uint(observation.unresolvedSends)?observation.unresolvedSends:null,counters};
}

function matchesOfficialArtifact(payload,artifact){
 try{
  const imported=importOfficialEvidence(payload,artifact);
  return Object.entries(imported).every(([field,value])=>isDeepStrictEqual(payload[field],value));
 }catch{return false;}
}

function officialWindows(e,account,now,estimate,timeout){
 if(!e||e.source!=='groq_console'||!SHA256.test(e.artifactSha256||'')||
  e.model!==MODEL||!isDeepStrictEqual(e.account,account)||e.plan!=='free'||e.billable!==false||
  e.exclusiveWindow!==true||e.unresolvedSends!==0||!iso(e.verifiedAt))return null;
 const seen=Date.parse(e.verifiedAt);
 if(seen>now||seen<now-60000)return null;
 for(const name of DIMENSIONS){
  const counter=e.counters?.[name];
  if(!uint(counter?.limit)||!uint(counter.remaining)||counter.remaining>counter.limit||
   counter.remaining<(name.startsWith('t')?estimate:1)||
   !iso(counter.resetAt)||Date.parse(counter.resetAt)<=now+timeout)return null;
 }
 const {rpm,rpd,tpm,tpd}=e.counters;
 // v2 stores a common expiry for the two measures in each period.
 if(rpm.resetAt!==tpm.resetAt||rpd.resetAt!==tpd.resetAt)return null;
 return {minuteEnd:rpm.resetAt,dayEnd:rpd.resetAt};
}

module.exports={importOfficialEvidence,matchesOfficialArtifact,officialWindows};

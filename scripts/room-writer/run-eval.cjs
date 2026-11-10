'use strict';
// S3 single-output-file laboratory runner. No app APIs, database, Blob, billing,
// old claims or journals. Sends at most ONE provider request per product.
// Incomplete S1 or unverified capacity prevents ALL live calls.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {pack}=require('../../lib/room-writer/source-pack');
const {build}=require('../../lib/room-writer/writer');
const {verify}=require('../../lib/room-writer/verify');
const {compose}=require('../../lib/room-writer/compose');
const B=require('../../lib/room-writer/budget');
const SET=path.join(__dirname,'../../tests/room-writer/eval-set.json');
const OUT=path.resolve(process.env.ROOM_WRITER_RESULT_FILE||'room-writer-e1-results.json');
const LOCK=OUT+'.exclusive.lock';
let lockFd=null;
function claimExclusive(){try{lockFd=fs.openSync(LOCK,'wx',0o600);fs.writeSync(lockFd,String(process.pid)+'\n');fs.fsyncSync(lockFd);}catch{die('S3_EXCLUSIVE_LOCAL_LOCK_UNAVAILABLE');}}
function releaseExclusive(){if(lockFd!==null){fs.closeSync(lockFd);lockFd=null;fs.unlinkSync(LOCK);}}

const now=()=>Date.now();
const number=x=>x===null||x===undefined||String(x).trim()===''?null:(Number.isSafeInteger(Number(x))&&Number(x)>=0?Number(x):null);
const isoDay=()=>new Date().toISOString().slice(0,10);
const die=(code,details={})=>{const e=new Error(code);e.details=details;throw e;};
function entries(requireComplete=true){
 const data=JSON.parse(fs.readFileSync(SET,'utf8'));
 const a=data?.historical?.entries||[],b=data?.holdout?.entries||[];
 const all=[...a,...b];
 const seen=new Set();
 for(const row of all){
  const item=row?.item;
  if(!item?.itemCode||typeof item.itemName!=='string'||typeof item.itemCaption!=='string'||seen.has(item.itemCode))die('eval_source_invalid_or_duplicate');
  seen.add(item.itemCode);
 }
 if(requireComplete&&(data.status!=='complete'||a.length!==20||b.length!==20||all.length!==40))die('S1_missing_20_independent_holdouts',{historical:a.length,holdout:b.length});
 if(new Set(all.map(x=>x.category)).size<8)die('S1_insufficient_genres');
 const counts={};for(const row of a)counts[row.category]=(counts[row.category]||0)+1;
 if(Object.values(counts).some(n=>n>2))die('S1_historical_category_cap_exceeded');
 return all;
}
function preflight(){
 const day=number(process.env.ROOM_WRITER_DAY),observed=number(process.env.ROOM_WRITER_CAPACITY_OBSERVED_AT);
 const remainingMinute=number(process.env.ROOM_WRITER_MINUTE_TOKENS_AVAILABLE);
 const remainingDaily=number(process.env.ROOM_WRITER_DAILY_TOKENS_AVAILABLE);
 const sha=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(process.env.ROOM_WRITER_S3_APPROVED_SHA!==sha||process.env.ROOM_WRITER_EXCLUSIVE_APPROVED!=='true')die('S3_SHA_OR_EXCLUSIVE_APPROVAL_MISSING');
 if(!observed||now()-observed>60000||observed>now()||remainingMinute===null||remainingDaily===null||remainingMinute>8000||remainingDaily>200000)die('S3_FRESH_CAPACITY_UNVERIFIED');
 if(day!==1&&day!==2)die('S3_DAY_MUST_BE_1_OR_2');
 if(!process.env.GROQ_API_KEY)die('S3_PROVIDER_KEY_NOT_PRESENT');
 if(OUT.includes('/docs/rebuild-20261028/')||OUT.includes('/.git/'))die('result_destination_prohibited');
 return {day,sha,remainingMinute,remainingDaily};
}
function loadReport(){
 if(!fs.existsSync(OUT))return {posts:[],experiment:'room_writer_e1_v1',model:'openai/gpt-oss-120b',sourceSha:'563e65e0339aa2e33708b998af7e4e47a884ccd3',days:{},stopped:null};
 const data=JSON.parse(fs.readFileSync(OUT,'utf8'));
 if(data.experiment!=='room_writer_e1_v1'||!Array.isArray(data.posts)||data.stopped)die('S3_EXISTING_RESULT_UNSAFE_TO_RESUME');
 if(data.posts.some(x=>x.state!=='completed'))die('S3_PREVIOUS_REQUEST_UNCERTAIN');
 return data;
}
function save(report){
 const fd=fs.openSync(OUT,'w',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(report,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function estimate(request){
 const s=JSON.stringify(request),nonAscii=(s.match(/[^\x00-\x7f]/g)||[]).length;
 return Math.ceil((s.length-nonAscii)/4+nonAscii*1.4+500);
}
async function run(){
 const live=process.argv.includes('--live');
 const list=entries(live); // S1 must finish before provider can be used.
 if(!live){
  const inspect=list.map(row=>{const p=pack({catchcopy:'',...row.item}),b=build(p);
   return {itemCode:row.item.itemCode,category:row.category,facts:p.facts.length,incomplete:p.incomplete,held:b.hold,reason:b.reason};});
  process.stdout.write(JSON.stringify({mode:'offline_preflight',calls:0,entries:inspect},null,2)+'\n');
  return;
 }
 const p=preflight();
 claimExclusive();
 const report=loadReport();
 if(p.day===2&&(!report.days['1']||report.days['1']===isoDay()))die('S3_TWO_DISTINCT_DAYS_REQUIRED');
 if(p.day===1&&report.days['1'])die('S3_DAY1_ALREADY_FINISHED');
 const subset=list.slice((p.day-1)*20,p.day*20);
 const seen=new Set(report.posts.map(r=>r.itemCode));
 let dayUsed=report.posts.filter(x=>x.day===p.day&&Number.isSafeInteger(x.tokens)).reduce((n,x)=>n+x.tokens,0),minuteUsed=0,remainingMinute=p.remainingMinute,remainingDaily=p.remainingDaily;
 const observed=[],started=now();
 for(const row of subset){
  if(seen.has(row.item.itemCode))continue; // completed distinct item, never resend
  const source=pack({catchcopy:'',...row.item});
  const draft=build(source);
  if(draft.hold){
   report.posts.push({itemCode:row.item.itemCode,day:p.day,state:'completed',post:null,hold:draft.reason,tokens:0,latencyMs:0});save(report);continue;
  }
  const reserved=estimate(draft.request)+2000;
  const gate=B.budget({dayUsed,minuteUsed,inputEstimate:estimate(draft.request),unresolved:false,capacityObserved:true});
  if(!gate.allow||reserved>remainingMinute||reserved>remainingDaily){report.stopped='capacity_hold';save(report);die('S3_CAPACITY_INSUFFICIENT');}
  const event={itemCode:row.item.itemCode,category:row.category,day:p.day,state:'attempt_started',post:null,
   status:'pending',tokens:null,latencyMs:null,sha:crypto.createHash('sha256').update(JSON.stringify(draft.request)).digest('hex')};
  report.posts.push(event);save(report); // durable pre-send record; never retry after ambiguous crash
  const startedAt=now();let http=null,body=null,headers=null;
  try{
   const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',headers:{authorization:'Bearer '+process.env.GROQ_API_KEY,'content-type':'application/json'},
    body:JSON.stringify(draft.request),signal:AbortSignal.timeout(90000)});
   http=response.status;
   headers=response.headers;
   body=await response.json();
  }catch(e){report.stopped='transport_or_unknown_consumption';event.status='unknown';event.latencyMs=now()-startedAt;save(report);die('S3_AMBIGUOUS_PROVIDER_RESULT_DO_NOT_RETRY');}
  event.latencyMs=now()-startedAt;event.httpStatus=http;
  const usage=body?.usage||null,settled=B.onResponse(http,usage);
  if(!settled.ok){report.stopped=settled.reason;event.status=settled.reason;save(report);die('S3_STOP_NO_RETRY',{reason:settled.reason,http});}
  event.tokens=settled.consumed;dayUsed+=settled.consumed;minuteUsed+=settled.consumed;
  const remainingHeader=number(headers?.get('x-ratelimit-remaining-tokens'));
  const remainingReq=number(headers?.get('x-ratelimit-remaining-requests'));
  if(remainingHeader===null||remainingReq===null){report.stopped='provider_capacity_unobserved';event.status='usage_reported_but_capacity_unknown';save(report);die('S3_CAPACITY_UNOBSERVED_NO_NEXT_CALL');}
  remainingMinute=Math.min(remainingHeader,Math.max(0,remainingMinute-settled.consumed));
  remainingDaily=Math.max(0,remainingDaily-settled.consumed);
  if(usage.prompt_tokens+usage.completion_tokens>reserved){report.stopped='actual_usage_exceeded_reservation';event.status='capacity_misestimation';save(report);die('S3_RESERVATION_UNDERESTIMATED');}
  let generated;try{generated=JSON.parse(body?.choices?.[0]?.message?.content||'');}
  catch{report.stopped='model_json_invalid';event.status='invalid_json';save(report);die('S3_JSON_INVALID_NO_RETRY');}
  const verdict=verify(source,generated);
  event.verdict=verdict;event.draft=generated;event.post=verdict.ok?compose(generated,verdict,{itemPrice:row.item.itemPrice}).text:null;
  event.status=verdict.status;event.state='completed';save(report);
  if(http===429){report.stopped='429';save(report);die('S3_429_NO_RETRY');}
  observed.push(settled.consumed);
  const firstFive=report.posts.filter(x=>x.day===p.day&&Number.isSafeInteger(x.tokens)&&x.tokens>0).slice(0,5);
  if(firstFive.length===5&&firstFive.reduce((a,b)=>a+b.tokens,0)/5>6000){report.stopped='five_sample_mean_over_6000';save(report);die('S3_TOKEN_SAMPLE_STOP');}
  if(now()-started>8*60*60*1000){report.stopped='execution_window_limit';save(report);die('S3_WINDOW_STOP');}
  // At most ONE new provider call per invocation. A fresh capacity preflight
  // is mandatory for each subsequent, distinct item; never retry this item.
  break;
 }
 if(subset.every(row=>report.posts.some(x=>x.itemCode===row.item.itemCode&&x.state==='completed')))report.days[String(p.day)]=isoDay();
 save(report);
 releaseExclusive(); // Leave lock on any error or uncertain usage; human reconciliation required.
}
run().catch(e=>{process.stderr.write(JSON.stringify({error:e.message,...(e.details||{})})+'\n');process.exitCode=1;});

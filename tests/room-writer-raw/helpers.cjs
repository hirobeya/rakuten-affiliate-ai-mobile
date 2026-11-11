'use strict';
const {prepare}=require('../../lib/room-writer-raw/source');
const {build}=require('../../lib/room-writer-raw/contract');
function item(code='synthetic:case',name='収納ケース'){
 return {itemCode:code,itemName:name,itemCaption:'■モデル別仕様\n標準モデル:引き出しに文具を収められます。\n上位モデル:引き出しの仕切りは約3cm間隔で調整できます。\n■共通仕様\n本体は木製です。書類と文具の置き場所を分けて使えます。',catchcopy:'',itemPrice:1200};
}
const evidence=(quote,field='itemCaption')=>({field,quote});
const claim=(text,quote,{scope=null,kind='fact',field='itemCaption'}={})=>({text,kind,scope,basis:[evidence(quote,field)]});
function draft(i=item()){
 return {product:{name:i.itemName,unit:null,basis:[evidence(i.itemName,'itemName')]},hold:{active:false,reason:''},post:{
  sentences:[claim('標準モデルは引き出しに文具を収められます。','標準モデル:引き出しに文具を収められます。',{scope:'標準モデル'}),claim('書類と文具を分けたい場合の収納ケースに。','書類と文具の置き場所を分けて使えます。',{kind:'scene'})],notes:[],tags:[]}};
}
const localFailure=async()=>({result:null,groqCalls:0,localStatus:'incomplete',diagnostic:{cause:'F',reason:'insufficient_quality'}});
const {hash}=require('../../lib/room-writer-raw/source');
const Q=require('../../lib/room-writer-raw/local-quality');
const assessQuality=status=>async p=>({version:Q.VERSION,status,sourceHash:p.sourceHash,outputHash:p.outputHash,localHash:p.localHash,reviewerId:'synthetic-quality-evaluator',method:'independent_review',reason:'Synthetic evaluation only; not actual product quality approval.',axes:Object.fromEntries(Q.AXES.map(k=>[k,status==='passed'?true:k==='choice'?false:true]))});
const passedQuality=assessQuality('passed'),failedQuality=assessQuality('failed');
function admission(prepared,audit,now=100000){const bundle=prepared.bundle,state=audit.state();return {executionSha:'a'.repeat(40),clock:()=>now,audit,
 approval:{version:'raw-source-fallback-live-v2',authorized:true,environment:'isolated_experiment',executionSha:'a'.repeat(40),sourceHash:bundle.envelope.sourceHash,requestHash:bundle.requestHash,qualityHash:hash(prepared.quality),experimentId:state.experimentId,auditId:state.auditId,maxCalls:1,automaticRetries:0,expiresAt:now+1000},
 limits:{model:'openai/gpt-oss-120b',rpm:30,rpd:1000,tpm:8000,tpd:200000,observedAt:now},capacity:{remainingMinuteTokens:8000,remainingDailyTokens:100000,remainingDailyRequests:1000,observedAt:now,noUnknownConsumption:true,exclusive:true},
 observedUsage:{source:'independent_audit',coverage:'complete',window:'rolling_24h',periodStart:now-1000,periodEnd:now,observedAt:now,calls:0,promptTokens:0,completionTokens:0,totalTokens:0}};}
function initialAdmission(prepared,audit,now=100000){const a=admission(prepared,audit,now);a.approval={...a.approval,version:'raw-source-fallback-initial-v1',unknownCapacityPolicy:'retain_null_one_call',acceptUnknownCapacity:true,maxExperimentCalls:1,maxReservedTokens:prepared.bundle.reservation};a.capacity={...a.capacity,remainingMinuteTokens:null,remainingDailyTokens:null,remainingDailyRequests:null};a.observedUsage={source:'provider_logs',coverage:'partial',window:'rolling_24h',periodStart:now-1000,periodEnd:now,observedAt:now,calls:1,promptTokens:120,completionTokens:30,totalTokens:150};return a;}
function response(d=draft()){return {status:200,usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20},finishReason:'stop',content:JSON.stringify(d),capacity:{remainingMinuteTokens:7980,remainingDailyRequests:999,remainingDailyTokens:null}};}
module.exports={item,evidence,claim,draft,localFailure,admission,initialAdmission,response,prepare,build,passedQuality,failedQuality};

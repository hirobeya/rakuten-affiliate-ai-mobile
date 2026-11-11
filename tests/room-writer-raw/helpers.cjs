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
function admission(bundle,audit,now=100000){return {executionSha:'a'.repeat(40),clock:()=>now,audit,
 approval:{version:'raw-source-fallback-live-v1',environment:'isolated_experiment',executionSha:'a'.repeat(40),sourceHash:bundle.envelope.sourceHash,requestHash:bundle.requestHash,maxCalls:1,automaticRetries:0,expiresAt:now+1000},
 limits:{model:'openai/gpt-oss-120b',rpm:30,rpd:1000,tpm:8000,tpd:200000,observedAt:now},capacity:{remainingMinuteTokens:8000,remainingDailyTokens:100000,remainingDailyRequests:1000,observedAt:now,noUnknownConsumption:true,exclusive:true}};}
function response(d=draft()){return {status:200,usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20},finishReason:'stop',content:JSON.stringify(d),capacity:{remainingMinuteTokens:7980,remainingDailyRequests:999,remainingDailyTokens:null}};}
module.exports={item,evidence,claim,draft,localFailure,admission,response,prepare,build};

'use strict';
const crypto=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Extracted without altering the original deterministic ID contract in PR #184.
function attemptId({userId,model,item,stage,state}){
 if(!UUID.test(String(userId||'')) || !['generate','verify'].includes(stage))return null;
 if(!Number.isSafeInteger(state?.attempt)||state.attempt<0||state.attempt>3)return null;
 if(!item?.itemCode || !item?.itemName || typeof item?.itemCaption!=='string')return null;
 const payload=JSON.stringify(['urenavi-capacity-v1',userId,model,
  item.itemCode,item.itemName,item.itemCaption,item.catchcopy||'',stage,state.attempt]);
 const hex=crypto.createHash('sha256').update(payload).digest('hex');
 return [hex.slice(0,8),hex.slice(8,12),'4'+hex.slice(13,16),
  '8'+hex.slice(17,20),hex.slice(20,32)].join('-');
}
function actualUsage(usage){
 const input=usage?.prompt_tokens??usage?.input_tokens;
 const output=usage?.completion_tokens??usage?.output_tokens;
 return Number.isSafeInteger(input)&&input>=0&&
  Number.isSafeInteger(output)&&output>=0?input+output:null;
}
module.exports={attemptId,actualUsage};

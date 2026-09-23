'use strict';
const {defaultCallGroq}=require('../api/room-ai');
const {validateAiExtraction,buildDerivedCopy,buildValueFirstPost}=require('../lib/room-ai');

const samples=[
  {key:'バイクグローブ',itemName:'バイクグローブ 本革 山羊革 スマホ対応 面ファスナー 通気性',itemCaption:'本革（山羊革）を使用。親指と人差し指はタッチ対応。面ファスナーで手首のフィット感を調整可能。通気性を考えた仕様。',itemPrice:3100},
  {key:'野球グローブ',itemName:'野球グローブ 軟式 右投げ用',itemCaption:'軟式野球用。右投げ用。手に馴染みやすい天然皮革を使用。',itemPrice:5980},
  {key:'収納ベンチ',itemName:'収納ベンチ 折りたたみ式 収納ボックス',itemCaption:'折りたたみ式。使わない時はコンパクトに収納可能。座れる収納ベンチ。収納スペース付き。',itemPrice:3980}
];

(async()=>{
  const apiKey=String(process.env.GROQ_API_KEY||'').trim();
  if(!apiKey) throw new Error('GROQ_API_KEY secret is missing');
  for(const s of samples){
    const ai=await defaultCallGroq({apiKey,model:'qwen/qwen3.8-27b',itemName:s.itemName,itemCaption:s.itemCaption,itemPrice:s.itemPrice,imageDataUrl:null,maxOutputTokens:360});
    const validation=validateAiExtraction(ai.raw,{itemName:s.itemName,itemCaption:s.itemCaption},{imageAvailable:false});
    const derived=buildDerivedCopy(validation);
    const roomPost=buildValueFirstPost({validation,derived,itemPrice:s.itemPrice});
    console.log('=== '+s.key+' ===');
    console.log(JSON.stringify({raw:ai.raw,mode:validation.mode,derived,roomPost},null,2));
    await new Promise(r=>setTimeout(r,750));
  }
})().catch(err=>{console.error(err?.stack||err);process.exit(1);});

'use strict';

const base=require('./room-ai-v3');
const groqLib=require('../lib/super-urenavi-v3-groq');
const {PASS1_SCHEMA,PASS1_SYSTEM_PROMPT}=require('../lib/super-urenavi-v3-understanding');
const {PASS2_SCHEMA,PASS2_SYSTEM_PROMPT}=require('../lib/super-urenavi-v3-verifier');
const legacy=require('../lib/room-ai-handler');

const apiKey=String(process.env.GROQ_API_KEY||'').trim();
const model=String(process.env.GROQ_ROOM_MODEL||groqLib.DEFAULT_MODEL).trim()||groqLib.DEFAULT_MODEL;
const budget=Math.max(720,Math.min(2400,Number(process.env.V3_EVAL_PASS1_TOKENS)||1600));

async function diagnosticFetch(...args){
  const response=await fetch(...args);
  if(!response.ok){
    const body=await response.clone().text().catch(()=> '');
    console.error('v3 preview groq upstream',JSON.stringify({status:response.status,body:body.slice(0,4000),pass1Budget:budget}));
  }
  return response;
}

function createEvalGroq(){
  return {
    callPass1:({item})=>groqLib.callStructured({
      apiKey,model,fetchImpl:diagnosticFetch,
      systemPrompt:PASS1_SYSTEM_PROMPT,
      userPayload:{itemName:String(item?.itemName||'').slice(0,1000),itemCaption:groqLib.capCaption(item?.itemCaption||''),itemPrice:Number(item?.itemPrice)||0},
      schema:PASS1_SCHEMA,schemaName:'super_urenavi_v3_understanding',maxOutputTokens:budget
    }),
    callPass2:({verificationInput})=>groqLib.callStructured({
      apiKey,model,fetchImpl:diagnosticFetch,
      systemPrompt:PASS2_SYSTEM_PROMPT,userPayload:{appeals:verificationInput},
      schema:PASS2_SCHEMA,schemaName:'super_urenavi_v3_verification',maxOutputTokens:320
    })
  };
}

const handler=base.createHandler({authorize:async()=>({ok:true,plan:'owner',user:{email:'preview-evaluator'}}),groq:createEvalGroq()});

module.exports=async function(req,res){
  if(String(process.env.VERCEL_ENV||'')!=='preview') return res.status(404).json({message:'Not found'});
  if(req.method==='GET' && String(req.query?.diagnostic||'')==='1'){
    req.method='POST';
    req.body={itemCode:'mpowjapan:10000597:budget-'+budget,itemName:'エペイオス(Epeios) ノンフライヤー ノンフライオーブン 14L大容量 エアフライヤー 油なし調理 オーブントースター 1台6役 揚げ物 フライドポテト グリル調理 惣菜パン タッチパネル レシピ付き 家庭用 送料無料',itemCaption:'商品仕様 容量 14L 本体重量 9.8kg 総重量 11.7kg 電源 100V 50/60Hz 電力 1400W 温度 50-220°C 時間設定 1分-60分 本体寸法 幅330mm 奥行き370mm 高さ380mm。16のメニューオプションを搭載。',itemPrice:22980,imageUrl:''};
  }
  res.setHeader('X-V3-Eval-Pass1-Tokens',String(budget));
  return handler(req,res);
};

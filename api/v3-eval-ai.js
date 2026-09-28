'use strict';

const base=require('./room-ai-v3');
const groqLib=require('../lib/super-urenavi-v3-groq');
const {PASS1_SCHEMA,PASS1_SYSTEM_PROMPT}=require('../lib/super-urenavi-v3-understanding');
const {PASS2_SCHEMA,PASS2_SYSTEM_PROMPT}=require('../lib/super-urenavi-v3-verifier');
const apiKey=String(process.env.GROQ_API_KEY||'').trim();
const model=String(process.env.GROQ_ROOM_MODEL||groqLib.DEFAULT_MODEL).trim()||groqLib.DEFAULT_MODEL;
const budget=Math.max(720,Math.min(2400,Number(process.env.V3_EVAL_PASS1_TOKENS)||1600));
async function diagnosticFetch(...args){const response=await fetch(...args);if(!response.ok){const body=await response.clone().text().catch(()=> '');console.error('v3 preview groq upstream',JSON.stringify({status:response.status,body:body.slice(0,4000),pass1Budget:budget}));}return response;}
function createEvalGroq(){return {callPass1:({item})=>groqLib.callStructured({apiKey,model,fetchImpl:diagnosticFetch,systemPrompt:PASS1_SYSTEM_PROMPT,userPayload:{itemName:String(item?.itemName||'').slice(0,1000),itemCaption:groqLib.capCaption(item?.itemCaption||''),itemPrice:Number(item?.itemPrice)||0},schema:PASS1_SCHEMA,schemaName:'super_urenavi_v3_understanding',maxOutputTokens:budget}),callPass2:({verificationInput})=>groqLib.callStructured({apiKey,model,fetchImpl:diagnosticFetch,systemPrompt:PASS2_SYSTEM_PROMPT,userPayload:{appeals:verificationInput},schema:PASS2_SCHEMA,schemaName:'super_urenavi_v3_verification',maxOutputTokens:320})};}
const handler=base.createHandler({authorize:async()=>({ok:true,plan:'owner',user:{email:'preview-evaluator'}}),groq:createEvalGroq()});
const cases={
  fryer:{itemName:'エペイオス(Epeios) ノンフライヤー ノンフライオーブン 14L大容量 エアフライヤー 油なし調理 オーブントースター 1台6役 タッチパネル',itemCaption:'容量 14L 本体重量 9.8kg 電源 100V 50/60Hz 電力 1400W 温度 50-220°C。16のメニューオプションを搭載。',itemPrice:22980},
  shaver:{itemName:'電気シェーバー vio 電動 アンダーヘア 女性用 全身 フェイスシェーバー vライン 眉毛 ボディ レディースシェーバー',itemCaption:'電池容量 Li-ion600mAh。充電時間 約5、6時間。連続稼働時間 60分。回転数 7000/RPM。商品重量 約92g。防水機能 IPX4。',itemPrice:2980},
  umbrella:{itemName:'折りたたみ傘 メンズ 傘 日本製 傘専門店 高級 ブランド 2段折 甲州織 Plaid 8本骨 折り畳み傘 60cm グラスファイバー',itemCaption:'親骨の長さ60cm。8本骨。生地は甲州織。2段折り。',itemPrice:16500},
  kettle:{itemName:'電気ケトル 1.0L 7段階温度調節 ボデーデジタルディスプレイ 4時間保温 二重構造 空焚き防止 メモリー機能',itemCaption:'容量1.0L。7段階温度調節。4時間保温。二重構造。空焚き防止機能。',itemPrice:4980},
  pillow:{itemName:'ネックピロー 飛行機 エアー H型ネックピロー 車 収納 たためる 空気 フード付き トラベル 折りたたみ 首枕 収納ポーチ付',itemCaption:'空気を入れて使用するH型ネックピロー。折りたたんで収納可能。収納ポーチ付。',itemPrice:1700}
};
module.exports=async function(req,res){
  if(String(process.env.VERCEL_ENV||'')!=='preview')return res.status(404).json({message:'Not found'});
  if(req.method==='GET'&&String(req.query?.diagnostic||'')==='1'){
    const key=String(req.query?.case||'fryer');const item=cases[key]||cases.fryer;
    req.method='POST';req.body={...item,itemCode:'v3diag:'+key+':identity-v2:'+Date.now(),imageUrl:''};
  }
  res.setHeader('X-V3-Eval-Pass1-Tokens',String(budget));return handler(req,res);
};

'use strict';

const base=require('./room-ai-v3');
const {createV3Groq,DEFAULT_MODEL}=require('../lib/super-urenavi-v3-groq');

const handler=base.createHandler({
  authorize:async()=>({ok:true,plan:'owner',user:{email:'preview-evaluator'}}),
  groq:createV3Groq({
    apiKey:String(process.env.GROQ_API_KEY||'').trim(),
    model:String(process.env.GROQ_ROOM_MODEL||DEFAULT_MODEL).trim()||DEFAULT_MODEL,
    fetchImpl:async(...args)=>{
      const response=await fetch(...args);
      if(!response.ok){
        const body=await response.clone().text().catch(()=> '');
        console.error('v3 preview groq upstream',JSON.stringify({status:response.status,body:body.slice(0,1200)}));
      }
      return response;
    }
  })
});

module.exports=async function(req,res){
  if(String(process.env.VERCEL_ENV||'')!=='preview') return res.status(404).json({message:'Not found'});
  if(req.method==='GET' && String(req.query?.diagnostic||'')==='1'){
    req.method='POST';
    req.body={
      itemCode:'mpowjapan:10000597',
      itemName:'エペイオス(Epeios) ノンフライヤー ノンフライオーブン 14L大容量 エアフライヤー 油なし調理 オーブントースター 1台6役 揚げ物 フライドポテト グリル調理 惣菜パン タッチパネル レシピ付き 家庭用 送料無料',
      itemCaption:'商品仕様 容量 14L 本体重量 9.8kg 総重量 11.7kg 電源 100V 50/60Hz 電力 1400W 温度 50-220°C 時間設定 1分-60分 本体寸法 幅330mm 奥行き370mm 高さ380mm。16のメニューオプションを搭載。',
      itemPrice:22980,
      imageUrl:''
    };
  }
  return handler(req,res);
};

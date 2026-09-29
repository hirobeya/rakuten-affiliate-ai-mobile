'use strict';
const {verifyPost}=require('../lib/room-post-verifier-v1');
const cases={
 shaver:{sourceText:'電気シェーバー メンズ 回転式 6枚刃 IPX4 約92g USB充電\n回転式6枚刃。商品重量約92g。防水性能IPX4。USB充電に対応。',postText:'回転式6枚刃の電気シェーバー。\n重さ約92gなので、持ち運びや操作が軽くて楽です。\n防水性能IPX4があるので、シャワー中でも使えるのが便利。\nUSB充電に対応しているので、外出先でも充電しやすいです。'},
 kettle:{sourceText:'電気ケトル 0.8L 50-100℃ 1℃単位 温度設定 保温\n容量0.8L。50〜100℃の範囲を1℃単位で温度設定できます。',postText:'0.8Lの電気ケトル。\n50〜100℃の範囲を1℃単位で温度設定できるので、飲み物に合わせて細かく温度を調整したい時に便利です。\n温度をきめ細かく決められるので、毎回同じ設定に合わせたいときに使いやすいです。'}
};
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 if(process.env.VERCEL_ENV!=='preview')return res.status(404).json({message:'Not found'});
 const id=String(req.query?.id||'shaver');const row=cases[id];if(!row)return res.status(400).json({message:'unknown case'});
 const apiKey=String(process.env.GROQ_API_KEY||'').trim();if(!apiKey)return res.status(503).json({message:'GROQ_API_KEY missing'});
 try{const result=await verifyPost({apiKey,...row});return res.status(200).json({id,...result});}
 catch(error){return res.status(error?.status||502).json({id,error:String(error?.message||error)});}
};

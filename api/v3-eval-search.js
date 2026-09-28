'use strict';

const {createHandler}=require('./search');

const ALLOWED=new Set([
  '電気シェーバー','エアフライヤー','折りたたみ傘','電気ケトル','ネックピロー',
  'ワイヤレスイヤホン','フードプロセッサー','デスクライト','キャリーケース','加湿器',
  '掃除機','モバイルバッテリー','収納ボックス','バイクグローブ','ペットベッド',
  'うんち袋','水筒','ドライヤー','ホットサンドメーカー','腕時計','リュック','靴下',
  'ラグ','電動モップ','電気毛布','スマホケース','扇風機','アイロン','フライパン','キッチンスケール'
]);

const handler=createHandler({authorize:async()=>({ok:true,plan:'owner',user:{email:'preview-evaluator'}})});

module.exports=async function(req,res){
  if(String(process.env.VERCEL_ENV||'')!=='preview') return res.status(404).json({message:'Not found'});
  const keyword=String(req.query?.keyword||'').trim();
  if(!ALLOWED.has(keyword)) return res.status(400).json({message:'evaluation keyword not allowed'});
  return handler(req,res);
};

'use strict';

const {createHandler}=require('./room-ai');

function makeRes(){
  return {
    statusCode:200,body:null,headers:{},
    setHeader(k,v){this.headers[k]=v;},
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;}
  };
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='preview') return res.status(404).json({message:'Not found'});
  if(String(req.query?.token||'')!=='smoke-9f2c7a4e-20260923') return res.status(403).json({message:'Forbidden'});

  const samples=[
    {
      key:'バイクグローブ',
      itemCode:'smoke-bike-glove-20260923-v4',
      itemName:'バイクグローブ 本革 山羊革 スマホ対応 面ファスナー 通気性',
      itemCaption:'本革（山羊革）を使用。親指と人差し指はタッチ対応。面ファスナーで手首のフィット感を調整可能。通気性を考えた仕様。',
      itemPrice:3100
    },
    {
      key:'野球グローブ',
      itemCode:'smoke-baseball-glove-20260923-v4',
      itemName:'野球グローブ 軟式 右投げ用',
      itemCaption:'軟式野球用。右投げ用。手に馴染みやすい天然皮革を使用。',
      itemPrice:5980
    },
    {
      key:'収納ベンチ',
      itemCode:'smoke-storage-bench-20260923-v4',
      itemName:'収納ベンチ 折りたたみ式 収納ボックス',
      itemCaption:'折りたたみ式。使わない時はコンパクトに収納可能。座れる収納ベンチ。収納スペース付き。',
      itemPrice:3980
    }
  ];

  const roomHandler=createHandler({
    authorize:async()=>({ok:true,plan:'owner',user:{email:'preview-smoke@example.com'}})
  });

  const results=[];
  for(const sample of samples){
    const out=makeRes();
    await roomHandler({method:'POST',headers:{},body:sample},out);
    results.push({
      key:sample.key,
      status:out.statusCode,
      promptVersion:out.body?.promptVersion,
      provider:out.body?.provider,
      cache:out.body?.cache,
      rawAiJson:out.body?.rawAiJson,
      validation:out.body?.validation,
      derived:out.body?.derived,
      roomPost:out.body?.roomPost,
      message:out.body?.message
    });
  }
  return res.status(200).json({ok:true,count:results.length,results});
};

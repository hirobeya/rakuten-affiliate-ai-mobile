'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const billing=require('../lib/billing');

const TOKEN='preview-check-8a174f4-20260925';
const TARGET='https://rakuten-affiliate-ai-mobile-lsqzvhh8p-hirobeya-6572.vercel.app';

function loadCopy(){
  const document={createElement(){return {textContent:''};},head:{appendChild(){}}};
  const window={document,Intl};
  const ctx=vm.createContext({window,document,Intl,console});
  for(const file of ['fact-safety.js','pain-copy.js','room-copy-quality.js']){
    vm.runInContext(fs.readFileSync(path.join(process.cwd(),'public',file),'utf8'),ctx);
  }
  return window.UrenaviPainCopy;
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='preview') return res.status(404).json({message:'not found'});
  if(req.method!=='GET') return res.status(405).json({message:'Method not allowed'});
  if(String(req.query?.token||'')!==TOKEN) return res.status(404).json({message:'not found'});

  const owners=await billing.db('urenavi_entitlements?status=eq.owner&active=eq.true&select=email&limit=1');
  const email=String(owners?.[0]?.email||'').trim().toLowerCase();
  if(!email) return res.status(500).json({message:'owner entitlement unavailable'});

  let cookie='';
  billing.setDeviceCookie({setHeader(name,value){if(String(name).toLowerCase()==='set-cookie') cookie=String(value).split(';')[0];}},email);
  if(!cookie) return res.status(500).json({message:'owner cookie unavailable'});

  const apiResponse=await fetch(TARGET+'/api/room-ai',{
    method:'POST',
    headers:{'Content-Type':'application/json','Cookie':cookie},
    body:JSON.stringify({
      itemCode:'preview-probe-8a174f4',
      itemName:'タオル 10枚入り コットン',
      itemCaption:'',
      itemPrice:1200,
      imageUrl:''
    }),
    signal:AbortSignal.timeout(30000)
  });
  const apiBody=await apiResponse.json().catch(()=>({}));

  const copy=loadCopy();
  const fallbackItems=[
    {id:'fallback-1',itemName:'ケース 防水 ワンタッチ 人気',itemPrice:1000},
    {id:'fallback-2',itemName:'商品 メンズ ギフト 人気',itemPrice:2000},
    {id:'fallback-3',itemName:'スマホスタンド 卓上 ブラック',itemPrice:1500}
  ];
  const generatedItems=[
    {id:'generated-1',itemName:'財布 本革 ブラック',itemPrice:5000},
    {id:'generated-2',itemName:'タオル 10枚入り 送料無料',itemPrice:1200},
    {id:'generated-3',itemName:'ケーブル HDMI USB-C対応',itemPrice:1800}
  ];
  const internal=/\b(?:fallback|validation|eligibleForPost)\b|内部|警告|誤った投稿文|エラー|AI分析/i;
  const check=item=>{
    const room=copy.makeRoomCopy(item,'');
    const threads=copy.makeThreadsCopy(item,'');
    const instagram=copy.makeInstagramCopy(item,'');
    return {
      id:item.id,itemName:item.itemName,
      room,threads,instagram,
      copyDisabled:!String(room||'').trim(),
      internalLeak:internal.test([room,threads,instagram].join('\n')),
      channelsIdentical:room===threads&&room===instagram
    };
  };

  return res.status(200).json({
    targetHead:'8a174f4b20919347e6005ed3b920b0cfcc5480b4',
    target:TARGET,
    roomAi:{status:apiResponse.status,ok:apiResponse.ok,provider:apiBody.provider||null,phase:apiBody.phase||null,mode:apiBody.validation?.mode||null,message:apiBody.message||null},
    fallback:fallbackItems.map(check),
    generated:generatedItems.map(check)
  });
};
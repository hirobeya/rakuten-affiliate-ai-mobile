const search=require('./search');
const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
const norm=s=>String(s||'').normalize('NFKC').toLowerCase();

function cleaningRole(itemName){
  const t=norm(itemName);
  const isSign=/室名プレート|ネームプレート|看板|サイン|標識|ステッカー|シール/.test(t);
  const isStandaloneAccessory=/ワイパースタンド|モップスタンド|掃除用具入れ|掃除用具収納|掃除道具収納|クリーナーツールオーガナイザー|ツールオーガナイザー|ワイパーホルダー|モップホルダー|掃除用品?収納|掃除道具置き場|掃除用具置き場/.test(t);
  const isTool=/モップ|ブラシ|クリーナー|ダスター|ほこり取り|掃除機|スポンジ|クロス|雑巾|ちりとり|ほうき|床ブラシ|フロアワイパー|ワイパーシート|替えシート|掃除シート/.test(t);

  if(isSign) return 'sign';
  if(isStandaloneAccessory) return 'accessory';
  if(isTool) return 'tool';
  return 'other';
}

function intentScore(item,keyword){
  const t=norm(item.itemName),q=norm(keyword);
  let s=50;
  const boost=(re,n)=>{if(re.test(t)) s+=n;};
  const penalize=(re,n)=>{if(re.test(t)) s-=n;};

  if(/掃除用品|掃除道具|掃除グッズ|掃除/.test(q)){
    const role=cleaningRole(item.itemName);
    if(role==='tool') s=92;
    else if(role==='accessory') s=10;
    else if(role==='sign') s=2;
    else s=42;
  }
  if(/レンジ調理|電子レンジ/.test(q)){
    boost(/電子レンジ|レンジ調理器|レンジクッカー|レンジパン|レンジポット|レンジメート|ムテキレンジ|蒸し器|レンジで焼/,24);
    penalize(/収納|ラック|カバー|掃除|クリーナー/,30);
  }
  if(/収納/.test(q)){
    boost(/収納|ラック|棚|ケース|チェスト|ボックス|キャビネット|引き出し|ハンガー|クローゼット/,20);
    penalize(/看板|標識|ステッカー|シール/,35);
  }
  if(/防臭袋|消臭袋|臭わない袋/.test(q)){
    boost(/防臭|消臭|臭わない|bos|ゴミ袋|おむつ|生ゴミ/,24);
    penalize(/消臭スプレー|芳香剤|空気清浄/,24);
  }
  if(/排水口|ゴミ受け|ヘアキャッチ/.test(q)){
    boost(/排水口|ゴミ受け|ヘアキャッチ|水切りネット|ネットホルダー/,24);
    penalize(/洗剤|パイプクリーナー|ブラシ/,12);
  }
  if(/水筒|ボトル|タンブラー/.test(q)) boost(/水筒|ボトル|タンブラー/,18);
  return clamp(s);
}

module.exports=async function(req,res){
  let statusCode=200,payload=null;
  const proxy={
    setHeader:(...a)=>res.setHeader(...a),
    status(code){statusCode=code;return this;},
    json(data){payload=data;return data;}
  };
  await search(req,proxy);
  if(statusCode!==200||!payload||!Array.isArray(payload.items)) return res.status(statusCode).json(payload||{});

  const keyword=String(req.query.keyword||'');
  const q=norm(keyword);
  const cleaningQuery=/掃除用品|掃除道具|掃除グッズ|掃除/.test(q);

  const items=payload.items.map(x=>{
    const intent=intentScore(x,keyword);
    const baseScore=+x.score||0;
    let adjusted;
    let role='other';

    if(cleaningQuery){
      role=cleaningRole(x.itemName);
      if(role==='tool') adjusted=Math.round(baseScore*0.55+intent*0.45);
      else if(role==='accessory') adjusted=Math.min(45,Math.round(baseScore*0.55+intent*0.45));
      else if(role==='sign') adjusted=Math.min(20,Math.round(baseScore*0.55+intent*0.45));
      else adjusted=Math.round(baseScore*0.65+intent*0.35);
    }else{
      adjusted=Math.round(baseScore*0.72+intent*0.28);
    }

    return {...x,baseScore,score:adjusted,_intent:intent,_adjusted:adjusted,_role:role};
  }).sort((a,b)=>b._adjusted-a._adjusted||b._intent-a._intent||b.baseScore-a.baseScore);

  const cleaned=items.map(({_intent,_adjusted,_role,...x})=>x);
  return res.status(200).json({...payload,items:cleaned});
};

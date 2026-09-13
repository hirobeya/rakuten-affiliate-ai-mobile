const search=require('./search');
const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
const norm=s=>String(s||'').normalize('NFKC').toLowerCase();

function intentScore(item,keyword){
  const t=norm(item.itemName),q=norm(keyword);
  let s=50;
  const boost=(re,n)=>{if(re.test(t)) s+=n;};
  const penalize=(re,n)=>{if(re.test(t)) s-=n;};

  if(/掃除用品|掃除道具|掃除グッズ|掃除/.test(q)){
    const isTool=/モップ|ブラシ|クリーナー|ダスター|ほこり取り|掃除機|スポンジ|クロス|雑巾|ちりとり|ほうき|床ブラシ|フロアワイパー|ワイパーシート|替えシート|掃除シート/.test(t);
    const isAccessory=/スタンド|収納|用具入れ|ホルダー|ラック|置き場|オーガナイザー|ケース/.test(t);
    const isSign=/室名プレート|ネームプレート|看板|サイン|標識|ステッカー|シール/.test(t);

    boost(/モップ|ブラシ|クリーナー|ダスター|ほこり取り|掃除機|スポンジ|クロス|雑巾|ちりとり|ほうき|床ブラシ|フロアワイパー/,34);
    boost(/激落ち|ハンディモップ|ワイパーシート|替えシート|掃除シート/,12);
    penalize(/スタンド|収納|用具入れ|ホルダー|ラック|置き場|オーガナイザー|ケース/,42);
    penalize(/室名プレート|ネームプレート|看板|サイン|標識|ステッカー|シール/,65);

    if(isSign) s=Math.min(s,4);
    else if(isAccessory) s=Math.min(s,12);
    else if(isTool) s=Math.max(s,88);
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
    // 掃除用品だけは「売れやすさ」より商品タイプ一致を強める。
    // それ以外の検索は従来のバランスを維持する。
    const adjusted=cleaningQuery
      ? Math.round(baseScore*0.45+intent*0.55)
      : Math.round(baseScore*0.72+intent*0.28);
    return {...x,baseScore,score:adjusted,_intent:intent,_adjusted:adjusted};
  }).sort((a,b)=>b._adjusted-a._adjusted||b._intent-a._intent||b.baseScore-a.baseScore);

  const cleaned=items.map(({_intent,_adjusted,...x})=>x);
  return res.status(200).json({...payload,items:cleaned});
};

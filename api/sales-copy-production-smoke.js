'use strict';
const {runTwoStageGroq,defaultCallGroq}=require('./room-ai');
const FIXED_CASES={
  "beauty-roller":{itemName:"美顔ローラー 美顔器 リフトアップ 〖微弱電流〗〖防水仕様〗〖充電不要〗 小顔ローラー メンズ マイクロカレント 美顔器 ローラー 全身用 ローラー 美容グッズ 美容 グッズ 女性 男性 誕生日 レディース メンズ プレゼント ギフト",itemPrice:3980},
  "beauty-peeling":{itemName:"〖半額★スーパーSALE〗 ウォーターピーリング 美顔器 〖楽天5冠★プロ美容家監修〗 RELX リラクス 超軽量 70g 超音波 美顔器 美容グッズ ウォーターピーラー 洗顔ピーラー 毛穴ケア ピーリング 家庭用 超音波ピーリング 目元ケア 超音波 ems イオン 美容家電",itemPrice:3490},
  "beauty-kassa":{itemName:"＼当日発送／〖楽天スーパーSALE更に5％OFFcp〗4in1美顔 かっさ プレート 小顔ケア 収納袋付き 美容グッズ 美顔器 フェイスケア 頭皮ケア 顔マッサージ 全身マッサージ 小顔効果 健康グッズ ツボ押し フェイスライン リフトアップ 肩こり改善 頭皮マッサージ",itemPrice:780},
  "pet-water":{itemName:"〖1点5%OFF,2点10%OFF〗〖楽天1位〗ペットウォーターボトル 犬グッズ ペット用品 ペット 水 水飲み ボトル 犬 ペットボトル ペット給水器 犬 グッズ 散歩 外出 ドライブ 旅行 漏れ防止 ワンタッチ 贈り物",itemPrice:1880},
  "pet-toilet":{itemName:"ユニ・チャーム デオシート しっかり超吸収 無香消臭タイプ ワイド 54枚 〖公式ショップ〗トイレタリー ペットシーツ 愛犬 室内ペット用 トイレシート 無香消臭タイプ オシッコ5回分 ワイドサイズ ペットシーツ",itemPrice:2090},
  "pet-bed":{itemName:"犬用 猫用 ふわふわ ペットベッド sippo 楽天1位 S/M/L/XL もふもふ ベット ペット用 ベッド 犬 猫 暖かい クッション 秋 冬 春 夏 オールシーズン もこもこ 全猫種 小型犬 中型犬 大型犬 パピー シニア かわいい 洗える 犬ベッド 猫ベッド 丸形",itemPrice:1650}
};
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='production'||String(req.query?.token||'')!=='sales-copy-final-prod-check') return res.status(404).json({message:'Not found'});
  const keyword='バイクグローブ';
  try{
    const caseId=String(req.query?.case||'bike-glove');
    let item=null;
    if(caseId==='bike-glove'){
      const p=new URLSearchParams({
        applicationId:String(process.env.RAKUTEN_APP_ID||''),
        accessKey:String(process.env.RAKUTEN_ACCESS_KEY||''),
        affiliateId:String(process.env.RAKUTEN_AFFILIATE_ID||''),
        keyword,format:'json',formatVersion:'2',hits:'1',availability:'1',sort:'standard'
      });
      const rr=await fetch('https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?'+p.toString(),{
        signal:AbortSignal.timeout(12000),
        headers:{Origin:'https://rakuten-affiliate-ai-mobile.vercel.app',Referer:'https://rakuten-affiliate-ai-mobile.vercel.app/'}
      });
      if(!rr.ok) return res.status(rr.status).json({ok:false,stage:'rakuten'});
      const data=await rr.json();
      item=(data.items||data.Items||[])[0]?.Item||(data.items||data.Items||[])[0];
      if(!item) return res.status(404).json({ok:false,stage:'item'});
    }else{
      item=FIXED_CASES[caseId]||null;
      if(!item) return res.status(404).json({ok:false,stage:'case'});
    }
    const result=await runTwoStageGroq({
      callAI:defaultCallGroq,
      apiKey:String(process.env.GROQ_API_KEY||''),
      model:String(process.env.GROQ_ROOM_MODEL||'qwen/qwen3.8-27b'),
      itemName:String(item.itemName||''),
      itemCaption:String(item.itemCaption||'').slice(0,1200),
      itemPrice:Number(item.itemPrice)||0,
      imageUrl:'',
      allowImage:false
    });
    const v=result.validation||{};
    const features=(v.features||[]).filter(x=>x?.eligibleForPost&&x?.text&&x?.evidence).map(x=>String(x.text).trim()).slice(0,4);
    const points=(v.sellingPoints||[]).filter(x=>x?.eligibleForPost&&x?.text&&x?.evidence).map(x=>String(x.text).trim()).slice(0,2);
    const productType=(v.productType?.valid&&v.productType?.value)?String(v.productType.value):'';
    const core=x=>String(x||'').normalize('NFKC').replace(/[「」『』"'。、，,.・/／\\\s]/g,'').toLowerCase();
    const lines=[];
    if((v.mode==='simple'||v.mode==='simple_partial')&&productType){
      if(features.length>=2) lines.push(features[0]+'と'+features[1]+'を重視して、'+productType+'を選びたい方へ。');
      else if(features.length===1) lines.push(features[0]+'をチェックして、'+productType+'を選びたい方へ。');
      else if(points.length) lines.push(productType+'選びで、商品ページの違いをきちんと比べたい方へ。');
      if(points.length) lines.push('',...points);
      const extras=features.filter(f=>{const fc=core(f);return fc&&!points.some(p=>{const pc=core(p);return pc.includes(fc)||fc.includes(pc);});}).slice(0,3);
      if(extras.length) lines.push('','さらに、'+extras.join('・')+'も商品ページで確認できます。');
      if(Number(item.itemPrice)>0) lines.push('','価格：'+new Intl.NumberFormat('ja-JP').format(Number(item.itemPrice))+'円');
      lines.push('','※アフィリエイト広告を利用しています');
    }
    return res.status(200).json({ok:true,caseId,itemName:item.itemName,itemPrice:item.itemPrice,validation:v,post:lines.join('\n').slice(0,500)});
  }catch(e){return res.status(500).json({ok:false,message:String(e?.message||e)});}
};
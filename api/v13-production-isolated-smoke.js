// production-smoke-retry-20260924-2
// production-retry-after-rate-window
'use strict';
const {runTwoStageGroq,defaultCallGroq}=require('./room-ai-v13-smoke');

const TOKEN='prod-v13-isolated-seven-20260924';
const EXPIRES_AT=Date.parse('2026-09-24T00:20:00Z');

const CASES={
  'bike-glove':{itemName:'バイク グローブ 夏 春 バイク用グローブ 衝撃吸収 タッチパネル操作可能 フルフィンガー 手袋 スマホタッチ 液晶タッチ オフロード フェイクレザー 薄手の掌パッド 通気 怪我防止 指プロテクター 防滑 グリップ オートバイ 原付 自転車にも 16410006',itemPrice:3280,itemCaption:'手の甲:ポリエステル96%、スパンデックス4% 手のひら:ナイロン50%、ポリウレタン50% サイズ展開:S/M/L/XL/XXL 人差し指とスマホのスクリーンをタッチ操作できる!'},
  'beauty-roller':{itemName:'美顔ローラー 美顔器 リフトアップ 〖微弱電流〗〖防水仕様〗〖充電不要〗 小顔ローラー メンズ マイクロカレント 美顔器 ローラー 全身用 ローラー 美容グッズ',itemPrice:3980,itemCaption:''},
  'beauty-peeling':{itemName:'〖半額★スーパーSALE〗 ウォーターピーリング 美顔器 RELX リラクス 超軽量 70g 超音波 美顔器 美容グッズ ウォーターピーラー 洗顔ピーラー ピーリング 家庭用 超音波ピーリング ems イオン 美容家電',itemPrice:3490,itemCaption:''},
  'beauty-kassa':{itemName:'＼当日発送／〖楽天スーパーSALE更に5％OFFcp〗4in1美顔 かっさ プレート 小顔ケア 収納袋付き 美容グッズ 美顔器 フェイスケア 頭皮ケア 顔マッサージ 全身マッサージ',itemPrice:780,itemCaption:''},
  'pet-water':{itemName:'〖1点5%OFF,2点10%OFF〗〖楽天1位〗ペットウォーターボトル 犬グッズ ペット用品 ペット 水 水飲み ボトル 犬 ペットボトル ペット給水器 犬 グッズ 散歩 外出 ドライブ 旅行 漏れ防止 ワンタッチ 贈り物',itemPrice:1880,itemCaption:''},
  'pet-toilet':{itemName:'ユニ・チャーム デオシート しっかり超吸収 無香消臭タイプ ワイド 54枚 〖公式ショップ〗トイレタリー ペットシーツ 愛犬 室内ペット用 トイレシート 無香消臭タイプ オシッコ5回分 ワイドサイズ ペットシーツ',itemPrice:2090,itemCaption:''},
  'pet-bed':{itemName:'犬用 猫用 ふわふわ ペットベッド sippo 楽天1位 S/M/L/XL もふもふ ベット ペット用 ベッド 犬 猫 暖かい クッション 秋 冬 春 夏 オールシーズン もこもこ 全猫種 小型犬 中型犬 大型犬 パピー シニア かわいい 洗える 犬ベッド 猫ベッド 丸形',itemPrice:1650,itemCaption:''}
};

const VALUE_RULES=[
  {re:/タッチ|スマホ対応|touch/i,hook:'スマホを見るたびに外す手間が気になるなら、ここはチェック。',benefit:'着けたままスマホ操作をしやすい。',label:'スマホ操作'},
  {re:/面ファスナー|ベルクロ|調整ベルト|アジャスター/i,hook:'フィット感を自分に合わせたいなら、ここはチェック。',benefit:'手首まわりのフィット感を調整しやすい。',label:'フィット調整'},
  {re:/通気|メッシュ|蒸れ/i,hook:'長時間使うときの蒸れが気になるなら、ここはチェック。',benefit:'通気を考えた仕様を選びやすい。',label:'通気性'},
  {re:/防風|風を通しにく/i,hook:'走行中の風が気になるなら、ここはチェック。',benefit:'風を受ける場面を考えて選びやすい。',label:'防風'},
  {re:/防寒|裏起毛|保温/i,hook:'寒い時期にも使いたいなら、ここはチェック。',benefit:'寒い時期の使用を考えた仕様を選びやすい。',label:'防寒'},
  {re:/折りたたみ|折り畳み/i,hook:'使わないときの置き場所を取りたくないなら、ここはチェック。',benefit:'使わないときは省スペースでしまいやすい。',label:'省スペース'},
  {re:/軽量|軽い/i,hook:'持ち運びの負担を抑えたいなら、ここはチェック。',benefit:'持ち運びや取り回しの負担を抑えやすい。',label:'軽さ'},
  {re:/洗える|丸洗い|水洗い|洗濯可/i,hook:'汚れた後のお手入れを簡単にしたいなら、ここはチェック。',benefit:'汚れたときに手入れしやすい。',label:'お手入れ'},
  {re:/大容量|容量\s*\d|\d+\s*(?:L|ℓ|ml|mL)/i,hook:'まとめて入れられる容量を重視するなら、ここはチェック。',benefit:'収納量を重視して選びやすい。',label:'容量'},
  {re:/\d+\s*(?:個|枚|本|点|食|包|袋)\s*(?:セット|入|入り)?/i,hook:'まとめ買いのしやすさを重視するなら、ここはチェック。',benefit:'必要な数をまとめて揃えやすい。',label:'セット内容'},
  {re:/usb[- ]?c|type[- ]?c|急速充電|pd対応/i,hook:'充電まわりをすっきりまとめたいなら、ここはチェック。',benefit:'対応端子や充電仕様を見て選びやすい。',label:'充電対応'},
  {re:/滑り止め|ノンスリップ|グリップ/i,hook:'持ったときの扱いやすさを重視するなら、ここはチェック。',benefit:'グリップ性を意識して選びやすい。',label:'グリップ'},
  {re:/クッション|低反発|高反発|厚手/i,hook:'当たりのやわらかさや厚みを重視するなら、ここはチェック。',benefit:'クッション性を比べて選びやすい。',label:'クッション'}
];

function buildPost(item,validation){
  if(!(validation?.mode==='simple'||validation?.mode==='simple_partial')) return '';
  const features=(validation.features||[]).filter(x=>x?.eligibleForPost&&x?.text).map(x=>String(x.text).trim()).filter(Boolean);
  const sellingPoints=(validation.sellingPoints||[]).filter(x=>x?.eligibleForPost&&x?.text).map(x=>String(x.text).trim()).filter(Boolean);
  const proof=[...features,...sellingPoints].filter((x,i,a)=>x&&a.indexOf(x)===i).slice(0,3);
  const productType=validation.productType?.valid?String(validation.productType.value):'商品';
  const values=[];
  for(const fact of features){
    const rule=VALUE_RULES.find(r=>r.re.test(fact));
    if(rule&&!values.some(x=>x.label===rule.label)) values.push({...rule,fact});
    if(values.length>=2) break;
  }
  const priceLine=Number(item.itemPrice)>0?'価格：'+Number(item.itemPrice).toLocaleString('ja-JP')+'円':'';
  if(!values.length){
    if(!proof.length) return '';
    const lines=[productType+'で確認できる仕様をまとめました。',''];
    proof.forEach(x=>lines.push('✓ '+x));
    if(priceLine) lines.push('',priceLine);
    lines.push('','※アフィリエイト広告を利用しています');
    return lines.join('\n').slice(0,500);
  }
  const lines=[values[0].hook,'','✓ '+values[0].benefit];
  if(values[1]) lines.push('✓ '+values[1].benefit);
  if(proof.length) lines.push('','根拠になる仕様：'+proof.join('／'));
  const labels=values.map(x=>x.label).join('と');
  if(labels) lines.push('',labels+'を重視して'+productType+'を選びたい人に。');
  if(priceLine) lines.push('',priceLine);
  lines.push('','※アフィリエイト広告を利用しています');
  return lines.join('\n').slice(0,500);
}

module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='production'||Date.now()>EXPIRES_AT||String(req.query?.token||'')!==TOKEN){
    return res.status(404).json({message:'Not found'});
  }
  const caseId=String(req.query?.case||'');
  const item=CASES[caseId];
  if(!item) return res.status(400).json({message:'invalid_case'});
  const apiKey=String(process.env.GROQ_API_KEY||'').trim();
  if(!apiKey) return res.status(503).json({ok:false,groqConfigured:false});
  try{
    const result=await runTwoStageGroq({
      callAI:defaultCallGroq,
      apiKey,
      model:String(process.env.GROQ_ROOM_MODEL||'qwen/qwen3.8-27b'),
      itemName:item.itemName,
      itemCaption:item.itemCaption,
      itemPrice:item.itemPrice,
      imageUrl:'',
      allowImage:false
    });
    return res.status(200).json({
      ok:true,
      caseId,
      raw:result.ai?.raw||null,
      validation:result.validation,
      post:buildPost(item,result.validation),
      model:result.ai?.model||null
    });
  }catch(error){
    return res.status(500).json({ok:false,caseId,message:String(error?.message||error),status:error?.status||null});
  }
};
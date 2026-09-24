'use strict';
const {runTwoStageGroq,defaultCallGroq}=require('./room-ai');

const TOKEN='v13-preview-seven-20260924';
const EXPIRES_AT=Date.parse('2026-09-24T18:00:00Z');
const CASES={
  'bike-glove':{itemName:'バイク グローブ 夏 春 バイク用グローブ 衝撃吸収 タッチパネル操作可能 フルフィンガー 手袋 スマホタッチ 液晶タッチ オフロード フェイクレザー 薄手の掌パッド 通気 怪我防止 指プロテクター 防滑 グリップ オートバイ 原付 自転車にも 16410006',itemPrice:3280,itemCaption:'手の甲:ポリエステル96%、スパンデックス4% 手のひら:ナイロン50%、ポリウレタン50% サイズ展開:S/M/L/XL/XXL 人差し指とスマホのスクリーンをタッチ操作できる!'},
  'beauty-roller':{itemName:'美顔ローラー 美顔器 リフトアップ 〖微弱電流〗〖防水仕様〗〖充電不要〗 小顔ローラー メンズ マイクロカレント 美顔器 ローラー 全身用 ローラー 美容グッズ',itemPrice:3980,itemCaption:''},
  'beauty-peeling':{itemName:'〖半額★スーパーSALE〗 ウォーターピーリング 美顔器 RELX リラクス 超軽量 70g 超音波 美顔器 美容グッズ ウォーターピーラー 洗顔ピーラー ピーリング 家庭用 超音波ピーリング ems イオン 美容家電',itemPrice:3490,itemCaption:''},
  'beauty-kassa':{itemName:'＼当日発送／〖楽天スーパーSALE更に5％OFFcp〗4in1美顔 かっさ プレート 小顔ケア 収納袋付き 美容グッズ 美顔器 フェイスケア 頭皮ケア 顔マッサージ 全身マッサージ',itemPrice:780,itemCaption:''},
  'pet-water':{itemName:'〖1点5%OFF,2点10%OFF〗〖楽天1位〗ペットウォーターボトル 犬グッズ ペット用品 ペット 水 水飲み ボトル 犬 ペットボトル ペット給水器 犬 グッズ 散歩 外出 ドライブ 旅行 漏れ防止 ワンタッチ 贈り物',itemPrice:1880,itemCaption:''},
  'pet-toilet':{itemName:'ユニ・チャーム デオシート しっかり超吸収 無香消臭タイプ ワイド 54枚 〖公式ショップ〗トイレタリー ペットシーツ 愛犬 室内ペット用 トイレシート 無香消臭タイプ オシッコ5回分 ワイドサイズ ペットシーツ',itemPrice:2090,itemCaption:''},
  'pet-bed':{itemName:'犬用 猫用 ふわふわ ペットベッド sippo 楽天1位 S/M/L/XL もふもふ ベット ペット用 ベッド 犬 猫 暖かい クッション 秋 冬 春 夏 オールシーズン もこもこ 全猫種 小型犬 中型犬 大型犬 パピー シニア かわいい 洗える 犬ベッド 猫ベッド 丸形',itemPrice:1650,itemCaption:''}
};

module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='preview'||Date.now()>EXPIRES_AT||String(req.query?.token||'')!==TOKEN){
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
    return res.status(200).json({ok:true,caseId,validation:result.validation,raw:result.ai?.raw||null,model:result.ai?.model||null});
  }catch(error){
    return res.status(500).json({ok:false,caseId,message:String(error?.message||error),status:error?.status||null});
  }
};
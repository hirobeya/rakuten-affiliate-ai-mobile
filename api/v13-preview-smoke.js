'use strict';
const {runTwoStageGroq,defaultCallGroq}=require('./room-ai');

const TOKEN='v13-preview-seven-20260924';
const EXPIRES_AT=Date.parse('2026-09-24T19:00:00Z');
const CASES={
  'bike-glove':{itemName:'バイク グローブ 夏 春 バイク用グローブ 衝撃吸収 タッチパネル操作可能 フルフィンガー 手袋 スマホタッチ 液晶タッチ オフロード フェイクレザー 薄手の掌パッド 通気 怪我防止 指プロテクター 防滑 グリップ オートバイ 原付 自転車にも 16410006',itemPrice:3280,itemCaption:'手の甲:ポリエステル96%、スパンデックス4% 手のひら:ナイロン50%、ポリウレタン50% サイズ展開:S/M/L/XL/XXL 人差し指とスマホのスクリーンをタッチ操作できる!'},
  'beauty-roller':{itemName:'美顔ローラー 美顔器 リフトアップ 〖微弱電流〗〖防水仕様〗〖充電不要〗 小顔ローラー メンズ マイクロカレント 美顔器 ローラー 全身用 ローラー 美容グッズ',itemPrice:3980,itemCaption:''},
  'beauty-peeling':{itemName:'〖半額★スーパーSALE〗 ウォーターピーリング 美顔器 RELX リラクス 超軽量 70g 超音波 美顔器 美容グッズ ウォーターピーラー 洗顔ピーラー ピーリング 家庭用 超音波ピーリング ems イオン 美容家電',itemPrice:3490,itemCaption:''},
  'beauty-kassa':{itemName:'＼当日発送／〖楽天スーパーSALE更に5％OFFcp〗4in1美顔 かっさ プレート 小顔ケア 収納袋付き 美容グッズ 美顔器 フェイスケア 頭皮ケア 顔マッサージ 全身マッサージ',itemPrice:780,itemCaption:''},
  'pet-water':{itemName:'〖1点5%OFF,2点10%OFF〗〖楽天1位〗ペットウォーターボトル 犬グッズ ペット用品 ペット 水 水飲み ボトル 犬 ペットボトル ペット給水器 犬 グッズ 散歩 外出 ドライブ 旅行 漏れ防止 ワンタッチ 贈り物',itemPrice:1880,itemCaption:''},
  'pet-toilet':{itemName:'ユニ・チャーム デオシート しっかり超吸収 無香消臭タイプ ワイド 54枚 〖公式ショップ〗トイレタリー ペットシーツ 愛犬 室内ペット用 トイレシート 無香消臭タイプ オシッコ5回分 ワイドサイズ ペットシーツ',itemPrice:2090,itemCaption:''},
  'pet-bed':{itemName:'犬用 猫用 ふわふわ ペットベッド sippo 楽天1位 S/M/L/XL もふもふ ベット ペット用 ベッド 犬 猫 暖かい クッション 秋 冬 春 夏 オールシーズン もこもこ 全猫種 小型犬 中型犬 大型犬 パピー シニア かわいい 洗える 犬ベッド 猫ベッド 丸形',itemPrice:1650,itemCaption:''},
  'cross-humidifier':{itemName:'超音波 加湿器 4L 上から給水 静音 LEDライト',itemPrice:4980,itemCaption:''},
  'cross-kettle':{itemName:'電気ケトル 1.0L 温度調節 保温 コンパクト',itemPrice:3980,itemCaption:''},
  'cross-usb-hub':{itemName:'USBハブ Type-C 7in1 HDMI PD対応 SDカード',itemPrice:3280,itemCaption:''},
  'cross-umbrella':{itemName:'折りたたみ傘 軽量 晴雨兼用 自動開閉 コンパクト',itemPrice:2480,itemCaption:''},
  'cross-pet-water':{itemName:'ペット給水器 犬 猫 自動給水器 2L USB給電',itemPrice:2980,itemCaption:''},
  'cross-storage-wagon':{itemName:'収納ワゴン 3段 キャスター付き スリム キッチン',itemPrice:4580,itemCaption:''},
  'cross-pan':{itemName:'フライパン 26cm IH ガス火対応 食洗機対応',itemPrice:2680,itemCaption:''},
  'cross-bottle':{itemName:'水筒 500ml 保温 保冷 ステンレス ボトル',itemPrice:2180,itemCaption:''},
  'cross-pillow':{itemName:'枕 洗える 高さ調整 横向き 寝返り',itemPrice:3480,itemCaption:''},
  'cross-board':{itemName:'まな板 食洗機対応 軽量 日本製',itemPrice:1680,itemCaption:''},
  'cross-laundry-basket':{itemName:'ランドリーバスケット 洗濯かご 折りたたみ メッシュ',itemPrice:2380,itemCaption:''},
  'cross-mobile-battery':{itemName:'モバイルバッテリー 10000mAh 30W USB-C ケーブル内蔵',itemPrice:3980,itemCaption:''},
  'cross-portable-power':{itemName:'ポータブル電源 1024Wh 1500W ソーラーパネルセット',itemPrice:89800,itemCaption:''},
  'cross-tshirt':{itemName:'Tシャツ メンズ 綿100% 半袖',itemPrice:1980,itemCaption:''},
  'cross-seat-cover':{itemName:'車 シートカバー 防水 後部座席 ペット',itemPrice:3980,itemCaption:''},
  'cross-laptop-stand':{itemName:'ノートPCスタンド 折りたたみ アルミ 高さ調整',itemPrice:2980,itemCaption:''},
  'cross-rug':{itemName:'ラグ 185×185cm 洗える 滑り止め',itemPrice:5980,itemCaption:''}
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
(function(root){
  'use strict';
  if(!root || !root.UrenaviPainCopy) return;

  const api=root.UrenaviPainCopy;
  const fmt=n=>new Intl.NumberFormat('ja-JP').format(+n||0);
  const norm=s=>String(s||'').normalize('NFKC').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();

  function titleOnly(item){
    return norm(item?.itemName||'');
  }

  function titleText(item){
    return titleOnly(item);
  }

  function detailText(item){
    return [item?.catchcopy,item?.itemCaption,item?.genrePath,item?.genreName].filter(Boolean).map(norm).join(' ');
  }

  function sourceText(item){
    return [titleOnly(item),detailText(item)].filter(Boolean).join(' ');
  }

  function stableVariant(text,mod=10){
    const s=String(text||'');
    let h=2166136261;
    for(let i=0;i<s.length;i++) h=Math.imul(h^s.charCodeAt(i),16777619)>>>0;
    return h%mod;
  }

  function uniquePush(out,value){
    const v=norm(value);
    if(v && !out.includes(v)) out.push(v);
  }

  function isSensitiveCategory(text){
    return /サプリ|健康食品|化粧品|美容|スキンケア|育毛|発毛|医薬|薬用|衛生|除菌|抗菌|ダイエット|痩身|美白|シミ|しわ|シワ|ニキビ|口臭|歯周|血圧|血糖|コレステロール|睡眠|疲労/.test(text);
  }

  const bannedOutput=[
    /絶対/g,/必ず/g,/確実に/g,/No\.?\s*1/gi,/ナンバーワン/g,/一番/g,/最高/g,/最強/g,
    /治る|治します|治療する/g,/若返る|若返り/g,/痩せる|痩身効果/g,/病気を防ぐ|予防する/g
  ];

  function sanitizeOutput(text){
    let s=String(text||'');
    s=s.replace(/治る|治します|治療する/g,'ケアをサポートする')
      .replace(/若返る|若返り/g,'年齢に応じたケアを意識しやすい')
      .replace(/痩せる|痩身効果/g,'健康的な生活を意識するきっかけになりそう')
      .replace(/病気を防ぐ|予防する/g,'日常のケアに取り入れやすそう')
      .replace(/改善する|改善します/g,'整える助けになりそう')
      .replace(/解消する|解消します/g,'負担を減らす助けになりそう')
      .replace(/絶対|必ず|確実に/g,'')
      .replace(/No\.?\s*1|ナンバーワン|一番|最高|最強/gi,'');
    return s.replace(/\s+/g,' ').replace(/。。+/g,'。').trim();
  }

  const CLASSIFICATION_IGNORE_PHRASES=[
    'ペットボトル用',
    'ペットボトル',
    '猫背矯正',
    '猫背'
  ];

  const GENERIC_USAGE_WORDS=[
    'ペット用品','掃除便利グッズ','便利グッズ','生活雑貨','日用品','おすすめ','人気','ランキング','楽天','公式'
  ];

  const SUFFIX_EXCLUSION_TERMS=[
    'モバイルバッテリー','充電','収納','ケース','バッグ','ブラシ','ローラー'
  ];

  const CLASSIFICATION_RULES=[
    {phrases:['モバイルバッテリー用ケース','モバイルバッテリーケース'],category:'accessory',usage:'mobile_battery_case',priority:140},
    {phrases:['収納付きベッド','収納付ベッド','収納ベッド'],category:'furniture',usage:'storage_bed',priority:140},
    {phrases:['ペット用毛取りグローブ','毛取りグローブ','グルーミング手袋'],category:'pet',usage:'grooming',priority:140},
    {phrases:['ペットウォーターボトル','ペット用ウォーターボトル','ペット給水器','給水ボトル','水飲みボトル'],category:'pet',usage:'water',priority:135},
    {phrases:['ペットシート','トイレシート','デオシート'],category:'pet',usage:'toilet',priority:135},
    {phrases:['ペットベッド','犬用ベッド','猫用ベッド','猫ベッド','犬ベッド'],category:'pet',usage:'bed',priority:135},
    {phrases:['ペットの毛 掃除ブラシ','ペットの毛用掃除ブラシ','抜け毛掃除ブラシ'],category:'cleaning',usage:'pet_hair',priority:130},
    {phrases:['充電式ハンディクリーナー','ハンディクリーナー','コードレス掃除機','ハンディ掃除機'],category:'cleaning',usage:'vacuum',priority:130},
    {phrases:['ウォーターピーリング','ウォーターピーラー','洗顔ピーラー'],category:'beauty',usage:'face_peeling',priority:130},
    {phrases:['美顔ローラー','小顔ローラー','フェイスローラー'],category:'beauty',usage:'face_roller',priority:130},
    {phrases:['4in1美顔','かっさプレート','美顔かっさ','カッサプレート'],category:'beauty',usage:'kassa',priority:130},
    {phrases:['モバイルバッテリー'],category:'charging',usage:'mobile_battery',priority:125},
    {phrases:['収納ボックス'],category:'storage',usage:'storage_box',priority:125},
    {phrases:['収納ケース','衣装ケース'],category:'storage',usage:'storage_case',priority:120},
    {phrases:['網戸','あみ戸','アミ戸'],category:'cleaning',usage:'window_screen',priority:135},
    {phrases:['お掃除 手袋','掃除 手袋','お掃除手袋','掃除手袋'],category:'cleaning',usage:'glove',priority:135},
    {phrases:['お掃除クロス','掃除クロス'],category:'cleaning',usage:'cloth',priority:116},
    {phrases:['ハンディモップ','モップ'],category:'cleaning',usage:'mop',priority:100},
    {phrases:['掃除ブラシ'],category:'cleaning',usage:'brush',priority:100},
    {phrases:['抜け毛','毛取り','毛とり','グルーミング'],category:'pet',usage:'grooming',priority:100},
    {phrases:['給水器','水飲み'],category:'pet',usage:'water',priority:95},
    {phrases:['ピーラー'],category:'cooking',usage:'peeler',priority:50},
    {phrases:['充電器'],category:'charging',usage:'charger',priority:50},
    {phrases:['収納'],category:'storage',usage:'generic_storage',priority:40},
    {phrases:['ブラシ'],category:'cleaning',usage:'brush',priority:40},
    {phrases:['クロス'],category:'cleaning',usage:'cloth',priority:40},
    {phrases:['手袋','グローブ'],category:'cleaning',usage:'glove',priority:40}
  ];

  const SUPPORTED_USAGES=new Set([
    'cleaning.window_screen','cleaning.glove','cleaning.cloth','cleaning.mop','cleaning.brush',
    'storage.storage_box','storage.storage_case','charging.mobile_battery','pet.grooming'
  ]);

  function buildClassificationTitle(itemName){
    let s=norm(itemName);
    for(const phrase of CLASSIFICATION_IGNORE_PHRASES) s=s.split(phrase).join(' ');
    const terms=[...SUFFIX_EXCLUSION_TERMS].sort((a,b)=>b.length-a.length);
    for(const term of terms){
      const escaped=term.replace(/[.*+?^$()|[\]\\]/g,'\\$&');
      s=s.replace(new RegExp(escaped+'(?:不要|なし|無し|付属|付き|付)','gi'),' ');
    }
    for(const word of GENERIC_USAGE_WORDS) s=s.split(word).join(' ');
    return norm(s);
  }

  function collectClassificationCandidates(itemName){
    const title=buildClassificationTitle(itemName);
    const out=[];
    const accessoryMatch=title.match(/モバイルバッテリー用.{0,20}(?:ケース|ポーチ)/i);
    if(accessoryMatch){
      out.push({category:'accessory',usage:'mobile_battery_case',phrase:accessoryMatch[0],priority:145,score:145+Math.min(18,accessoryMatch[0].length),pos:accessoryMatch.index||0});
    }
    for(const rule of CLASSIFICATION_RULES){
      for(const phrase of rule.phrases){
        const pos=title.toLowerCase().indexOf(String(phrase).toLowerCase());
        if(pos<0) continue;
        out.push({category:rule.category,usage:rule.usage,phrase,priority:rule.priority,score:rule.priority+Math.min(18,phrase.length),pos});
      }
    }
    const best=new Map();
    for(const x of out){
      const key=x.category+'.'+x.usage;
      const prev=best.get(key);
      if(!prev || x.score>prev.score || (x.score===prev.score && x.phrase.length>prev.phrase.length)) best.set(key,x);
    }
    return [...best.values()].sort((a,b)=>b.score-a.score||b.phrase.length-a.phrase.length||a.pos-b.pos);
  }

  function resolveCategoryAndUsage(itemName){
    const candidates=collectClassificationCandidates(itemName);
    if(!candidates.length) return {category:'unknown',usage:'unknown',kind:'ambiguous',confidence:'ambiguous',ambiguous:true,candidates:[],reason:'no_candidate'};
    const top=candidates[0];
    const second=candidates.find(x=>x.category!==top.category || x.usage!==top.usage);
    if(second && (top.score-second.score)<20){
      return {category:'ambiguous',usage:'ambiguous',kind:'ambiguous',confidence:'ambiguous',ambiguous:true,candidates,reason:'close_candidates'};
    }
    return {category:top.category,usage:top.usage,kind:top.category,confidence:'title',ambiguous:false,candidates,reason:'resolved',matchedPhrase:top.phrase,score:top.score};
  }

  const STRONG_CONFLICT_RULES=CLASSIFICATION_RULES.filter(x=>x.priority>=120);

  function detectConflictingSignals(itemName,chosenCategory,chosenUsage){
    const title=norm(itemName);
    const conflicts=[];
    for(const rule of STRONG_CONFLICT_RULES){
      const signature=rule.category+'.'+rule.usage;
      if(signature===chosenCategory+'.'+chosenUsage) continue;
      for(const phrase of rule.phrases){
        if(title.toLowerCase().includes(String(phrase).toLowerCase())){
          conflicts.push({category:rule.category,usage:rule.usage,phrase});
          break;
        }
      }
    }
    return conflicts;
  }

  function classificationCopyFields(cls){
    const key=cls.category+'.'+cls.usage;
    const map={
      'pet.grooming':{problem:'ペットの抜け毛を手早く集めたい',use:'抜け毛のお手入れに使う',impact:'日々の毛取りを手軽に続ける助けになりそう',audience:'犬や猫の抜け毛ケアを手軽にしたい人'},
      'cleaning.window_screen':{problem:'網戸の汚れを手早く掃除したい',use:'網戸掃除に使う',impact:'網戸掃除のひと手間を減らす助けになりそう',audience:'網戸の掃除を手早く済ませたい人'},
      'cleaning.glove':{problem:'細かい場所を手早く拭きたい',use:'手にはめて掃除に使う',impact:'細かな場所の拭き掃除を進めやすくなりそう',audience:'手にはめて細かい場所を拭きたい人'},
      'cleaning.cloth':{problem:'ホコリや水分を手早く拭き取りたい',use:'クロスで拭き掃除に使う',impact:'日々の拭き掃除を進めやすくなりそう',audience:'クロスでホコリや水分を手早く拭き取りたい人'},
      'cleaning.mop':{problem:'気になる場所を手早く掃除したい',use:'モップで掃除に使う',impact:'掃除へ取りかかる手間を減らす助けになりそう',audience:'モップで気になる場所を手早く掃除したい人'},
      'cleaning.brush':{problem:'細かい汚れをブラシで掃除したい',use:'ブラシで掃除に使う',impact:'細かな場所の掃除を進めやすくなりそう',audience:'ブラシで細かい汚れを掃除したい人'},
      'storage.storage_box':{problem:'物の置き場所を整えたい',use:'収納ボックスとして使う',impact:'物をまとめて片づける助けになりそう',audience:'収納ボックスで物をまとめたい人'},
      'storage.storage_case':{problem:'物をケースにまとめて整理したい',use:'収納ケースとして使う',impact:'出し入れや整理をしやすくする助けになりそう',audience:'収納ケースで物を整理したい人'},
      'charging.mobile_battery':{problem:'スマホなどの充電切れに備えたい',use:'モバイルバッテリーとして充電に使う',impact:'必要なときに充電できる備えになりそう',audience:'外出時などの充電切れに備えたい人'}
    };
    return map[key]||{problem:'',use:'',impact:'',audience:''};
  }

  function classify(item){
    const base=resolveCategoryAndUsage(titleOnly(item));
    const fields=classificationCopyFields(base);
    return {...base,...fields,supported:SUPPORTED_USAGES.has(base.category+'.'+base.usage)};
  }

  function titleSignals(item){
    const result=resolveCategoryAndUsage(titleOnly(item));
    return result.ambiguous?[]:[result.usage,result.category].filter(Boolean);
  }

  function extractFacts(item,kind){
    // Features come from itemName only. No catchcopy/caption/genre keyword extraction.
    const t=titleOnly(item);
    const facts=[];
    const add=x=>uniquePush(facts,x);
    const byKind={
      cleaning:[
        [/取替式|取り替え式|取替え式/,'取替式'],
        [/使い捨て/,'使い捨てタイプ'],
        [/伸縮/,'伸縮タイプ'],
        [/ロング/,'ロングタイプ'],
        [/網戸|あみ戸|アミ戸/,'網戸掃除向け'],
        [/手袋|グローブ|ミトン/,'手にはめて使うタイプ'],
        [/マイクロファイバー/,'マイクロファイバー'],
        [/吸水/,'吸水タイプ'],
        [/速乾/,'速乾タイプ'],
        [/モップ/,'モップタイプ'],
        [/ブラシ/,'ブラシタイプ'],
        [/クロス/,'クロスタイプ']
      ],
      pet:[
        [/両面/,'両面タイプ'],
        [/グローブ|手袋/,'手にはめて使うタイプ'],
        [/抜け毛|毛取り|毛とり/,'抜け毛・毛取り用途'],
        [/猫犬兼用|犬猫兼用|猫.*犬|犬.*猫/,'犬・猫向け表記あり']
      ],
      storage:[
        [/圧縮袋/,'圧縮袋タイプ'],
        [/折りたたみ|折畳/,'折りたたみ対応'],
        [/省スペース|スリム/,'省スペース設計']
      ],
      charging:[
        [/急速充電/,'急速充電対応'],
        [/Type-?C|USB-?C/i,'USB-C対応'],
        [/ワイヤレス充電/,'ワイヤレス充電対応']
      ],
      drinkware:[
        [/保温/,'保温表記あり'],
        [/保冷/,'保冷表記あり'],
        [/炭酸/,'炭酸対応表記あり']
      ],
      cooking:[
        [/食洗機対応|食器洗い乾燥機対応/,'食洗機対応表記あり'],
        [/電子レンジ対応|レンジ対応/,'電子レンジ対応表記あり'],
        [/冷凍対応/,'冷凍対応表記あり']
      ],
      laundry:[
        [/洗濯機(?:で)?洗える|洗濯機対応/,'洗濯機対応表記あり'],
        [/速乾/,'速乾タイプ']
      ]
    };
    const distinctTitleFacts=[
      [/取替式|取り替え式|取替え式/,'取替式'],
      [/両面/,'両面タイプ'],
      [/折りたたみ|折畳/,'折りたたみ対応'],
      [/伸縮/,'伸縮タイプ'],
      [/防水/,'防水表記あり'],
      [/撥水/,'撥水表記あり'],
      [/コードレス/,'コードレスタイプ'],
      [/コンパクト/,'コンパクト表記あり'],
      [/薄型|スリム/,'薄型・スリム表記あり']
    ];
    for(const [re,label] of distinctTitleFacts) if(re.test(t)) add(label);
    for(const [re,label] of (byKind[kind]||[])) if(re.test(t)) add(label);
    const pack=t.match(/(?:^|[^\d,])(\d{1,3})\s*(枚|個|本|袋|組)\s*(セット|入り)(?!\s*(?:突破|達成))/);
    if(pack && +pack[1]>1) add(pack[1]+pack[2]+pack[3]);
    const usage=primaryUsageWord(item);
    let filtered=facts.filter(x=>{
      if(usage==='網戸' && /網戸掃除向け/.test(x)) return false;
      if(usage==='抜け毛' && /抜け毛・毛取り用途/.test(x)) return false;
      if(usage==='手袋' && /手にはめて使うタイプ|クロスタイプ/.test(x)) return false;
      if(usage==='クロス' && /クロスタイプ/.test(x)) return false;
      return true;
    });
    return filtered.slice(0,4);
  }

  function primaryUsageWord(item){
    const r=resolveCategoryAndUsage(titleOnly(item));
    const map={grooming:'抜け毛',window_screen:'網戸',glove:'手袋',cloth:'クロス',mop:'モップ',brush:'ブラシ',storage_box:'収納ボックス',storage_case:'収納ケース',mobile_battery:'モバイルバッテリー'};
    return map[r.usage]||'';
  }

  function usagePhrase(item,kind){
    const r=resolveCategoryAndUsage(titleOnly(item));
    const map={grooming:'抜け毛のお手入れ',window_screen:'網戸掃除',glove:'手袋タイプの掃除',cloth:'クロスでの拭き掃除',mop:'モップでの掃除',brush:'ブラシでの掃除',storage_box:'収納ボックスでの整理',storage_case:'収納ケースでの整理',mobile_battery:'モバイルバッテリーでの充電'};
    return map[r.usage]||'この商品の使用';
  }

  function audienceFor(item,kind){
    const r=classify(item);
    return r.audience||'';
  }

  const CLAIM_RISK_RULES=[
    /小顔(?:効果)?/g,/リフトアップ/g,/痩せる|痩身/g,/若返る|若返り/g,/改善/g,/治る|治療/g,/美白/g,
    /除菌/g,/殺菌/g,/抗菌/g,/消臭/g,/防臭/g,/予防/g,/効果/g,/効能/g,
    /No\.?\s*1/gi,/ナンバーワン/g,/一番/g,/最高/g,/最強/g,/絶対/g,/必ず/g
  ];

  const PROMO_RISK_RULES=[
    /楽天(?:市場)?(?:ランキング)?\s*1位/g,/楽天1位/g,/ランキング\s*1位/g,/\d+冠/g,
    /半額/g,/(?:スーパー)?SALE/gi,/セール/g,/クーポン(?:利用)?/g,
    /最安\d*円?/g,/\d+(?:\.\d+)?\s*%\s*(?:OFF|オフ)/gi
  ];

  function collectRiskTerms(title,rules){
    const matches=[];
    for(const re of rules){
      re.lastIndex=0;
      const m=title.match(re);
      if(m) for(const x of m) uniquePush(matches,x);
    }
    return matches;
  }

  function detectLegalRisk(itemName){
    const title=titleOnly({itemName});
    const claimRiskTerms=collectRiskTerms(title,CLAIM_RISK_RULES);
    const promoRiskTerms=collectRiskTerms(title,PROMO_RISK_RULES);
    const claimRisk=claimRiskTerms.length>0;
    const promoRisk=promoRiskTerms.length>0;
    return {
      legalRisk:claimRisk||promoRisk,
      claimRisk,
      promoRisk,
      warningRisk:claimRisk,
      claimRiskTerms,
      promoRiskTerms,
      riskTerms:[...claimRiskTerms,...promoRiskTerms]
    };
  }

  function isPromoText(text){
    return /OFF|オフ|半額|SALE|セール|クーポン|最安|限定|ポイント|楽天\s*1位|楽天1位|ランキング\s*1位|ランキング1位|\d+冠|送料無料|公式ショップ|公式|正規品/i.test(String(text||''));
  }

  function stripPromotionalText(itemName){
    let s=titleOnly({itemName});
    s=s
      .replace(/【([^】]{0,100})】/g,(m,x)=>isPromoText(x)?' ':m)
      .replace(/〖([^〗]{0,100})〗/g,(m,x)=>isPromoText(x)?' ':m)
      .replace(/\[([^\]]{0,100})\]/g,(m,x)=>isPromoText(x)?' ':m)
      .replace(/［([^］]{0,100})］/g,(m,x)=>isPromoText(x)?' ':m)
      .replace(/＼?当日発送／?/g,' ')
      .replace(/楽天(?:市場)?(?:ランキング)?\s*1位(?:\d+冠)?/g,' ')
      .replace(/楽天1位(?:\d+冠)?/g,' ')
      .replace(/ランキング\s*1位/g,' ')
      .replace(/\d+冠/g,' ')
      .replace(/(?:スーパー)?SALE|セール|半額|クーポン(?:利用)?|最安\d*円?|\d+(?:\.\d+)?\s*%\s*(?:OFF|オフ)/gi,' ')
      .replace(/\s+/g,' ')
      .trim();
    return s;
  }

  function safeUsageName(category,usage){
    const map={
      'beauty.face_roller':'美顔ローラー',
      'beauty.face_peeling':'ウォーターピーリング美顔器',
      'beauty.kassa':'かっさプレート',
      'pet.water':'ペット用給水用品',
      'pet.toilet':'ペットシート',
      'pet.bed':'ペットベッド',
      'pet.grooming':'ペット用毛取りグローブ',
      'charging.mobile_battery':'モバイルバッテリー',
      'cleaning.window_screen':'網戸掃除用品',
      'cleaning.glove':'掃除用手袋',
      'cleaning.cloth':'掃除用クロス',
      'cleaning.mop':'掃除用モップ',
      'cleaning.brush':'掃除用ブラシ',
      'storage.storage_box':'収納ボックス',
      'storage.storage_case':'収納ケース',
      'accessory.mobile_battery_case':'モバイルバッテリー用ケース',
      'cleaning.vacuum':'ハンディクリーナー',
      'furniture.storage_bed':'収納付きベッド'
    };
    return map[category+'.'+usage]||'商品';
  }

  function buildSafeDisplayName(item,analysis){
    const a=analysis||analyze(item);
    if(a.claimRisk) return safeUsageName(a.category,a.usage);
    let s=stripPromotionalText(item?.itemName||'');
    s=finalScan(s);
    const visibleLength=s.replace(/[^\p{L}\p{N}]/gu,'').length;
    if(!s || visibleLength<4) s=safeUsageName(a.category,a.usage);
    if(s.length>48) s=s.slice(0,48).trim()+'…';
    return s;
  }

  function openingFor(a,item,variant=0){
    const lead=usagePhrase(item,a.kind);
    const idx=((Number(variant)||0)%10+10)%10;
    const first=[
      `${lead}を、できるだけ手早く済ませたいときに。`,
      `${lead}にかかる小さな手間を減らしたい人に。`,
      `${lead}の準備や作業を少しでも簡単にしたいときに。`,
      `${lead}を後回しにせず、こまめに済ませたい人向け。`,
      `${lead}にかかる手間が気になるなら、候補に入れやすい商品です。`,
      `${lead}をもっと手軽にしたいときにチェックしたい商品です。`,
      `${lead}を短く済ませたい場面に向いていそうです。`,
      `${lead}の動作を少し軽くしたい人に。`,
      `${lead}を手早く済ませたいときの選択肢になりそうです。`,
      `${lead}をシンプルにしたい人が検討しやすい商品です。`
    ][idx];

    const charging=[
      '必要なときに充電できる備えがあると、電池残量を気にする場面を減らしやすそうです。',
      '持ち歩ける電源を用意しておくと、充電できる場所を探す手間を減らせそうです。',
      '充電手段を手元に用意しておくことで、電池切れへの備えをしやすくなりそうです。',
      '必要な場面で充電しやすくなり、外出時の電池残量への不安を減らす助けになりそうです。',
      'コンセントがすぐ見つからない場面でも、充電手段を確保しやすくなりそうです。',
      'スマホなどの電池残量が少ないときの備えとして使いやすそうです。',
      '充電できる選択肢を増やしておくことで、移動中の電池切れ対策になりそうです。',
      '必要なときに電源を補えるようにしておくと、充電切れを避けやすくなりそうです。',
      '予備の充電手段を用意しておけば、外出先でも機器を使い続けやすくなりそうです。',
      '充電の選択肢を増やすことで、電池残量を気にする時間を減らせそうです。'
    ];
    const generic=[
      `${lead}を日常の流れに取り入れやすく、作業を始めるまでの手間を抑えやすそうです。`,
      `${lead}をこまめに行いやすく、後回しにしにくくなりそうです。`,
      `${lead}を必要な場所ですぐ始めやすく、短時間で済ませる助けになりそうです。`,
      `${lead}の動作を増やしすぎず、日々の負担を軽くする選択肢になりそうです。`,
      `${lead}を気づいたときに行いやすく、手間をため込みにくくなりそうです。`,
      `${lead}を普段の流れに組み込みやすく、作業のハードルを下げやすそうです。`,
      `${lead}の工程をシンプルにしやすく、取りかかるまでの時間を短くできそうです。`,
      `${lead}を必要なときに始めやすく、日常の小さな負担を減らす助けになりそうです。`,
      `${lead}を手早く進めやすく、別の作業に時間を回しやすくなりそうです。`,
      `${lead}を進めやすくし、日々の作業を軽くするきっかけになりそうです。`
    ];
    const second=a.category==='charging'&&a.usage==='mobile_battery'?charging[idx]:generic[idx];
    return first+'\n'+second;
  }

  function shortFallback(item,withDisclosure=false,analysis=null){
    const a=analysis||analyze(item);
    const title=buildSafeDisplayName(item,a);
    return `${title}\n価格：${fmt(item?.itemPrice||0)}円`+(withDisclosure?'\n\n※アフィリエイト広告を利用しています':'');
  }

  function hasCategoryConflict(kind,facts){
    const joined=facts.join(' ');
    if(['pet','cleaning'].includes(kind) && /急速充電|USB-C|ワイヤレス充電/.test(joined)) return true;
    if(kind==='charging' && /網戸|抜け毛|クロス|モップ/.test(joined)) return true;
    if(kind==='pet' && /収納|圧縮袋|食洗機|電子レンジ/.test(joined)) return true;
    return false;
  }

  function validateBody(item,a,text){
    if(a.ambiguous || a.confidence==='ambiguous' || !a.supported) return false;
    if(hasCategoryConflict(a.kind,a.facts)) return false;
    const conflicts=detectConflictingSignals(titleOnly(item),a.category,a.usage);
    if(conflicts.length) return false;
    const usage=primaryUsageWord(item);
    if(usage && !String(text).includes(usage)) return false;
    return true;
  }

  function finalScan(text){
    let s=String(text||'');
    for(const re of bannedOutput){
      re.lastIndex=0;
      s=s.replace(re,'');
    }
    s=s
      .replace(/治る|治します|治療する/g,'ケアをサポートする')
      .replace(/若返る|若返り/g,'年齢に応じたケアを意識しやすい')
      .replace(/痩せる|痩身効果/g,'健康的な生活を意識するきっかけになりそう')
      .replace(/病気を防ぐ|予防する/g,'日常のケアに取り入れやすそう')
      .replace(/改善する|改善します/g,'整える助けになりそう')
      .replace(/解消する|解消します/g,'負担を減らす助けになりそう');
    return s.split('\n').map(x=>x.replace(/[ \t]+/g,' ').trimEnd()).join('\n').trim();
  }

  function analyze(item){
    const cls=classify(item);
    const facts=extractFacts(item,cls.kind);
    const source=sourceText(item);
    const sensitive=isSensitiveCategory(source);
    const legal=detectLegalRisk(titleOnly(item));
    const conflicts=cls.ambiguous?[]:detectConflictingSignals(titleOnly(item),cls.category,cls.usage);
    const supported=!!cls.supported && !cls.ambiguous && conflicts.length===0;
    return {
      source,
      kind:cls.kind,
      category:cls.category,
      usage:cls.usage,
      confidence:cls.confidence,
      ambiguous:!!cls.ambiguous,
      ambiguityReason:cls.reason||'',
      candidates:cls.candidates||[],
      conflicts,
      supported,
      outputMode:supported?'full':'fallback',
      problem:sanitizeOutput(cls.problem),
      use:sanitizeOutput(cls.use),
      impact:sanitizeOutput(cls.impact),
      audience:sanitizeOutput(cls.audience),
      facts,
      sensitive,
      legalRisk:legal.legalRisk,
      claimRisk:legal.claimRisk,
      promoRisk:legal.promoRisk,
      warningRisk:legal.warningRisk,
      claimRiskTerms:legal.claimRiskTerms,
      promoRiskTerms:legal.promoRiskTerms,
      riskTerms:legal.riskTerms
    };
  }

  function trimCopy(text,max=500){
    const s=String(text||'').trim();
    if(s.length<=max) return s;
    return s.slice(0,max-1).replace(/[、,\s]+$/,'')+'…';
  }

  function makeRoomCopy(item,keyword,options={}){
    const a=analyze(item);
    if(a.ambiguous || !a.supported) return shortFallback(item,true,a);

    const title=buildSafeDisplayName(item,a);
    const variant=Number.isFinite(+options.variant)?+options.variant:stableVariant(item?.itemName||'',10);
    const opening=openingFor(a,item,variant);
    const facts=a.facts.length ? '\n\n商品の特徴👇\n'+a.facts.map(x=>'✔ '+x).join('\n') : '';
    const audience='\n\nこんな人に向いていそう👇\n・'+a.audience;
    const ending='\n\n'+title+'\n価格：'+fmt(item?.itemPrice||0)+'円\n\n※アフィリエイト広告を利用しています';
    let out=trimCopy(opening+facts+audience+ending,500);
    out=finalScan(out);
    if(!validateBody(item,a,out)) return shortFallback(item,true,a);
    return out;
  }

  function makeThreadsCopy(item,keyword,options={}){
    const a=analyze(item);
    if(a.ambiguous || !a.supported) return shortFallback(item,false,a);
    const title=buildSafeDisplayName(item,a);
    const variant=Number.isFinite(+options.variant)?+options.variant:stableVariant(item?.itemName||'',10);
    let out=openingFor(a,item,variant);
    if(a.facts[0]) out+='\n✔ '+a.facts[0];
    out+='\n\n'+title+'\n'+fmt(item?.itemPrice||0)+'円';
    out=finalScan(trimCopy(out,360));
    return validateBody(item,a,out)?out:shortFallback(item);
  }

  function makeInstagramCopy(item,keyword,options={}){
    const a=analyze(item);
    if(a.ambiguous || !a.supported) return shortFallback(item,false,a);
    const title=buildSafeDisplayName(item,a);
    const variant=Number.isFinite(+options.variant)?+options.variant:stableVariant(item?.itemName||'',10);
    let out=openingFor(a,item,variant);
    if(a.facts.length) out+='\n\n'+a.facts.map(x=>'✔ '+x).join('\n');
    out+='\n\nこんな人に向いていそう👇\n'+a.audience+'\n\n'+title+'\n価格：'+fmt(item?.itemPrice||0)+'円';
    out=finalScan(trimCopy(out,500));
    return validateBody(item,a,out)?out:shortFallback(item);
  }


  api.detectLegalRisk=detectLegalRisk;
  api.buildSafeDisplayName=buildSafeDisplayName;
  api.stripPromotionalText=stripPromotionalText;
  api.extractSafeFeatures=extractFacts;
  api.buildClassificationTitle=buildClassificationTitle;
  api.collectClassificationCandidates=collectClassificationCandidates;
  api.resolveCategoryAndUsage=resolveCategoryAndUsage;
  api.detectConflictingSignals=detectConflictingSignals;
  api.analyzeRoomProduct=analyze;
  api.makeRoomCopy=makeRoomCopy;
  api.makeThreadsCopy=makeThreadsCopy;
  api.makeInstagramCopy=makeInstagramCopy;
})(typeof window==='undefined'?null:window);

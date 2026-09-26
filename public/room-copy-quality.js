(function(root){
  'use strict';
  if(!root || !root.UrenaviPainCopy) return;

  const api=root.UrenaviPainCopy;
  if(!root.UrenaviProductShadowV2 && typeof require==='function'){
    try{ require('./product-shadow-v2.js'); }catch(_){}
  }
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
    {phrases:['モップハンガー','モップホルダー','モップスタンド','モップ掛け','モップラック'],category:'storage',usage:'cleaning_tool_holder',priority:150},
    {phrases:['モバイルバッテリー用ケース','モバイルバッテリーケース','Power Bank Case','PowerBank Case','Power Bank ケース','PowerBank ケース','Power Bank ポーチ','PowerBank ポーチ','Power Bank カバー','PowerBank カバー','パワーバンクケース','パワーバンク ケース','パワーバンク ポーチ','パワーバンク カバー'],category:'accessory',usage:'mobile_battery_case',priority:145},
    {phrases:['収納付きベッド','収納付ベッド','収納ベッド'],category:'furniture',usage:'storage_bed',priority:140},
    {phrases:['ペット用毛取りグローブ','毛取りグローブ','グルーミング手袋'],category:'pet',usage:'grooming',priority:140},
    {phrases:['ペットウォーターボトル','ペット用ウォーターボトル','ペット給水器','給水ボトル','水飲みボトル'],category:'pet',usage:'water',priority:135},
    {phrases:['ウェットティッシュ','ウェットシート','おしりふき','からだふき','体ふき','手足ふき'],category:'pet',usage:'hygiene_wipe',priority:138},
    {phrases:['ペットシート','トイレシート','デオシート'],category:'pet',usage:'toilet',priority:135},
    {phrases:['ドライブベッドキャリー','コーデュラドライブベッド','ドライブベッド','ドライブボックス','車用ベッド'],category:'pet',usage:'drive_bed',priority:146},
    {phrases:['ペットベッド','犬用ベッド','猫用ベッド','猫ベッド','犬ベッド'],category:'pet',usage:'bed',priority:135},
    {phrases:['ペットの毛 掃除ブラシ','ペットの毛用掃除ブラシ','抜け毛掃除ブラシ'],category:'cleaning',usage:'pet_hair',priority:130},
    {phrases:['充電式ハンディクリーナー','ハンディクリーナー','ハンディークリーナー','コードレス掃除機','ハンディ掃除機','小型掃除機'],category:'cleaning',usage:'vacuum',priority:130},
    {phrases:['ブラジャー用洗濯ネット','シャツ用洗濯ネット','洗濯ネット','ランドリーネット'],category:'laundry',usage:'washing_net',priority:132},
    {phrases:['ポータブル電源'],category:'charging',usage:'portable_power',priority:136},
    {phrases:['ウォーターピーリング','ウォーターピーラー','洗顔ピーラー'],category:'beauty',usage:'face_peeling',priority:130},
    {phrases:['美顔ローラー','小顔ローラー','フェイスローラー'],category:'beauty',usage:'face_roller',priority:130},
    {phrases:['4in1美顔','かっさプレート','美顔かっさ','カッサプレート'],category:'beauty',usage:'kassa',priority:130},
    {phrases:['モバイルバッテリー'],category:'charging',usage:'mobile_battery',priority:125},
    {phrases:['Power Bank','PowerBank','パワーバンク'],category:'charging',usage:'mobile_battery',priority:112},
    {phrases:['収納ボックス'],category:'storage',usage:'storage_box',priority:125},
    {phrases:['収納ケース','衣装ケース'],category:'storage',usage:'storage_case',priority:120},
    {phrases:['電動モップ','回転モップクリーナー','電動フロアワイパー','フロアモップ'],category:'cleaning',usage:'mop',priority:138},
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
    'storage.storage_box','storage.storage_case','charging.mobile_battery','charging.portable_power',
    'laundry.washing_net','pet.grooming','pet.bed','pet.drive_bed','cleaning.vacuum'
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

  const GENERIC_SEARCH_HINTS=new Set(['掃除用具','掃除用品','ペット用品','便利グッズ','生活雑貨','日用品','収納','掃除','ペット']);
  function normalizedSearchHint(keyword){
    const hint=norm(keyword);
    if(!hint) return '';
    const compact=hint.replace(/\s+/g,'');
    if(GENERIC_SEARCH_HINTS.has(hint)||GENERIC_SEARCH_HINTS.has(compact)) return '';
    return hint;
  }
  function candidateRankScore(candidate,title){
    const len=Math.max(1,String(title||'').length);
    const ratio=(candidate.pos||0)/len;
    let adjustment=0;
    if((candidate.pos||0)<=24 || ratio<=0.20) adjustment+=26;
    else if(ratio>=0.45) adjustment-=20;
    return candidate.score+adjustment;
  }
  function collectClassificationCandidates(itemName,keyword=''){
    const title=buildClassificationTitle(itemName);
    const hint=normalizedSearchHint(keyword);
    const out=[];
    const accessoryMatch=title.match(/(?:モバイルバッテリー|Power\s*Bank|PowerBank|パワーバンク)(?:用)?[^\n]{0,20}(?:ケース|ポーチ|カバー|保護)/i);
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
    const ranked=[...best.values()].map(x=>({...x,rankScore:candidateRankScore(x,title),searchHintMatch:!!(hint&&hint.toLowerCase().includes(String(x.phrase).toLowerCase()))}));
    ranked.sort((a,b)=>b.rankScore-a.rankScore||b.score-a.score||b.phrase.length-a.phrase.length||a.pos-b.pos);
    if(ranked.length>1 && hint){
      const a=ranked[0],b=ranked[1];
      if(Math.abs(a.rankScore-b.rankScore)<=4 && a.searchHintMatch!==b.searchHintMatch){
        ranked.sort((x,y)=>(Number(y.searchHintMatch)-Number(x.searchHintMatch))||y.rankScore-x.rankScore||y.score-x.score||x.pos-y.pos);
      }
    }
    return ranked;
  }

  function classificationFamily(candidate){
    if(!candidate) return '';
    if(candidate.category==='storage' && ['storage_box','storage_case','generic_storage'].includes(candidate.usage)) return 'storage.container';
    if(candidate.category==='pet' && ['bed','drive_bed'].includes(candidate.usage)) return 'pet.sleep';
    return candidate.category+'.'+candidate.usage;
  }

  function chooseMostSpecificSameFamily(candidates,family){
    const same=(candidates||[]).filter(x=>classificationFamily(x)===family);
    if(!same.length) return null;
    return [...same].sort((a,b)=>b.phrase.length-a.phrase.length||b.priority-a.priority||a.pos-b.pos)[0];
  }

  const EARLY_PRODUCT_NOUN_RULES=[
    {phrases:['収納ボックス','収納ケース'],family:'storage.container'},
    {phrases:['ランドリーバスケット','洗濯かご','ランドリーボックス'],family:'laundry.basket'},
    {phrases:['ごみ箱','ゴミ箱','ダストボックス'],family:'trash.bin'}
  ];
  function earlyProductNounSignals(itemName){
    const title=buildClassificationTitle(itemName);
    const cutoff=Math.max(36,Math.ceil(title.length*0.40));
    const signals=[];
    for(const rule of EARLY_PRODUCT_NOUN_RULES){
      for(const phrase of rule.phrases){
        const pos=title.indexOf(phrase);
        if(pos<0||pos>=cutoff) continue;
        signals.push({phrase,family:rule.family,pos});
      }
    }
    const bestByFamily=new Map();
    for(const x of signals){
      const prev=bestByFamily.get(x.family);
      if(!prev||x.pos<prev.pos||(x.pos===prev.pos&&x.phrase.length>prev.phrase.length)) bestByFamily.set(x.family,x);
    }
    return [...bestByFamily.values()].sort((a,b)=>a.pos-b.pos||b.phrase.length-a.phrase.length);
  }

  function resolveCategoryAndUsage(itemName,keyword=''){
    const title=buildClassificationTitle(itemName);
    const candidates=collectClassificationCandidates(itemName,keyword);
    const earlyNouns=earlyProductNounSignals(itemName);
    if(earlyNouns.length>1){
      return {category:'ambiguous',usage:'ambiguous',kind:'ambiguous',confidence:'ambiguous',ambiguous:true,candidates,reason:'multiple_early_product_nouns',earlyProductNouns:earlyNouns};
    }
    if(!candidates.length) return {category:'unknown',usage:'unknown',kind:'unknown',confidence:'none',ambiguous:false,candidates:[],reason:'no_match'};
    let top=candidates[0];
    const topFamily=classificationFamily(top);
    const sameFamilyBest=chooseMostSpecificSameFamily(candidates,topFamily);
    if(sameFamilyBest) top=sameFamilyBest;
    const second=candidates.find(x=>classificationFamily(x)!==classificationFamily(top) && !isContextualUseSignal(title,top.category,top.usage,x,x.phrase));
    if(second){
      const pair=new Set([top.category+'.'+top.usage,second.category+'.'+second.usage]);
      if(pair.has('pet.toilet') && pair.has('pet.hygiene_wipe')){
        return {category:'ambiguous',usage:'ambiguous',kind:'ambiguous',confidence:'ambiguous',ambiguous:true,candidates,reason:'pet_toilet_hygiene_conflict'};
      }
    }
    if(second){
      const topRank=Number(top.rankScore??top.score);
      const secondRank=Number(second.rankScore??second.score);
      const rankGap=topRank-secondRank;
      const len=Math.max(1,title.length);
      const topEarly=(top.pos||0)<=24 || (top.pos||0)/len<=0.20;
      // TEMPORARY / UNCALIBRATED: 10-point gap and 40% late-position threshold.
      // These thresholds are regression guards, not tuned quality parameters. Do not retune
      // them to fit individual products without a separate calibration dataset.
      const secondLate=(second.pos||0)/len>=0.40;
      const strongStructuralLead=topEarly&&secondLate&&rankGap>=10;
      if(rankGap<20 && !strongStructuralLead){
        return {category:'ambiguous',usage:'ambiguous',kind:'ambiguous',confidence:'ambiguous',ambiguous:true,candidates,reason:'close_candidates'};
      }
    }
    return {category:top.category,usage:top.usage,kind:top.category,confidence:'title',ambiguous:false,candidates,reason:'resolved',matchedPhrase:top.phrase,score:top.score};
  }

  const STRONG_CONFLICT_RULES=CLASSIFICATION_RULES.filter(x=>x.priority>=120);

  // Some strong keywords describe a place/target of use rather than a second product.
  // Treat them as context when a concrete product identity is already established earlier.
  function isContextualUseSignal(title,chosenCategory,chosenUsage,rule,phrase){
    const chosenKey=chosenCategory+'.'+chosenUsage;
    const ruleKey=rule.category+'.'+rule.usage;
    if(ruleKey==='cleaning.window_screen' && ['cleaning.mop','cleaning.vacuum','cleaning.brush','cleaning.cloth','cleaning.glove'].includes(chosenKey)){
      const primaryPatterns={
        'cleaning.mop':/(?:電動モップ|回転モップクリーナー|電動フロアワイパー|回転モップ|フロアモップ|モップクリーナー)/,
        'cleaning.vacuum':/(?:ハンディクリーナー|ハンディークリーナー|ハンディ掃除機|小型掃除機|コードレス掃除機)/,
        'cleaning.brush':/(?:掃除ブラシ|電動ブラシ)/,
        'cleaning.cloth':/(?:掃除クロス|お掃除クロス)/,
        'cleaning.glove':/(?:掃除手袋|お掃除手袋)/
      };
      const re=primaryPatterns[chosenKey];
      const m=re&&title.match(re);
      const contextPos=title.indexOf(phrase);
      if(m && contextPos>=0 && m.index>=0 && m.index<contextPos) return true;
    }
    return false;
  }

  const GLOVE_NON_CLEANING_CONTEXT_RULES=[
    {usage:'motorcycle_glove',re:/(?:バイク|オートバイ|ライディング|ツーリング|モトクロス|レーシング)/},
    {usage:'baseball_glove',re:/(?:野球|ベースボール|硬式|軟式|守備|投手|捕手|キャッチャー|内野|外野)/},
    {usage:'cycling_glove',re:/(?:自転車|サイクル|サイクリング)/},
    {usage:'winter_sport_glove',re:/(?:スキー|スノーボード|スノボ)/},
    {usage:'work_or_protective_glove',re:/(?:作業用|防刃|耐熱|溶接|園芸|ニトリル|医療用)/}
  ];

  function gloveNonCleaningConflict(title){
    if(/(?:お掃除\s*手袋|掃除\s*手袋|お掃除手袋|掃除手袋)/.test(title)) return null;
    for(const rule of GLOVE_NON_CLEANING_CONTEXT_RULES){
      const m=title.match(rule.re);
      if(m) return {category:'non_cleaning',usage:rule.usage,phrase:m[0]};
    }
    return null;
  }

  function detectConflictingSignals(itemName,chosenCategory,chosenUsage){
    const title=norm(itemName);
    const conflicts=[];

    if(chosenCategory==='cleaning' && chosenUsage==='glove'){
      const gloveConflict=gloveNonCleaningConflict(title);
      if(gloveConflict) conflicts.push(gloveConflict);
    }

    if(chosenCategory==='storage' && ['storage_box','storage_case'].includes(chosenUsage)){
      const furniture=title.match(/ベンチ|スツール|椅子|オットマン|座れる/);
      if(furniture) conflicts.push({category:'furniture',usage:'seating_storage',phrase:furniture[0]});
    }

    if(chosenCategory==='cleaning' && ['mop','brush'].includes(chosenUsage)){
      const holder=title.match(/ハンガー|ホルダー|スタンド|(?:掃除用具|掃除道具|モップ|ブラシ)?入れ|収納/);
      if(holder) conflicts.push({category:'storage',usage:'holder_or_storage',phrase:holder[0]});
    }

    if(chosenCategory==='pet' && chosenUsage==='bed'){
      const drive=title.match(/車用|ドライブ|カーベッド/);
      if(drive) conflicts.push({category:'pet',usage:'drive_bed',phrase:drive[0]});
    }

    if(chosenCategory==='charging' && chosenUsage==='mobile_battery'){
      const special=title.match(/空調服|作業服|ファン付き(?:作業)?服|電熱(?:ベスト|ウェア)|ヒーターベスト|電気毛布/);
      if(special) conflicts.push({category:'charging',usage:'special_battery',phrase:special[0]});
    }
    for(const rule of STRONG_CONFLICT_RULES){
      const signature=rule.category+'.'+rule.usage;
      if(signature===chosenCategory+'.'+chosenUsage) continue;
      if(classificationFamily(rule)===classificationFamily({category:chosenCategory,usage:chosenUsage})) continue;
      for(const phrase of rule.phrases){
        if(title.toLowerCase().includes(String(phrase).toLowerCase())){
          if(isContextualUseSignal(title,chosenCategory,chosenUsage,rule,phrase)) continue;
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
      'pet.bed':{problem:'ペットが休む場所を用意したい',use:'ペット用ベッドとして使う',impact:'ペットが休む場所を整える助けになりそう',audience:'ペット用の寝床を探している人'},
      'pet.drive_bed':{problem:'犬との車移動で使うベッドを用意したい',use:'車内用のドライブベッドとして使う',impact:'車移動用の犬の居場所を用意しやすくなりそう',audience:'犬との車移動用ベッドを探している人'},
      'cleaning.vacuum':{problem:'気になるゴミを手早く吸い取りたい',use:'ハンディクリーナーとして掃除に使う',impact:'必要な場所をすぐ掃除しやすくなりそう',audience:'手軽に使えるハンディクリーナーを探している人'},
      'laundry.washing_net':{problem:'洗濯時に衣類をネットへ分けたい',use:'洗濯ネットとして使う',impact:'衣類を分けて洗う準備をしやすくなりそう',audience:'用途に合う洗濯ネットを探している人'},
      'charging.portable_power':{problem:'持ち運べる電源を用意したい',use:'ポータブル電源として使う',impact:'電源を確保したい場面への備えになりそう',audience:'持ち運べる電源を探している人'},
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

  function classify(item,keyword=''){
    const base=resolveCategoryAndUsage(titleOnly(item),keyword);
    const fields=classificationCopyFields(base);
    return {...base,...fields,supported:SUPPORTED_USAGES.has(base.category+'.'+base.usage)};
  }

  function titleSignals(item){
    const result=resolveCategoryAndUsage(titleOnly(item));
    return result.ambiguous?[]:[result.usage,result.category].filter(Boolean);
  }

  function extractFacts(item,kind){
    const shadow=root.UrenaviProductShadowV2;
    if(!shadow || typeof shadow.analyze!=='function') return [];
    const result=shadow.analyze({itemName:titleOnly(item)},'');
    if(!result?.validation?.allSpansGrounded) return [];
    return (result.facts||[])
      .filter(f=>['feature','spec','target'].includes(f.role))
      .map(f=>String(f.text||'').trim())
      .filter(Boolean)
      .filter((x,i,a)=>a.indexOf(x)===i)
      .slice(0,4);
  }

  function primaryUsageWord(item){
    const r=resolveCategoryAndUsage(titleOnly(item));
    const map={grooming:'抜け毛',window_screen:'網戸',glove:'手袋',cloth:'クロス',mop:'モップ',brush:'ブラシ',vacuum:'ハンディクリーナー',washing_net:'洗濯ネット',portable_power:'ポータブル電源',drive_bed:'ドライブベッド',storage_box:'収納ボックス',storage_case:'収納ケース',mobile_battery:'モバイルバッテリー',bed:'ベッド'};
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
    /除菌/g,/殺菌/g,/抗菌/g,/消臭/g,/防臭/g,/臭わない/g,/匂わない/g,/臭くない/g,/燃えにくい/g,/難燃/g,/発火防止/g,/予防/g,/効果/g,/効能/g,
    /No\.?\s*1/gi,/ナンバーワン/g,/一番/g,/最高/g,/最強/g,/絶対/g,/必ず/g
  ];

  const PROMO_RISK_RULES=[
    /楽天(?:市場)?(?:ランキング)?\s*1位(?:受賞)?/g,/楽天1位(?:受賞)?/g,/ランキング\s*1位(?:受賞)?/g,/\d+冠(?:受賞)?/g,/受賞/g,
    /半額/g,/(?:スーパー)?SALE/gi,/セール/g,/クーポン(?:利用)?/g,/ご好評です/g,/大好評/g,/当店人気/g,/大人気/g,/リピーター続出/g,
    /最安\d*円?/g,/\d+(?:\.\d+)?\s*%\s*(?:OFF|オフ)/gi,/(?:P\d+倍|ポイント\d+倍)/gi
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
    return /OFF|オフ|半額|SALE|セール|クーポン|最安|限定|ポイント|配布|即納|搬入設置無料|設置無料|ご好評です|大好評|当店人気|大人気|リピーター続出|円(?:~|〜|～)?|(?:総合)?\s*1位|楽天\s*1位|楽天1位|ランキング|受賞|\d+冠|送料無料|公式ショップ|公式|正規品/i.test(String(text||''));
  }

  function cleanupPairedSymbols(text){
    const pairs=[['【','】'],['〖','〗'],['（','）'],['(',')'],['「','」'],['『','』'],['[',']'],['［','］']];
    const cleanLine=line=>{
      let chars=[...String(line||'')];
      const remove=new Set();
      for(const [open,close] of pairs){
        const stack=[];
        for(let i=0;i<chars.length;i++){
          if(remove.has(i)) continue;
          if(chars[i]===open) stack.push(i);
          else if(chars[i]===close){ if(stack.length) stack.pop(); else remove.add(i); }
        }
        for(const i of stack) remove.add(i);
      }
      chars=chars.filter((_,i)=>!remove.has(i));
      const stars=chars.reduce((n,ch)=>n+(ch==='★'?1:0),0);
      if(stars%2===1) chars=chars.filter(ch=>ch!=='★');
      return chars.join('');
    };
    return String(text||'').split('\n').map(cleanLine).join('\n');
  }

  function tidyDisplayTitle(text){
    let s=String(text||'');
    s=s
      .replace(/「\s*」|『\s*』|【\s*】|〖\s*〗|\(\s*\)|（\s*）/g,' ')
      .replace(/(?:総合\s*)?1位(?:\s*\d+冠)?/g,' ')
      .replace(/年間ランキング受賞|年間ランキング\s*受賞/g,' ')
      .replace(/ランキング\s*受賞/g,' ')
      .replace(/\d+冠(?:受賞)?|受賞/g,' ')
      .replace(/ご好評です|大好評|当店人気|大人気/g,' ')
      .replace(/(?:クーポン)?で\s*\d{1,3}(?:,\d{3})*\s*円(?:[~〜～])?[!！\\/／＼]*/g,' ')
      .replace(/(?:限定[!！★\s]*)?\d{1,3}(?:,\d{3})*\s*円(?:[~〜～])?[!！\\/／＼]*/g,' ')
      .replace(/(?:で|→)\s*\d{1,3}(?:,\d{3})*\s*円(?:[~〜～])?[!！\\/／＼]*/g,' ')
      .replace(/(?:P倍倍|P\d+倍|ポイント\d+倍)/gi,' ')
      .replace(/^[\s!！★☆\\＼\/／"'「」『』【】〖〗・|｜]+/g,' ')
      .replace(/[\s!！★☆\\＼\/／"'「」『』【】〖〗・|｜]+$/g,' ')
      .replace(/\s+/g,' ')
      .trim();
    return cleanupPairedSymbols(s);
  }

  function stripPromotionalText(itemName){
    let s=titleOnly({itemName});
    s=s
      .replace(/(?:P\d+倍|ポイント\d+倍)\s*\d{1,2}\/\d{1,2}\s*\d{1,2}:\d{2}\s*(?:迄|まで)?/gi,' ')
      .replace(/(?:SALE|セール)価格/gi,' ')
      .replace(/クーポン[^】〗\]\s]{0,60}(?:\d{1,2}\/\d{1,2}|\d{1,2}日)?[^】〗\]\s]{0,30}(?:\d{1,2}:\d{2}|\d{1,2}時)?\s*(?:迄|まで)?/gi,' ')
      
      .replace(/★([^★]{0,80})★/g,(m,x)=>isPromoText(x)?' ':m)
      .replace(/[＼\\]([^＼／\\/]{0,140})[／/]/g,(m,x)=>isPromoText(x)?' ':m)
      .replace(/【([^】]{0,140})】/g,(m,x)=>isPromoText(x)?' ':(` ${x} `))
      .replace(/〖([^〗]{0,140})〗/g,(m,x)=>isPromoText(x)?' ':(` ${x} `))
      .replace(/\[([^\]]{0,140})\]/g,(m,x)=>isPromoText(x)?' ':(` ${x} `))
      .replace(/［([^］]{0,140})］/g,(m,x)=>isPromoText(x)?' ':(` ${x} `))
      .replace(/＼?当日発送／?/g,' ')
      .replace(/楽天(?:市場)?(?:総合)?(?:ランキング)?\s*1位(?:\s*\d+冠)?(?:受賞)?/g,' ')
      .replace(/楽天1位(?:\s*\d+冠)?(?:受賞)?/g,' ')
      .replace(/(?:総合\s*)?1位(?:\s*\d+冠)?(?:受賞)?/g,' ')
      .replace(/年間ランキング受賞|ランキング\s*受賞/g,' ')
      .replace(/\d+冠(?:受賞)?/g,' ')
      .replace(/受賞/g,' ')
      .replace(/(?:スーパー)?SALE|セール|半額|クーポン(?:利用)?|最安\d*円?|\d+(?:\.\d+)?\s*%\s*(?:OFF|オフ)|ご好評です|大好評|当店人気|大人気/gi,' ')
      .replace(/(?:値上げ前に|今だけ|期間限定|数量限定|早割|レビュー特典(?:あり)?|ポイント超UP|リピーター続出)/gi,' ')
      .replace(/(?:POINT|ポイント|P)\s*最大?\s*\d+倍/gi,' ')
      .replace(/(?:P倍倍|P\d+倍|ポイント\d+倍)/gi,' ')
      .replace(/(?:限定[!！★\s]*)?\d{1,3}(?:,\d{3})*\s*円(?:[~〜～])?[!！\\/／＼]*/g,' ')
      .replace(/(?:で|→)\s*\d{1,3}(?:,\d{3})*\s*円(?:[~〜～])?[!！\\/／＼]*/g,' ')
      .replace(/配布中[!！\\/／＼]*/g,' ')
      .replace(/搬入設置無料|設置無料|即納/g,' ');
    s=tidyDisplayTitle(s);
    s=s.replace(/^\s*(?:\d{1,2}\/\d{1,2}(?:\s+\d{1,2}:\d{2})?\s*(?:迄|まで)?|\d{1,2}:\d{2}\s*(?:迄|まで)?|迄|まで|価格|の|で|に|を|が)\s*/,'').trim();
    return tidyDisplayTitle(s);
  }

  function safeUsageName(category,usage){
    const map={
      'beauty.face_roller':'美顔ローラー',
      'beauty.face_peeling':'ウォーターピーリング美顔器',
      'beauty.kassa':'かっさプレート',
      'pet.water':'ペット用給水用品',
      'pet.toilet':'ペットシート',
      'pet.bed':'ペットベッド',
      'pet.drive_bed':'ドライブベッド',
      'laundry.washing_net':'洗濯ネット',
      'charging.portable_power':'ポータブル電源',
      'pet.grooming':'ペット用毛取りグローブ',
      'pet.hygiene_wipe':'ウェットティッシュ',
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
    return map[category+'.'+usage]||'';
  }

  function stripClaimText(text){
    let s=String(text||'');
    for(const re of CLAIM_RISK_RULES){
      re.lastIndex=0;
      s=s.replace(re,' ');
    }
    return tidyDisplayTitle(s);
  }

  const EXACT_PRODUCT_TYPE_NOUNS=[
    '回転モップクリーナー','電動フロアワイパー','電動モップ','モップクリーナー',
    'ドライブベッドキャリー','コーデュラドライブベッド','ドライブベッド',
    'ドライブボックス','車用ベッド',
    'ブラジャー用洗濯ネット','シャツ用洗濯ネット','洗濯ネット','ランドリーネット',
    'ハンディクリーナー','ハンディークリーナー','ハンディ掃除機','小型掃除機',
    'ポータブル電源',
    '犬用ベッド','ペットベッド','ドッグベッド',
    'IDカードケース','IDカードホルダー','スマホケース','カードケース',
    'ボクサーパンツ','ボクサーショーツ','トランクス','ショーツ',
    'パウンドケーキ','Tシャツ','tシャツ','カットソー','パジャマ',
    'モバイルバッテリー','Power Bank','パワーバンク','ポータブル電源',
    'アンテナケーブル','変換ケーブル','HDMIケーブル','USBケーブル','ケーブル',
    'フラットシューズ','コンフォートシューズ','パンプス','サンダル',
    'スクエアボックスプール','ビニールプール','プール',
    '財布','リュック','バッグ','靴下','ソックス','筆ペン',
    '収納ボックス','収納ケース',
    'うんち袋','ウンチ袋','マナー袋','ウェットティッシュ','ウェットシート',
    'ペットシート','キャリーバッグ','ペットバッグ','ペットマット',
    'フードボウル','ペット食器','給餌器'
  ];

  function exactProductTypeName(itemName){
    const t=titleOnly({itemName});
    // Ordered from specific product types to broader ones.
    // Prefer specificity over title position.
    for(const noun of EXACT_PRODUCT_TYPE_NOUNS){
      if(t.includes(noun)) return noun;
    }
    return '';
  }

  function deriveSafeUnknownName(itemName){
    const t=titleOnly({itemName});
    const exact=exactProductTypeName(t);
    if(exact) return exact;
    const cleaned=stripClaimText(stripPromotionalText(t));
    return cleaned.slice(0,48).trim();
  }

  function buildSafeDisplayName(item,analysis){
    const a=analysis||analyze(item);
    const usageName=safeUsageName(a.category,a.usage);
    if(a.claimRisk){
      const hasConflict=Array.isArray(a.conflicts)&&a.conflicts.length>0;
      if(hasConflict) return fallbackProductName(item,a);
      const claimSafe=usageName||deriveSafeUnknownName(item?.itemName||'');
      return claimSafe||stripClaimText(stripPromotionalText(item?.itemName||'')).slice(0,48).trim();
    }
    if(a.ambiguous || !a.supported) return fallbackProductName(item,a);
    let s=stripPromotionalText(item?.itemName||'');
    s=finalScan(s);
    const visibleLength=s.replace(/[^\p{L}\p{N}]/gu,'').length;
    if(!s || visibleLength<4) s=usageName||deriveSafeUnknownName(item?.itemName||'');
    if(!s) s='商品名を確認してください';
    if(s.length>48) s=s.slice(0,48).trim()+'…';
    return cleanupPairedSymbols(s);
  }

  function pickUnusedPattern(patterns,start,used){
    if(!Array.isArray(patterns)||!patterns.length)return '';
    const taken=used instanceof Set?used:new Set(Array.isArray(used)?used:[]);
    for(let step=0;step<patterns.length;step++){
      const candidate=patterns[(start+step)%patterns.length];
      if(!taken.has(candidate)){
        if(used instanceof Set)used.add(candidate); else if(Array.isArray(used))used.push(candidate);
        return candidate;
      }
    }
    return patterns[start%patterns.length];
  }

  const STORAGE_OPENINGS=[
    '収納ボックスで、物をひとまとめにしておきたいときに。',
    '収納場所を整えて、物の置き場所を決めやすくしたいときに。',
    '身の回りの物をまとめて、収納を整えたいときに。',
    '収納する物をまとめて、部屋の中を整えたいときに。',
    '散らばりやすい物を、収納ボックスにまとめたいときに。',
    '物の置き場所をまとめて、収納しやすくしたいときに。',
    '収納ボックスを使って、物の定位置を決めたいときに。',
    '増えた物をひとまとめにして、置き場所を整えたいときに。',
    '収納する場所を決めて、物をまとめておきたいときに。',
    '物をまとめる収納先を用意しておきたいときに。'
  ];
  const STORAGE_SECONDS=[
    '物をまとめて収納できると、必要なものを探す手間を減らしやすそうです。',
    '置き場所をまとめることで、普段の片づけを続けやすくなりそうです。',
    '収納する場所を決めやすくなれば、使った後も戻しやすくなりそうです。',
    '物ごとに置き場所をまとめることで、整った状態を保ちやすくなりそうです。',
    '収納先が決まっていると、物が散らばる場面を減らしやすそうです。',
    'まとめて置ける場所があると、必要な物の場所を把握しやすくなりそうです。',
    '物を同じ場所にまとめることで、収納の場所を決めやすくなりそうです。',
    '収納先をひとつ決めておくと、物の置き場所に迷いにくくなりそうです。',
    'しまう場所をまとめることで、使わない物を置いておきやすくなりそうです。',
    '物の置き場所をまとめておくと、普段の片づけを進めやすくなりそうです。'
  ];
  const PET_BED_OPENINGS=[
    'ペットが休むための場所を用意したいときに。',
    'ペット用の寝床を探しているときに。',
    'ペットが休める場所を、ひとつ用意しておきたいときに。',
    'ペットの寝床を用意して、休む場所を決めたいときに。',
    'ペットが普段休む場所を整えておきたいときに。',
    'ペット用ベッドを置いて、休む場所を用意したいときに。'
  ];
  const PET_BED_SECONDS=[
    '休むための場所を決めておくことで、普段の居場所を整えやすくなりそうです。',
    '専用の寝床を用意することで、ペットが過ごす場所を決めやすくなりそうです。',
    '休む場所をひとつ決めておくと、普段の居場所を用意しやすくなりそうです。',
    '寝床を用意しておくことで、ペットが休む場所を分けやすくなりそうです。',
    'ペット用の寝床があると、休むための場所を整えやすくなりそうです。',
    '休む場所を用意しておくと、ペットの居場所を決めやすくなりそうです。'
  ];
  const BATTERY_OPENINGS=[
    '外出中の充電切れに備えておきたいときに。',
    'スマホなどの電池残量が気になる場面に備えたい人に。',
    '必要なときに充電できる手段を持っておきたいときに。',
    'コンセントが近くにない場面でも、充電手段を用意しておきたいときに。',
    '移動中でも充電できる備えを持っておきたいときに。',
    '電池残量が少なくなったときの充電手段を用意したい人に。',
    '外出先でも充電できる選択肢を持っておきたいときに。',
    'スマホなどを充電できる予備の電源を用意したいときに。',
    '充電できる場所が限られる場面に備えておきたい人に。',
    '必要な場面で電源を補えるようにしておきたいときに。'
  ];
  const BATTERY_SECONDS=[
    '必要なときに充電できる備えがあると、電池残量を気にする場面を減らしやすそうです。',
    '持ち歩ける充電手段があると、充電できる場所を探す手間を減らせそうです。',
    '予備の電源を用意しておくことで、電池切れへの備えをしやすくなりそうです。',
    '充電手段を持っておくと、外出先でも電池残量に対応しやすくなりそうです。',
    '必要な場面で充電できる選択肢があると、電池切れを避けやすくなりそうです。',
    '電源を補える手段があることで、移動中の充電にも備えやすくなりそうです。',
    '予備の充電手段を持っておくと、外出先でも機器を使い続けやすくなりそうです。',
    '充電できる手段を増やしておくことで、電池残量への不安を減らしやすそうです。',
    'コンセントが使えない場面でも、充電の選択肢を確保しやすくなりそうです。',
    '必要なときに電源を補えるようにしておくと、充電切れに備えやすくなりそうです。'
  ];

  function groundedFeatureSentence(fact){
    const f=String(fact||'').trim();
    if(!f) return '';
    if(/折りたたみ/.test(f)) return '使わないときの置き方まで考えて選びたいときに、確認しやすい特徴です。';
    if(/省スペース|スリム|薄型/.test(f)) return '置き場所を取りすぎたくないときに、確認しておきたい特徴です。';
    if(/伸縮/.test(f)) return '長さを調整できるタイプを探しているときに、確認しやすい特徴です。';
    if(/使い捨て/.test(f)) return '交換しながら使うタイプを探しているときに、確認しやすい特徴です。';
    if(/取替式/.test(f)) return '取り替えながら使えるタイプを探しているときに、確認しやすい特徴です。';
    if(/両面/.test(f)) return '両面タイプを条件に選びたいときに、確認しやすい特徴です。';
    if(/USB-C/.test(f)) return 'USB-C対応を条件に選びたいときに、比較しやすいポイントです。';
    if(/急速充電/.test(f)) return '急速充電対応を条件に選びたいときに、比較しやすいポイントです。';
    if(/ワイヤレス充電/.test(f)) return 'ワイヤレス充電対応を条件に選びたいときに、比較しやすいポイントです。';
    if(/マイクロファイバー|吸水|速乾|防水|撥水|コードレス|コンパクト/.test(f)) return f+'という表記を重視して選びたいときに、確認しやすいポイントです。';
    if(/枚(?:セット|入り)|個(?:セット|入り)|本(?:セット|入り)|袋(?:セット|入り)|組(?:セット|入り)/.test(f)) return f+'という数量表記を確認しながら選びたいときに、比較しやすいポイントです。';
    return f+'という特徴を条件に商品を比べたいときに、確認しやすいポイントです。';
  }

  function naturalProductIdentity(item,a){
    if(a?.genericEligible && a?.genericIdentity) return a.genericIdentity;
    const exact=exactProductTypeName(item?.itemName||'');
    if(exact) return exact;
    const usage=safeUsageName(a.category,a.usage)||primaryUsageWord(item);
    return usage||deriveSafeUnknownName(item?.itemName||'');
  }

  function groundedAudience(a,item){
    const identity=naturalProductIdentity(item,a);
    const facts=(a.facts||[]).filter(Boolean);
    if(!identity) return '';
    if(a.genericEligible) return genericGroundedAudience(identity,a);
    if(a.category==='pet' && a.usage==='drive_bed') return '犬との車移動に使える'+identity+'を探している人';
    if(facts.some(x=>/カバーを外して洗える|洗える/.test(x))) return 'お手入れしやすい'+identity+'を探している人';
    if(facts.some(x=>/防水|撥水/.test(x))) return '防水・撥水表記のある'+identity+'を探している人';
    if(facts.some(x=>/犬・猫向け/.test(x))) return /犬用|猫用/.test(identity)?'犬や猫向けのベッドを探している人':'犬や猫用の'+identity+'を探している人';
    if(facts.some(x=>/折りたたみ/.test(x))) return '折りたためる'+identity+'を探している人';
    if(facts.some(x=>/コードレス/.test(x))) return 'コードレスの'+identity+'を探している人';
    const fact=facts[0];
    if(fact) return fact+'の'+identity+'を探している人';
    return identity+'を探している人';
  }

  function petNaturalLines(identity,facts,variant=0){
    const has=re=>facts.some(x=>re.test(x));
    const size=(facts.find(x=>/^(?:SS|S|M|L|LL|XL|XXL)サイズ$/.test(x))||'');
    const idx=((Number(variant)||0)%4+4)%4;
    const lines=[];

    if(has(/カバーを外して洗える/)){
      const wash=[
        'カバーを外して洗えるので、汚れが気になったときにお手入れしやすい'+identity+'です。',
        'カバーを外して洗える'+identity+'。日々のお手入れのしやすさを重視したい人に確認しやすい仕様です。',
        'お手入れのしやすさで選ぶなら、カバーを外して洗える点を確認できる'+identity+'です。',
        'カバーを取り外して洗える表記があるため、清潔に使い続けたいときに確認したい'+identity+'です。'
      ];
      lines.push(wash[idx]);
    }else if(has(/洗える/)){
      const wash=[
        '洗える表記があり、日々のお手入れを考えて選びたい人にも確認しやすい'+identity+'です。',
        'お手入れ方法を重視するなら、洗える表記を確認できる'+identity+'です。',
        '洗える仕様が明記された'+identity+'。汚れたときのお手入れ方法まで考えて選びたい人に確認しやすい商品です。',
        '日常使いのお手入れまで考えるなら、洗える表記がある'+identity+'は比較しやすい選択肢です。'
      ];
      lines.push(wash[idx]);
    }

    if(has(/撥水/)){
      const water=[
        '撥水表記があるので、水濡れが気になる場面でも選びやすい仕様です。',
        '撥水仕様の表記もあり、水まわりや汚れへの備えを重視したいときに確認できます。',
        'さらに撥水表記も確認できるので、お手入れ面を重視した比較がしやすい商品です。',
        '撥水表記がある点も、日常のお手入れを考えると確認しておきたいポイントです。'
      ];
      lines.push(water[idx]);
    }else if(has(/防水/)){
      const water=[
        '防水表記があり、水濡れ対策を重視したいときに確認しやすい仕様です。',
        '防水表記も確認できるため、水濡れへの備えを重視したい人が比較しやすい商品です。',
        '水濡れ対策を意識して選ぶなら、防水表記がある点も確認できます。',
        '防水表記があることも、日常使いで確認しておきたいポイントです。'
      ];
      lines.push(water[idx]);
    }

    if(size) lines.push(size+'表記があるので、サイズを確認しながら選べます。');

    if(!lines.length && has(/低反発/)){
      lines.push('低反発素材の表記がある'+identity+'です。素材のタイプを確認しながら選びたい人に比較しやすい商品です。');
    }
    if(lines.length<2 && has(/滑り止め/)) lines.push('滑り止め加工の表記があります。');
    if(lines.length<2 && has(/日本製/)) lines.push('日本製の表記があります。');
    if(lines.length<2 && has(/高反発/)) lines.push('高反発素材の表記があります。');
    if(lines.length<2 && has(/犬・猫向け/)) lines.push('犬・猫向けの表記があります。');

    if(!lines.length){
      const fallbacks=[
        '犬用の'+identity+'を探している人が比較しやすい商品です。',
        identity+'を犬用で探しているときの比較候補です。',
        '犬用の寝床を探しているときに確認したい'+identity+'です。',
        '犬用の'+identity+'を見比べたいときに確認しやすい商品です。'
      ];
      lines.push(fallbacks[idx]);
    }
    return lines.slice(0,2);
  }

  function naturalFactLine(fact,identity,variant=0){
    const f=String(fact||'').trim();
    let core='';
    if(!f) core=identity;
    else if(/カバーを外して洗える/.test(f)) core='カバーを外して洗える仕様';
    else if(/洗える/.test(f)) core='洗える表記あり';
    else if(/折りたたみ/.test(f)) core='折りたたみ対応';
    else if(/省スペース/.test(f)) core='省スペース表記あり';
    else if(/スリム|薄型/.test(f)) core='スリム・薄型表記あり';
    else if(/撥水/.test(f)) core='撥水表記あり';
    else if(/防水/.test(f)) core='防水表記あり';
    else if(/犬・猫向け/.test(f)) core='犬・猫向け表記あり';
    else if(/コードレス/.test(f)) core='コードレス表記あり';
    else if(/USB-C/.test(f)) core='USB-C対応表記あり';
    else if(/急速充電/.test(f)) core='急速充電対応表記あり';
    else if(/ワイヤレス充電/.test(f)) core='ワイヤレス充電対応表記あり';
    else if(/取替式/.test(f)) core='取替式';
    else if(/両面/.test(f)) core='両面タイプ';
    else if(/リン酸鉄/.test(f)) core='リン酸鉄バッテリー表記あり';
    else if(/^\d+Wh$/.test(f)) core=f+'容量表記';
    else if(/^定格\d+W$/.test(f)) core=f+'表記';
    else if(/ドラム式/.test(f)) core='ドラム式対応表記あり';
    else if(/乾燥機対応/.test(f)) core='乾燥機対応表記あり';
    else if(/乾湿両用/.test(f)) core='乾湿両用表記あり';
    else core=f;
    const patterns=f ? [
      core+'です。', core+'。', '確認できる特徴は、'+core+'です。', 'ポイントは、'+core+'です。',
      '特徴のひとつが、'+core+'です。', core+'という仕様です。', core+'が確認できます。',
      core+'を備えています。', core+'がひとつの特徴です。', core+'という点が目に留まります。'
    ] : [
      identity+'です。', identity+'として掲載されている商品です。', identity+'のカテゴリで見ておきたい商品です。',
      identity+'を探す中で確認しておきたい商品です。', identity+'の候補として見ておきたい商品です。',
      identity+'を選ぶ際に確認しておきたい商品です。', identity+'の比較候補に入れやすい商品です。',
      identity+'を探しているときに見ておきたい商品です。', identity+'の選択肢として確認したい商品です。',
      identity+'を候補にするなら見ておきたい商品です。'
    ];
    const idx=((Number(variant)||0)%patterns.length+patterns.length)%patterns.length;
    return patterns[idx];
  }

  function vacuumNaturalLines(identity,facts,variant=0){
    const has=re=>facts.some(x=>re.test(x));
    const idx=((Number(variant)||0)%4+4)%4;
    const first=[
      '気づいたゴミをすぐ吸いたいときに使いやすい'+identity+'です。',
      '大きな掃除機を出すほどでもない場所を、サッと掃除したいときに便利な'+identity+'です。',
      '机まわりや車内など、気になる場所を手早く掃除したいときに使いやすい'+identity+'です。',
      '必要なときに手に取りやすい'+identity+'を探している人に。'
    ][idx];
    let second='';
    if(has(/コードレス/)) second='コードレス表記があるので、コンセント位置を気にせず使いたい場面にも合わせやすい仕様です。';
    else if(has(/乾湿両用/)) second='乾湿両用の表記があり、対応する掃除シーンを広げたい人に確認したい仕様です。';
    else if(has(/USB-C/)) second='USB-C対応の表記があります。';
    else if(has(/HEPA/)) second='HEPAフィルターの表記があります。';
    else if(has(/コンパクト/)) second='コンパクト表記があり、置き場所を取りすぎたくない人にも確認しやすい仕様です。';
    return [first,second].filter(Boolean);
  }

  function washingNetNaturalLines(identity,facts,variant=0){
    const has=re=>facts.some(x=>re.test(x));
    const qty=facts.find(x=>/(?:枚|個|点)(?:セット|入り)$/.test(x));
    const idx=((Number(variant)||0)%4+4)%4;
    const first=[
      identity+'。洗う衣類に合わせて使い分けたいときに選びやすいタイプです。',
      '衣類を分けて洗いたいときに使える'+identity+'です。',
      'デリケートな衣類や小物を分けて洗いたいときに使いやすい'+identity+'です。',
      '普段の洗濯で衣類を分けたいときに用意しておきたい'+identity+'です。'
    ][idx];
    let second='';
    if(has(/ドラム式/) && has(/乾燥機対応/)) second='ドラム式・乾燥機対応の表記があり、使っている洗濯環境に合わせて選べます。';
    else if(has(/ドラム式/)) second='ドラム式対応の表記があります。';
    else if(has(/乾燥機対応/)) second='乾燥機対応の表記があります。';
    else if(has(/特大サイズ/)) second='特大サイズの表記があり、布団や毛布など大きめの洗濯物用を探している人に確認しやすい商品です。';
    else if(qty) second=qty+'の表記があり、洗濯物ごとに使い分けたいときに便利です。';
    else if(has(/メッシュ/)) second='メッシュ仕様の表記があります。';
    return [first,second].filter(Boolean);
  }

  function portablePowerNaturalLines(identity,facts,item,variant=0){
    const title=titleOnly(item);
    const wh=facts.find(x=>/^\d+Wh$/.test(x));
    const watt=facts.find(x=>/^定格\d+W$/.test(x));
    const idx=((Number(variant)||0)%4+4)%4;
    const use=[];
    if(/防災|停電/.test(title)) use.push('停電や防災');
    if(/キャンプ|アウトドア/.test(title)) use.push('キャンプ');
    if(/車中泊/.test(title)) use.push('車中泊');
    const useText=[...new Set(use)].slice(0,2).join('・');
    const first=useText
      ? useText+'で使う電源を用意したいときに検討しやすい'+identity+'です。'
      : ['持ち運べる電源を備えておきたいときに使える'+identity+'です。','コンセントが使えない場面に備えておきたい人に確認したい'+identity+'です。','家庭用の予備電源や屋外用電源を探している人に。','必要な場所へ持ち運べる電源を探しているときに確認したい'+identity+'です。'][idx];
    const specs=[wh,watt].filter(Boolean);
    let second='';
    if(specs.length) second=specs.join('・')+'の表記があり、容量や出力を見比べて選べます。';
    else if(facts.some(x=>/ソーラーパネルセット/.test(x))) second='ソーラーパネルセットの表記があります。';
    else if(facts.some(x=>/リン酸鉄/.test(x))) second='リン酸鉄バッテリーの表記があります。';
    else if(facts.some(x=>/UPS/.test(x))) second='UPS機能の表記があります。';
    return [first,second].filter(Boolean);
  }

  function mopNaturalLines(identity,facts,variant=0){
    const idx=((Number(variant)||0)%4+4)%4;
    const first=[
      '床の水拭きを、手で雑巾がけするより手軽に済ませたいときに使いやすい'+identity+'です。',
      '立ったまま床の拭き掃除を進めたいときに使える'+identity+'です。',
      'フローリングの拭き掃除をこまめにしたい人に使いやすい'+identity+'です。',
      '床のベタつきや汚れが気になったときに、拭き掃除へ取りかかりやすい'+identity+'です。'
    ][idx];
    let second='';
    if(facts.some(x=>/コードレス/.test(x))) second='コードレス表記があるので、部屋を移動しながら使いたい場面にも合わせやすい仕様です。';
    else if(facts.some(x=>/網戸/.test(x))) second='網戸掃除向けの表記もあり、床以外の掃除用途も確認できます。';
    else if(facts.some(x=>/充電式/.test(x))) second='充電式の表記があります。';
    return [first,second].filter(Boolean);
  }

  function driveBedNaturalLines(identity,facts,item,variant=0){
    const title=titleOnly(item);
    const idx=((Number(variant)||0)%4+4)%4;
    const first=[
      '犬との車移動で、座席に落ち着ける場所を用意したいときに使える'+identity+'です。',
      '愛犬とのドライブで、車内に専用の居場所を作りたい人に向いた'+identity+'です。',
      '車で一緒に出かけるとき、犬の居場所を座席に用意したい人に。'+identity+'です。',
      '通院や旅行など、犬との車移動に使うベッドを探している人に確認したい'+identity+'です。'
    ][idx];
    let second='';
    if(/洗える|手洗い/.test(title)) second='洗える表記があるので、車内で使った後のお手入れ方法も確認しやすい商品です。';
    else if(/飛び出し防止[^\s]{0,8}フック|フック[^\s]{0,8}飛び出し防止/.test(title)) second='飛び出し防止用フックの表記があります。';
    else if(/飛び出し防止/.test(title)) second='飛び出し防止の表記があります。';
    else if(/助手席/.test(title) && /後部座席/.test(title)) second='助手席・後部座席での使用表記があります。';
    else if(/助手席/.test(title)) second='助手席での使用表記があります。';
    else if(/後部座席/.test(title)) second='後部座席での使用表記があります。';
    else if(/撥水/.test(title)) second='撥水表記があります。';
    return [first,second].filter(Boolean);
  }

  function groundedOpening(a,item,variant=0,options={}){
    const identity=naturalProductIdentity(item,a);
    if(!identity) return '';
    const facts=(a.facts||[]).filter(Boolean);
    const lines=[identity+'です。'];
    if(facts[0]) lines.push(naturalFactLine(facts[0],identity,0));
    return lines.join('\n');
  }

  function openingFor(a,item,variant=0,options={}){
    return groundedOpening(a,item,variant,options);
  }

  const FactSafety=(typeof window!=='undefined'&&window.UrenaviFactSafety)||null;
  const LOCAL_SPLIT_RE=/[\s　【】〖〗（）()「」『』\[\]［］{}｛｝<>＜＞〈〉《》〔〕・／/\\|｜,:：;；!！?？★☆※]+/;

  function titleFactTokens(item){
    return String(item?.itemName||'')
      .replace(/<[^>]*>/g,' ')
      .split(LOCAL_SPLIT_RE)
      .map(x=>String(x||'').trim())
      .filter(Boolean);
  }

  function isSafeLocalFactToken(token){
    return Boolean(FactSafety?.isAllowedSpecFact?.(token));
  }

  function extractFallbackTitleFacts(item){
    const tokens=titleFactTokens(item);
    const filtered=FactSafety?.filterAllowedTitleFacts?.(tokens,tokens)||[];
    return filtered.slice(0,6);
  }

  function safePostFacts(item,facts=[]){
    const sourceTokens=new Set(titleFactTokens(item));
    return (Array.isArray(facts)?facts:[])
      .map(x=>String(x||'').trim())
      .filter(x=>x&&sourceTokens.has(x)&&isSafeLocalFactToken(x))
      .filter((x,i,a)=>a.indexOf(x)===i)
      .slice(0,6);
  }

  function groundedBenefitForFact(fact){
    const x=String(fact||'').trim();
    if(!x||!FactSafety?.isAllowedSpecFact?.(x)) return null;

    if(FactSafety?.STRUCTURED_COUNT_RE?.test(x)||FactSafety?.MULTIPACK_RE?.test(x)){
      return {
        hook:'必要な数をまとめて揃えたいときにチェック。',
        benefit:'商品名には「'+x+'」と明記されています。セット数や入数を比べながら、必要量に合うか判断しやすい仕様です。'
      };
    }
    if(FactSafety?.DIMENSION_RE?.test(x)){
      return {
        hook:'置き場所やサイズ感を確認して選びたいときに。',
        benefit:'商品名には「'+x+'」と明記されています。設置場所や収納場所に合うか、購入前にサイズを比べる材料になります。'
      };
    }
    if(FactSafety?.CONTENT_AMOUNT_RE?.test(x)){
      return {
        hook:'容量を比べて選びたいときに。',
        benefit:'商品名には「'+x+'」と明記されています。必要な容量に合うかを確認しながら候補を絞りやすい仕様です。'
      };
    }
    if(FactSafety?.MATERIAL_WITH_PERCENT_RE?.test(x)||FactSafety?.MATERIALS?.has?.(x)){
      return {
        hook:'素材を見て選びたいときに。',
        benefit:'商品名には「'+x+'」と明記されています。素材表記を確認しながら、自分の希望に合うか比較しやすい商品です。'
      };
    }
    if(FactSafety?.STANDARDS?.has?.(x)){
      if(x==='日本製'){
        return {
          hook:'生産地の表記も確認して選びたいときに。',
          benefit:'商品名には「日本製」と明記されています。生産地を比較条件にしたいときの確認材料になります。'
        };
      }
      if(x==='4K'){
        return {
          hook:'対応する映像規格を確認して選びたいときに。',
          benefit:'商品名には「4K」と明記されています。使う機器の対応状況と照らし合わせながら候補を絞れます。'
        };
      }
      return {
        hook:'接続規格や対応規格を確認して選びたいときに。',
        benefit:'商品名には「'+x+'」と明記されています。手持ちの機器や使いたい接続方法に合うか確認するときの比較材料になります。'
      };
    }
    return null;
  }

  function buildNeutralFactPost(item,facts=[]){
    const safeFacts=safePostFacts(item,facts);
    if(!safeFacts.length) return '';
    const price=Number(item?.itemPrice);
    const lines=['商品名に記載されている仕様です。',''];
    for(const fact of safeFacts) lines.push('✓ '+fact);
    if(Number.isFinite(price)&&price>0) lines.push('','価格：'+fmt(price)+'円');
    lines.push('','※アフィリエイト広告を利用しています');
    return lines.join('\n').slice(0,500);
  }

  function contextualLeadForProduct(identity,safeFacts){
    const id=String(identity||'').trim();
    if(!id) return '';
    const hasCount=safeFacts.some(x=>FactSafety?.STRUCTURED_COUNT_RE?.test(x)||FactSafety?.MULTIPACK_RE?.test(x));
    const hasDimension=safeFacts.some(x=>FactSafety?.DIMENSION_RE?.test(x));
    const hasMaterial=safeFacts.some(x=>FactSafety?.MATERIAL_WITH_PERCENT_RE?.test(x)||FactSafety?.MATERIALS?.has?.(x));
    const hasOrigin=safeFacts.includes('日本製');
    const hasStandard=safeFacts.some(x=>FactSafety?.STANDARDS?.has?.(x)&&x!=='日本製');

    if(hasCount&&hasMaterial) return id+'を、セット内容と素材の両方まで確認して選びたいなら。';
    if(hasMaterial&&hasOrigin) return id+'を、素材や生産地まで確認して選びたいなら。';
    if(hasDimension) return id+'を、サイズ表記まで確認して選びたいなら。';
    if(hasStandard) return id+'を、対応規格まで確認して選びたいなら。';
    if(hasCount) return id+'を、セット内容や入数まで確認して選びたいなら。';
    if(hasMaterial) return id+'を、素材表記まで確認して選びたいなら。';
    if(hasOrigin) return id+'を、生産地まで確認して選びたいなら。';
    return id+'を、商品名の仕様まで確認して選びたいなら。';
  }

  function contextualMeaningLine(identity,safeFacts){
    const id=String(identity||'').trim();
    if(!id||!safeFacts.length) return '';
    const first=String(safeFacts[0]||'').trim();
    const rest=safeFacts.slice(1,3).map(x=>'「'+x+'」').join('・');
    const evidence='商品名には「'+first+'」と明記されています。'+(rest?'さらに'+rest+'も確認できます。':'');
    const hasCount=safeFacts.some(x=>FactSafety?.STRUCTURED_COUNT_RE?.test(x)||FactSafety?.MULTIPACK_RE?.test(x));
    const hasDimension=safeFacts.some(x=>FactSafety?.DIMENSION_RE?.test(x));
    const hasMaterial=safeFacts.some(x=>FactSafety?.MATERIAL_WITH_PERCENT_RE?.test(x)||FactSafety?.MATERIALS?.has?.(x));
    const hasOrigin=safeFacts.includes('日本製');
    const hasStandard=safeFacts.some(x=>FactSafety?.STANDARDS?.has?.(x)&&x!=='日本製');

    if(hasDimension) return evidence+id+'のサイズを先に見比べたいときの判断材料になります。';
    if(hasCount&&hasMaterial) return evidence+id+'の枚数・セット内容と素材を一緒に見比べられます。';
    if(hasMaterial&&hasOrigin) return evidence+id+'を素材と生産地の両方から見比べたいときの候補です。';
    if(hasStandard) return evidence+id+'が手持ちの機器や使いたい規格に合うか確認する材料になります。';
    if(hasCount) return evidence+id+'を必要な枚数やセット数で比べたいときに見やすい商品です。';
    if(hasMaterial) return evidence+id+'を素材から比べたいときに確認しやすい商品です。';
    if(hasOrigin) return evidence+id+'を生産地も含めて比べたいときの候補です。';
    return evidence+id+'の仕様を見比べたいときの判断材料になります。';
  }
  const AI_COPY_EVIDENCE_RISK_RE=/(?:絶対|必ず|確実|No\.?\s*1|ナンバーワン|一番|最高|最強|治る|治療|改善|若返|痩せ|美白|小顔|リフトアップ|予防|効果|効能|除菌|殺菌|抗菌|消臭|防臭|ランキング|受賞|送料無料|クーポン|SALE|セール|半額|最安|ポイント\d*倍|P\d+倍)/i;

  function aiCopySource(item){
    return [item?.itemName,item?.itemCaption]
      .filter(Boolean)
      .map(x=>String(x).normalize('NFKC').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim())
      .join(' ');
  }

  function validatedAiCopyEvidence(item,facts=[]){
    const source=aiCopySource(item);
    return (Array.isArray(facts)?facts:[])
      .map(x=>String(x||'').normalize('NFKC').replace(/\s+/g,' ').trim())
      .filter(x=>x&&x.length<=96&&source.includes(x)&&!AI_COPY_EVIDENCE_RISK_RE.test(x))
      .filter((x,i,a)=>a.indexOf(x)===i)
      .slice(0,3);
  }

  function evidenceValueLead(identity,facts=[]){
    const id=String(identity||'').trim(),j=(facts||[]).join(' ');
    if(/フィルター交換不要/.test(j)) return id+'を、交換の手間まで考えて選びたいなら。';
    if(/最大\s*\d+(?:[.,]\d+)?\s*時間/.test(j)) return id+'を、充電の頻度まで考えて選びたいなら。';
    if(/温度|保温|℃|°C/.test(j)) return id+'を、温度設定や保温まで見て選びたいなら。';
    if(/重量|\d+(?:[.,]\d+)?\s*(?:g|kg)/i.test(j)) return id+'を、持ち運ぶときの重さまで比べて選びたいなら。';
    if(/容量|大容量|\d+(?:[.,]\d+)?\s*(?:L|ml|mL)/.test(j)) return id+'を、容量までしっかり比べて選びたいなら。';
    if(/幅|奥行|高さ|長さ|サイズ|\d+(?:[.,]\d+)?\s*(?:cm|mm)/.test(j)) return id+'を、置き場所やサイズ感まで確認して選びたいなら。';
    if(/Bluetooth|USB|Type-C|HDMI|マルチポイント|PSE|JIS|Ra\d+/i.test(j)) return id+'を、接続方法や対応仕様まで確認して選びたいなら。';
    return id+'を、使い方に合う仕様まで見て選びたいなら。';
  }

  function evidenceValueLine(fact){
    const x=String(fact||'').trim();
    if(!x) return '';
    if(/フィルター交換不要/.test(x)) return '「'+x+'」と確認できます。交換用フィルターを用意する手間を減らしたい人には注目したいポイントです。';
    if(/最大\s*\d+(?:[.,]\d+)?\s*時間/.test(x)) return '「'+x+'」と確認できます。充電する回数をできるだけ減らして使いたいときに比べたい仕様です。';
    if(/\d+\s*段階.*温度|温度.*\d+\s*段階/.test(x)) return '「'+x+'」と確認できます。用途に合わせて温度を選びたい人が見ておきたい仕様です。';
    if(/\d+(?:[.,]\d+)?\s*時間.*保温|保温.*\d+(?:[.,]\d+)?\s*時間/.test(x)) return '「'+x+'」と確認できます。保温時間を比べて選びたいときの材料になります。';
    if(/マルチポイント接続/.test(x)) return '「'+x+'」と確認できます。複数端末を使う人が接続方法を比べるときの確認ポイントです。';
    if(/Bluetooth\s*\d/i.test(x)) return '「'+x+'」と確認できます。手持ちの機器との接続仕様を確認して選びたいときの比較材料になります。';
    if(/重量|\d+(?:[.,]\d+)?\s*(?:g|kg)/i.test(x)) return '「'+x+'」と確認できます。持ち運ぶときの重さを比べて選びたい人に分かりやすい情報です。';
    if(/幅|奥行|高さ|長さ|サイズ|\d+(?:[.,]\d+)?\s*(?:cm|mm)/.test(x)) return '「'+x+'」と確認できます。置き場所や収納場所に収まるか、購入前に比べやすい情報です。';
    if(/容量|大容量|\d+(?:[.,]\d+)?\s*(?:L|ml|mL)/.test(x)) return '「'+x+'」と確認できます。必要な容量に合うかを比べて選びたいときの目安になります。';
    if(/ステンレス|ポリカーボネート|グラスファイバー|綿|コットン|素材/i.test(x)) return '「'+x+'」と確認できます。素材まで見て選びたい人が比較しやすいポイントです。';
    if(/クランプ式/.test(x)) return '「'+x+'」と確認できます。設置方法を重視する人が購入前に見ておきたいポイントです。';
    if(/USB|Type-C|HDMI|PSE|JIS|Ra\d+/i.test(x)) return '「'+x+'」と確認できます。対応規格や仕様を確認してから選びたいときの比較材料になります。';
    return '「'+x+'」と確認できます。商品を比べるときに見ておきたい具体的な仕様です。';
  }

  function buildValidatedProductPost(item,identity,evidenceFacts=[]){
    const id=String(identity||'').normalize('NFKC').replace(/\s+/g,' ').trim();
    const source=aiCopySource(item);
    if(!id||id.length>32||!source.includes(id)||AI_COPY_EVIDENCE_RISK_RE.test(id)) return '';
    const facts=validatedAiCopyEvidence(item,evidenceFacts),price=Number(item?.itemPrice);
    const lines=[evidenceValueLead(id,facts)];
    if(facts.length){
      for(const fact of facts.slice(0,2)) lines.push('',evidenceValueLine(fact));
      lines.push('','確認できるポイント👇');
      for(const fact of facts.slice(0,3)) lines.push('✓ '+fact);
    }else lines.push('',id+'として商品名・説明に記載されています。商品ページの詳細とあわせて、自分の条件に合うか確認できます。');
    if(Number.isFinite(price)&&price>0) lines.push('','価格：'+fmt(price)+'円');
    lines.push('','※アフィリエイト広告を利用しています');
    return lines.join('\n').slice(0,500);
  }

  function buildGroundedBenefitPost(item,facts=[]){
    const safeFacts=safePostFacts(item,facts);
    if(!safeFacts.length) return '';

    const identity=exactProductTypeName(item?.itemName||'');
    const price=Number(item?.itemPrice);

    if(identity){
      const lead=contextualLeadForProduct(identity,safeFacts);
      const meaning=contextualMeaningLine(identity,safeFacts);
      const lines=[lead,'',meaning,'','確認できる仕様👇'];
      for(const fact of safeFacts.slice(0,4)) lines.push('✓ '+fact);
      if(Number.isFinite(price)&&price>0) lines.push('','価格：'+fmt(price)+'円');
      lines.push('','※アフィリエイト広告を利用しています');
      return lines.join('\n').slice(0,500);
    }

    const benefits=safeFacts
      .map(groundedBenefitForFact)
      .filter(Boolean);
    if(!benefits.length) return buildNeutralFactPost(item,safeFacts);

    const first=benefits[0];
    const lines=[first.hook,'',first.benefit];

    if(benefits[1]&&benefits[1].benefit!==first.benefit){
      lines.push('',benefits[1].benefit);
    }

    lines.push('','確認できる仕様👇');
    for(const fact of safeFacts.slice(0,4)) lines.push('✓ '+fact);
    if(Number.isFinite(price)&&price>0) lines.push('','価格：'+fmt(price)+'円');
    lines.push('','※アフィリエイト広告を利用しています');
    return lines.join('\n').slice(0,500);
  }

  function fallbackProductName(item,analysis){
    const a=analysis||analyze(item);
    const original=titleOnly(item);
    const exact=deriveSafeUnknownName(original);
    if(/\bBOS\b/i.test(original)&&/(?:うんち袋|ウンチ袋|マナー袋|うんちが(?:臭わない|匂わない|臭くない)袋)/.test(original)){
      const noun=(original.match(/うんち袋|ウンチ袋|マナー袋/)||[])[0]||'うんち袋';
      return ('BOS '+noun).trim();
    }
    const productType=exactProductTypeName(original);
    if(productType) return productType;
    let s=stripClaimText(stripPromotionalText(original));
    s=s
      .replace(/^[~〜～◆★!！\/\\|・:：;；,，.。\-–—_\s]+/,'')
      .replace(/^(?:お買い物マラソン|楽天マラソン|マラソン限定|期間限定|限定価格|最短即日出荷|予約\d{1,2}月\d{1,2}日順次発送|まとめ買い対象|新色追加|メガ盛り)\s*/,'')
      .replace(/^(?:\d{1,2}[\/\-]\d{1,2}|\d{1,2}:\d{2}|迄|まで|価格|の|で|に|を|が)\s*/,'')
      .trim();
    const tokens=s.split(/\s+/).filter(Boolean);
    const noise=/^(?:おしゃれ|オシャレ|かわいい|可愛い|人気|プレゼント|ギフト|父の日|珍しい|メガ盛り|ごちそう)$/;
    const factish=/^(?:\d|SS$|S$|M$|L$|LL$|XL$|XXL$|折りたたみ|折り畳み|折畳|キャスター付き|コードレス|高さ調節|高さ調整|天板付き|引き出し|扉付き|充電式|自立|水拭き|LEDライト付|交換パッド付き|取っ手付き|持ち手付き|メッシュ|スリム|コンパクト)/i;
    const chosen=[];
    for(const token of tokens){if(noise.test(token))continue;if(chosen.length&&factish.test(token))break;chosen.push(token);if(chosen.join(' ').length>=28||chosen.length>=3)break;}
    let name=chosen.join(' ').trim();
    if(a.claimRisk&&exact&&exact.length<=32)name=exact;
    if(!name)name=exact||'商品名を確認してください';
    return cleanupPairedSymbols(name.slice(0,48).trim());
  }

  function validPrice(item){const n=Number(item?.itemPrice);return Number.isFinite(n)&&n>0?n:null;}
  function priceLine(item,prefix='価格：'){const n=validPrice(item);return n===null?'':prefix+fmt(n)+'円';}

  function shortFallback(item,withDisclosure=false,analysis=null){
    const a=analysis||analyze(item);
    const usageName=safeUsageName(a.category,a.usage);
    const hasConflict=Array.isArray(a.conflicts)&&a.conflicts.length>0;
    const title=(a.claimRisk&&usageName&&!hasConflict)?buildSafeDisplayName(item,a):fallbackProductName(item,a);
    const facts=extractFallbackTitleFacts(item).filter(x=>!a.claimRiskTerms?.some(t=>x.includes(t)));
    const lines=[title];
    if(facts.length)lines.push(facts.join('、'));
    const p=priceLine(item);if(p)lines.push(p);
    let out=lines.join('\n');
    if(withDisclosure)out+='\n\n※アフィリエイト広告を利用しています';
    return out;
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
    if(a.genericEligible && (!a.genericIdentity || !String(text).includes(a.genericIdentity))) return false;
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
    s=s.split('\n').map(x=>x.replace(/[ \t]+/g,' ').trimEnd()).join('\n').trim();
    return cleanupPairedSymbols(s);
  }

  const GENERIC_QUERY_BLOCKLIST=new Set([
    '商品','おすすめ','人気','便利グッズ','生活雑貨','日用品','家電','雑貨','収納','掃除','ペット','犬','猫','キッチン','美容','健康'
  ]);

  function groundedQueryIdentity(item,keyword=''){
    const raw=norm(keyword);
    if(!raw) return '';
    const compact=raw.replace(/\s+/g,'');
    if(compact.length>32 || GENERIC_QUERY_BLOCKLIST.has(raw) || GENERIC_QUERY_BLOCKLIST.has(compact)) return '';
    if(compact.length===1 && !/[\p{Script=Han}\p{Script=Katakana}]/u.test(compact)) return '';
    const title=buildClassificationTitle(titleOnly(item));
    const titleCompact=title.replace(/\s+/g,'').toLowerCase();
    const tokens=raw.split(/\s+/).filter(Boolean);
    const grounded=tokens.length>1
      ? tokens.every(t=>title.toLowerCase().includes(t.toLowerCase()))
      : titleCompact.includes(compact.toLowerCase());
    if(!grounded) return '';
    const firstPos=tokens.length>1
      ? Math.min(...tokens.map(t=>title.toLowerCase().indexOf(t.toLowerCase())).filter(x=>x>=0))
      : titleCompact.indexOf(compact.toLowerCase());
    const limit=compact.length===1?12:Math.max(40,Math.ceil(title.length*0.45));
    const early=firstPos>=0 && firstPos<=limit;
    if(!early) return '';
    return raw;
  }

  function extractGenericGroundedFacts(item,identity=''){
    const title=titleOnly(item);
    const facts=[];
    const accessoryTerms=['ケース','カバー','ポーチ','バッグ','リード','ベルト','ストラップ','ケーブル','パネル','フック','アダプター','ホルダー','スタンド'];
    const scopedToAccessory=(index,matchText)=>{
      const after=title.slice(index+String(matchText||'').length,index+String(matchText||'').length+14);
      const before=title.slice(Math.max(0,index-14),index);
      const accessory=accessoryTerms.find(term=>after.includes(term)||before.endsWith(term));
      return !!(accessory && !String(identity||'').includes(accessory));
    };
    const add=x=>uniquePush(facts,x);
    const patterns=[
      [/コードレス/,'コードレス'],
      [/充電式/,'充電式'],
      [/折りたたみ|折り畳み|折畳/,'折りたたみ'],
      [/防水/,'防水表記あり'],
      [/撥水/,'撥水表記あり'],
      [/食洗機対応|食器洗い乾燥機対応/,'食洗機対応'],
      [/電子レンジ対応|レンジ対応/,'電子レンジ対応'],
      [/冷凍対応/,'冷凍対応'],
      [/Type-?C|USB\s*Type-?C|USB-?C/i,'USB-C対応'],
      [/LED(?:ライト)?(?:付き|付)/i,'LEDライト付き'],
      [/丸洗い|洗える/,'洗える表記あり'],
      [/メッシュ/,'メッシュ表記あり'],
      [/スリム|薄型/,'スリム・薄型表記あり'],
      [/コンパクト/,'コンパクト表記あり']
    ];
    for(const [re,label] of patterns){
      const m=title.match(re);
      if(!m) continue;
      const idx=m.index??title.indexOf(m[0]);
      const idPos=identity?title.toLowerCase().indexOf(identity.toLowerCase()):-1;
      const close=idPos<0 || Math.abs(idx-idPos)<=48;
      if(close && !scopedToAccessory(idx,m[0])) add(label);
    }
    const size=title.match(/(?:^|\s)(SS|S|M|L|LL|XL|XXL)\s*サイズ(?:\s|$)/i);
    if(size) add(size[1].toUpperCase()+'サイズ');
    const seats=title.match(/(?:^|[^\d])(\d{1,2})\s*人掛け/);
    if(seats) add(seats[1]+'人掛け');
    for(const label of ['幅','奥行','高さ']){
      const m=title.match(new RegExp(label+'\\s*(\\d+(?:\\.\\d+)?)\\s*(cm|mm|m)?','i'));
      if(m) add(label+m[1]+(m[2]||''));
    }
    const pack=title.match(/(?:^|[^\d,])(\d{1,3})\s*(枚|個|本|袋|組|点)\s*(セット|入り)(?!\s*(?:突破|達成))/);
    if(pack && +pack[1]>1) add(pack[1]+pack[2]+pack[3]);
    return facts.slice(0,4);
  }

  function genericIntent(identity='',analysis=null){
    const x=String(identity||'');
    const category=String(analysis?.category||'');
    const usage=String(analysis?.usage||'');
    if(category==='storage' || /storage|holder/.test(usage)) return {use:'物の整理や収納に使う',benefit:'物の置き場所を決めやすくする'};
    if(category==='laundry') return {use:'洗濯まわりで使う',benefit:'洗濯物を分けたり扱いやすくする'};
    if(category==='charging') return {use:'機器の接続や給電に使う',benefit:'必要な電源を用意しやすくする'};
    if(category==='cleaning') return {use:'掃除に使う',benefit:'気になる場所の掃除へ取りかかりやすくする'};
    if(category==='pet') return {use:'ペットまわりで使う',benefit:'ペット用の環境を整えやすくする'};
    if(/クリーナー|掃除機|モップ|ブラシ|ワイパー|クロス/.test(x)) return {use:'掃除に使う',benefit:'気になる場所の掃除へ取りかかりやすくする'};
    if(/収納|ボックス|ケース|ワゴン|ラック|棚/.test(x)) return {use:'物の整理や収納に使う',benefit:'物の置き場所を決めやすくする'};
    if(/洗濯|ランドリー/.test(x)) return {use:'洗濯まわりで使う',benefit:'洗濯物を分けたり扱いやすくする'};
    if(/ケトル|鍋|フライパン|包丁|まな板|ピーラー|調理/.test(x)) return {use:'調理に使う',benefit:'食事の準備を進めやすくする'};
    if(/水筒|ボトル|タンブラー|マグ/.test(x)) return {use:'飲み物を入れて使う',benefit:'飲み物を持ち運びやすくする'};
    if(/傘|レイン/.test(x)) return {use:'雨の日に使う',benefit:'雨の日の移動に備えやすくする'};
    if(/USB|ハブ|充電器|ケーブル|アダプタ|電源/.test(x)) return {use:'機器の接続や給電に使う',benefit:'必要な接続や電源をまとめやすくする'};
    if(/加湿器/.test(x)) return {use:'室内の加湿に使う',benefit:'乾燥が気になる部屋で使いやすくする'};
    if(/扇風機|サーキュレーター/.test(x)) return {use:'室内の送風に使う',benefit:'空気を動かしたい場面で使いやすくする'};
    if(/ベッド|枕|クッション|マットレス/.test(x)) return {use:'休む場所や寝具として使う',benefit:'休む場所を整えやすくする'};
    if(/給水器|フードボウル|食器/.test(x)) return {use:'ペットの水や食事まわりで使う',benefit:'水や食事の場所を用意しやすくする'};
    return {use:'日常で使う',benefit:'必要な場面で使えるように備えやすくする'};
  }

  function genericGroundedOpening(identity,facts,variant=0,analysis=null){
    const intent=genericIntent(identity,analysis);
    const idx=((Number(variant)||0)%4+4)%4;
    const first=[
      identity+'。'+intent.use+'ときに使いやすい商品です。',
      identity+'を探しているなら、'+intent.use+'場面で確認したい商品です。',
      intent.use+'ために選びやすい'+identity+'です。',
      '必要な場面で使える'+identity+'を探している人に確認したい商品です。'
    ][idx];
    const second=facts[0]?naturalFactLine(facts[0],identity,idx):'';
    return [first,second].filter(Boolean).join('\n');
  }

  function genericGroundedAudience(identity,analysis=null){
    const intent=genericIntent(identity,analysis);
    return intent.use+'ための'+identity+'を探している人';
  }

  function analyze(item,keyword=''){
    const cls=classify(item,keyword);
    const source=sourceText(item);
    const sensitive=isSensitiveCategory(source);
    const genericIdentity=groundedQueryIdentity(item,keyword);
    const genericEligible=false;
    const facts=extractFacts(item,cls.kind);
    const legal=detectLegalRisk(titleOnly(item));
    const conflicts=cls.ambiguous?[]:detectConflictingSignals(titleOnly(item),cls.category,cls.usage);
    const supported=((!!cls.supported)||genericEligible) && !cls.ambiguous && conflicts.length===0;
    return {
      source,
      kind:cls.kind,
      category:cls.category,
      usage:cls.usage,
      confidence:cls.confidence,
      ambiguous:!!cls.ambiguous,
      ambiguityReason:cls.reason||'',
      candidates:cls.candidates||[],
      topCandidates:(cls.candidates||[]).slice(0,2).map(x=>({key:x.category+'.'+x.usage,score:x.score})),
      conflicts,
      supported,
      genericEligible,
      genericIdentity,
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
    return buildGroundedBenefitPost(item,extractFallbackTitleFacts(item));
  }

  function makeThreadsCopy(item,keyword,options={}){
    return buildGroundedBenefitPost(item,extractFallbackTitleFacts(item));
  }

  function makeInstagramCopy(item,keyword,options={}){
    return buildGroundedBenefitPost(item,extractFallbackTitleFacts(item));
  }


  api.detectLegalRisk=detectLegalRisk;
  api.buildSafeDisplayName=buildSafeDisplayName;
  api.titleFactTokens=titleFactTokens;
  api.isSafeLocalFactToken=isSafeLocalFactToken;
  api.extractFallbackTitleFacts=extractFallbackTitleFacts;
  api.buildNeutralFactPost=buildNeutralFactPost;
  api.buildGroundedBenefitPost=buildGroundedBenefitPost;
  api.buildValidatedProductPost=buildValidatedProductPost;
  api.validatedAiCopyEvidence=validatedAiCopyEvidence;
  api.groundedBenefitForFact=groundedBenefitForFact;
  api.contextualLeadForProduct=contextualLeadForProduct;
  api.contextualMeaningLine=contextualMeaningLine;
  api.fallbackProductName=fallbackProductName;
  api.exactProductTypeName=exactProductTypeName;
  api.earlyProductNounSignals=earlyProductNounSignals;
  api.stripPromotionalText=stripPromotionalText;
  api.extractSafeFeatures=extractFacts;
  api.buildClassificationTitle=buildClassificationTitle;
  api.collectClassificationCandidates=collectClassificationCandidates;
  api.resolveCategoryAndUsage=resolveCategoryAndUsage;
  api.detectConflictingSignals=detectConflictingSignals;
  api.gloveNonCleaningConflict=gloveNonCleaningConflict;
  api.groundedQueryIdentity=groundedQueryIdentity;
  api.extractGenericGroundedFacts=extractGenericGroundedFacts;
  api.genericIntent=genericIntent;
  api.analyzeRoomProduct=analyze;
  api.groundedFeatureSentence=groundedFeatureSentence;
  api.naturalProductIdentity=naturalProductIdentity;
  api.groundedAudience=groundedAudience;
  api.groundedOpening=groundedOpening;
  api.makeRoomCopy=makeRoomCopy;
  api.makeThreadsCopy=makeThreadsCopy;
  api.makeInstagramCopy=makeInstagramCopy;
  api.templateSets={storage:{openings:STORAGE_OPENINGS,seconds:STORAGE_SECONDS},petBed:{openings:PET_BED_OPENINGS,seconds:PET_BED_SECONDS},battery:{openings:BATTERY_OPENINGS,seconds:BATTERY_SECONDS}};
})(typeof window==='undefined'?null:window);

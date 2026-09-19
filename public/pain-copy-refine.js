(function(root){
  'use strict';
  if(!root || !root.UrenaviPainCopy) return;
  const api=root.UrenaviPainCopy;
  const fmt=n=>new Intl.NumberFormat('ja-JP').format(+n||0);

  const promoPatterns=[
    /特典(?:付|付き)?/gi,
    /(?:最大\s*)?\d{1,2}[％%]\s*(?:OFF|オフ)/gi,
    /半額/g,
    /送料無料/g,
    /(?:\d{2,5}円(?:OFF|オフ)\s*)?クーポン/gi,
    /ポイント\s*\d{1,2}倍/g,
    /期間限定/g,
    /数量限定/g,
    /公式/g,
    /正規品/g,
    /楽天(?:市場)?(?:総合)?(?:ランキング)?\s*1位/gi,
    /(?:総合|ランキング)\s*1位/gi
  ];

  function promoTerms(title){
    const s=String(title||'');
    const out=[];
    for(const re of promoPatterns){
      re.lastIndex=0;
      const m=re.exec(s);
      if(m){
        const value=m[0].replace(/\s+/g,'');
        if(!out.some(v=>v.toLowerCase()===value.toLowerCase())) out.push(value);
      }
    }
    return out.slice(0,5);
  }

  function stripPromos(text){
    let s=String(text||'');
    for(const re of promoPatterns){
      re.lastIndex=0;
      s=s.replace(re,' ');
    }
    return s
      .replace(/[!！]{1,}/g,' ')
      .replace(/[・｜|]{2,}/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function shortTitle(title){
    const original=String(title||'').replace(/\s+/g,' ').trim();
    const promos=promoTerms(original);
    let base=original
      .replace(/【[^】]{0,80}】/g,' ')
      .replace(/\[[^\]]{0,80}\]/g,' ')
      .replace(/［[^］]{0,120}］/g,' ')
      .replace(/（[^）]{0,80}）/g,' ')
      .replace(/\([^)]{0,80}\)/g,' ');
    base=stripPromos(base);
    const words=base.split(/\s+/).filter(Boolean);
    const dedup=[];
    for(const word of words){
      const normalized=word.replace(/[!！、,。]/g,'').toLowerCase();
      if(!normalized) continue;
      if(!dedup.some(v=>v.key===normalized)) dedup.push({key:normalized,value:word});
    }
    base=dedup.map(v=>v.value).join(' ');
    if(base.length>32) base=base.slice(0,32).trim()+'…';
    return (promos.length?'【'+promos.join('・')+'】 ':'')+base;
  }

  function factualBenefit(item){
    const t=String(item?.itemName||'');
    const promos=promoTerms(t);
    if(promos.some(v=>/1位/i.test(v))) return 'ランキング1位の実績表記あり';
    if(promos.some(v=>/%|％|半額|クーポン/i.test(v))) return '割引・クーポン情報もチェックしやすい';
    if(promos.some(v=>/送料無料/.test(v))) return '送料無料表記あり';
    if(promos.some(v=>/公式/.test(v))) return '公式ショップ表記あり';
    if(promos.some(v=>/正規品/.test(v))) return '正規品表記あり';
    if(promos.some(v=>/特典/.test(v))) return '特典付き表記あり';

    const facts=[
      [/日本製/,'日本製を選びたい人にも'],
      [/木製/,'木製の収納・家具を探している人にも'],
      [/ステンレス/,'ステンレス素材を探している人にも'],
      [/省スペース|スリム/,'省スペースで使えるものを探している人にも'],
      [/引き出し/,'引き出し収納を重視したい人にも'],
      [/完成品/,'完成品を選びたい人にも'],
      [/炭酸/,'炭酸対応を重視したい人にも'],
      [/保冷|保温/,'保冷・保温性能を重視したい人にも'],
      [/防水/,'防水仕様を重視したい人にも'],
      [/折りたたみ/,'使わない時に省スペースにしたい人にも']
    ];
    for(const [re,text] of facts) if(re.test(t)) return text;
    return '';
  }

  function reviewBenefit(item){
    const r=+item?.reviewCount||0;
    const v=+item?.reviewAverage||0;
    if(r>=1000) return `レビュー${fmt(r)}件、多くの人に選ばれている人気商品`;
    if(r>=300) return `レビュー${fmt(r)}件の人気商品`;
    if(r>=100) return `レビュー${fmt(r)}件で使用感を確認しやすい`;
    if(r>=30) return `レビュー${fmt(r)}件で選ぶ材料がある`;
    if(r>=10&&v>=4.5) return `★${v.toFixed(1)}の高評価`;
    return '';
  }

  function pushUnique(out,text){
    if(text && !out.includes(text)) out.push(text);
  }

  function benefits(item,ctx){
    const out=[];
    const r=+item?.reviewCount||0;
    const v=+item?.reviewAverage||0;
    const social=reviewBenefit(item);
    pushUnique(out,ctx?.benefit||'');
    for(const p of (ctx?.points||[])) pushUnique(out,p);
    pushUnique(out,social);
    if(v>=4.5&&r>=30&&!social.includes('高評価')) pushUnique(out,`★${v.toFixed(1)}の高評価`);
    pushUnique(out,factualBenefit(item));
    return out.slice(0,3);
  }

  function unsafeToPromote(ctx){
    const role=String(ctx?._role||'');
    const audience=String(ctx?.audience||'');
    return role==='safe-fallback' ||
      /商品の用途を確認|用途に合うものをきちんと選びたい|商品情報やレビューを比較/.test(audience);
  }

  function safeHoldCopy(){
    // Never expose internal diagnostic text as social post copy.
    // Empty copy lets the UI disable copying instead of risking an accidental post.
    return '';
  }

  function productLabel(item,ctx){
    const t=String(item?.itemName||'').normalize('NFKC');
    const role=String(ctx?._role||'');
    if(role==='cleaning-glove' || /(?:掃除|お掃除).*(?:手袋|グローブ|ミトン)|(?:手袋|グローブ|ミトン).*(?:掃除|お掃除)/.test(t)) return 'お掃除手袋';
    if(/網戸|あみ戸|アミ戸/.test(t)) return '網戸用お掃除アイテム';
    if(role==='cleaning-mop' || /モップ|ワイパー/.test(t)) return /ハンディ/.test(t)?'ハンディモップ':'お掃除モップ';
    if(role==='cleaning-brush' || /掃除ブラシ|清掃ブラシ/.test(t)) return '掃除ブラシ';
    if(/マイクロファイバー/.test(t) && /クロス|ダスター/.test(t)) return 'マイクロファイバークロス';
    if(role==='cleaning') return 'お掃除アイテム';
    if(role==='storage') return '収納アイテム';
    if(role==='charging') return /モバイルバッテリー/.test(t)?'モバイルバッテリー':'充電アイテム';
    if(role==='cutting') return /ピーラー/.test(t)?'ピーラー':/チョッパー/.test(t)?'チョッパー':'調理カッター';
    if(role==='strainer') return /かす揚げ/.test(t)?'かす揚げ':/あく取り|アク取り/.test(t)?'あく取り':'すくい網';
    return shortTitle(t);
  }

  function distinctiveProductName(item){
    const original=String(item?.itemName||'').normalize('NFKC').replace(/\s+/g,' ').trim();
    let s=stripPromos(original)
      .replace(/【[^】]{0,80}】|\[[^\]]{0,80}\]|［[^］]{0,120}］/g,' ')
      .replace(/\s+/g,' ')
      .trim();
    if(!s) s=original;
    if(s.length<=54) return s;
    return s.slice(0,40).trim()+'…'+s.slice(-12).trim();
  }

  function featureLead(item,ctx){
    const t=[item?.itemName,item?.catchcopy,item?.itemCaption,item?.itemDescription].filter(Boolean).join(' ').normalize('NFKC');
    const name=distinctiveProductName(item);
    const label=productLabel(item,ctx);
    const features=[];
    const add=x=>{if(x && !features.includes(x)) features.push(x);};

    if(/手にはめ|手袋|グローブ|ミトン/.test(t)) add('手にはめて使える');
    if(/ほこり吸着|ホコリ吸着|ほこり取り|ホコリ取り/.test(t)) add('ホコリを取りやすい');
    if(/吸水|水分吸水/.test(t)) add('水分を拭き取りやすい');
    if(/速乾/.test(t)) add('乾きやすい');
    if(/もこもこ|ふわふわ/.test(t)) add('やわらかな素材感');
    if(/ミニ|コンパクト/.test(t)) add('小回りの利くサイズ');
    if(/網戸|あみ戸|アミ戸/.test(t)) add('網戸掃除向け');
    if(/すき間|隙間|溝/.test(t)) add('すき間や溝に届きやすい');
    if(/省スペース|スリム/.test(t)) add('省スペース');
    if(/急速充電/.test(t)) add('急速充電対応');
    if(/10000mAh|10000mah/i.test(t)) add('10000mAh');
    if(/折りたたみ|折畳/.test(t)) add('折りたたみ対応');
    if(/防水|撥水/.test(t)) add('水ぬれに配慮');
    const count=t.match(/(\d+)\s*(?:枚|個|本|セット)/);
    if(count) add(count[1]+'点構成');

    const base=roleLead(ctx);
    if(features.length>=2) return name+'。'+features.slice(0,2).join('・')+'のが特徴。';
    if(features.length===1) return name+'。'+features[0]+'タイプ。';
    if(base) return name+'。'+base;
    return name||label;
  }

  function roleLead(ctx){
    const role=String(ctx?._role||'');
    if(role==='cleaning-glove') return 'クロスでは拭きにくい細かい場所を、手にはめたまま掃除しやすい。';
    if(role==='cleaning-mop') return '広い面や手が届きにくい場所を、まとめて掃除しやすい。';
    if(role==='cleaning-brush') return '溝やすき間の汚れを、狙って落としやすい。';
    if(role==='cleaning') return '日常の拭き掃除をサッと済ませやすい。';
    if(role==='storage') return '物の定位置を作って、出しっぱなしを減らしやすい。';
    if(role==='charging') return '外出先の充電切れを避けやすい。';
    if(role==='cutting') return '切る・むく・刻む作業を手早く済ませやすい。';
    if(role==='strainer') return '細かいものをすくいながら、汁や油を切りやすい。';
    return '';
  }

  function sourceText(item){
    return [item?.itemName,item?.catchcopy,item?.itemCaption,item?.itemDescription]
      .filter(Boolean).join(' ').normalize('NFKC');
  }

  function concreteFacts(item,ctx){
    const t=sourceText(item);
    const out=[];
    const add=x=>{if(x && !out.includes(x)) out.push(x);};

    const exact=[
      [/(\d+)\s*組\s*(\d+)\s*枚/,(m)=>m[1]+'組'+m[2]+'枚セット'],
      [/(\d+)\s*枚(?:セット|入り)?/,(m)=>m[1]+'枚セット'],
      [/(\d+)\s*個(?:セット|入り)?/,(m)=>m[1]+'個セット'],
      [/マイクロファイバー/,()=> 'マイクロファイバー素材'],
      [/ほこり吸着|ホコリ吸着/,()=> 'ホコリを吸着しやすい仕様'],
      [/吸水|水分吸水/,()=> '水分を拭き取りやすい吸水タイプ'],
      [/速乾/,()=> '乾きやすい速乾タイプ'],
      [/もこもこ|ふわふわ/,()=> 'やわらかな起毛タイプ'],
      [/ミニ|コンパクト/,()=> '小回りの利くコンパクトサイズ'],
      [/手にはめ|手袋|グローブ|ミトン/,()=> '手にはめて使うタイプ'],
      [/網戸|あみ戸|アミ戸/,()=> '網戸掃除向け'],
      [/伸縮/,()=> '伸縮して長さを調整できるタイプ'],
      [/柄付き|ハンドル/,()=> '持ち手付き'],
      [/省スペース|スリム/,()=> '省スペース設計'],
      [/折りたたみ|折畳/,()=> '折りたたみ対応'],
      [/急速充電/,()=> '急速充電対応'],
      [/10000\s*mAh/i,()=> '10000mAh容量'],
      [/20000\s*mAh/i,()=> '20000mAh容量'],
      [/Type-?C|USB-?C/i,()=> 'USB-C対応'],
      [/防水|撥水/,()=> '水ぬれに配慮した仕様'],
      [/保温|保冷/,()=> '保温・保冷用途に対応'],
      [/ステンレス/,()=> 'ステンレス素材'],
      [/日本製/,()=> '日本製表記あり']
    ];
    for(const [re,fn] of exact){
      const m=t.match(re);
      if(m) add(fn(m));
      if(out.length>=4) break;
    }

    if(out.length<3){
      const specs=t.match(/\b\d+(?:\.\d+)?\s?(?:cm|mm|ml|mL|L|W|g|kg)\b/gi)||[];
      for(const s of specs){add(s.replace(/\s+/g,'')); if(out.length>=4) break;}
    }

    if(out.length<2 && ctx?.benefit) add(ctx.benefit.replace(/[。！!]+$/,''));
    return out.slice(0,4);
  }

  function specificUse(item,ctx){
    const t=sourceText(item);
    const role=String(ctx?._role||'');
    if(role==='cleaning-glove'){
      if(/家具|棚/.test(t)) return '家具や棚など、指先でなぞれる場所のホコリ取りに使いやすい。';
      return '手でなぞるように、細かい場所のホコリを取りたいときに使いやすい。';
    }
    if(/網戸|あみ戸|アミ戸/.test(t)) return '網戸の目に沿って、ホコリや汚れを取りたいときに使いやすい。';
    if(role==='cleaning-mop'){
      if(/ハンディ/.test(t)) return '棚上や家具まわりなど、手元でサッと掃除したい場所に使いやすい。';
      return '床や広い面をまとめて掃除したいときに使いやすい。';
    }
    if(role==='cleaning-brush') return /すき間|隙間|溝/.test(t)
      ?'すき間や溝に入り込んだ汚れを狙って落としたいときに使いやすい。'
      :'細かい凹凸の汚れをブラシでかき出したいときに使いやすい。';
    if(/クロス|マイクロファイバー|ダスター/.test(t) && /掃除|お掃除|ほこり|ホコリ|吸水|拭/.test(t)){
      const count=(t.match(/(\d+)\s*枚/)||[])[1];
      if(count && +count>=5 && /速乾/.test(t)) return count+'枚セットで、洗い替えしながら日常の拭き掃除に回しやすい。';
      if(/吸水|水分吸水/.test(t) && /ミニ|コンパクト/.test(t)) return '小さな場所のホコリ取りと、水滴・水分の拭き取りを1枚で済ませやすい。';
      if(/吸水|水分吸水/.test(t)) return 'ホコリ取りだけでなく、水滴や水分の拭き取りにも使いやすい。';
      if(/速乾/.test(t)) return '洗って乾かしながら、繰り返し拭き掃除に使いやすい。';
      if(/ミニ|コンパクト/.test(t)) return '机まわりや小さな場所の、ちょこっと拭き掃除に使いやすい。';
      return '日常のホコリ取りや拭き掃除に使いやすい。';
    }
    if(role==='cleaning'){
      return '日常のホコリ取りや拭き掃除に使いやすい。';
    }
    if(role==='storage') return /スリム|隙間|すき間/.test(t)
      ?'限られたすき間を使って、物の定位置を作りたいときに向く。'
      :'散らかりやすい物をまとめて、戻す場所を決めたいときに向く。';
    if(role==='charging') return /モバイルバッテリー/.test(t)
      ?'外出先でスマホの充電を補いたいときに使うアイテム。'
      :'充電時間や配線の手間を減らしたいときに使うアイテム。';
    if(role==='cutting') return '下ごしらえの切る・むく・刻む作業を短くしたいときに使いやすい。';
    if(role==='strainer') return '鍋の中の細かい具やアク、揚げカスをすくいたいときに使いやすい。';
    return ctx?.bridge||'商品名と仕様を確認しながら、使う場面に合うか判断したい商品。';
  }

  function specificAudience(item,ctx){
    const t=sourceText(item);
    const role=String(ctx?._role||'');
    if(role==='cleaning-glove') return /家具|棚/.test(t)
      ?'家具や棚の細かい部分を、手早くホコリ取りしたい人'
      :'手にはめて細かい場所を掃除したい人';
    if(/網戸|あみ戸|アミ戸/.test(t)) return '網戸掃除を手早く済ませたい人';
    if(/クロス|マイクロファイバー|ダスター/.test(t) && /掃除|お掃除|ほこり|ホコリ|吸水|拭/.test(t)){
      const count=(t.match(/(\d+)\s*枚/)||[])[1];
      if(count && +count>=5 && /速乾/.test(t)) return '洗い替え用のクロスを複数枚そろえて、こまめに掃除したい人';
      if(/吸水|水分吸水/.test(t) && /ミニ|コンパクト/.test(t)) return '小さな場所のホコリと水分を、1枚でサッと拭き取りたい人';
      if(/吸水|水分吸水/.test(t)) return 'ホコリ取りと水分の拭き取りを1枚で済ませたい人';
      if(/速乾/.test(t)) return '洗って繰り返し使いやすいクロスを探している人';
      if(/ミニ|コンパクト/.test(t)) return '小さな場所をこまめに拭き掃除したい人';
    }
    if(role==='cleaning-mop' && /ハンディ/.test(t)) return '家具や棚上をサッと掃除したい人';
    if(role==='cleaning-brush' && /すき間|隙間|溝/.test(t)) return 'すき間や溝の汚れを狙って落としたい人';
    return ctx?.audience||'商品の用途を確認して選びたい人';
  }

  function productSpecificSections(item,ctx){
    return {
      lead:featureLead(item,ctx),
      use:specificUse(item,ctx),
      facts:concreteFacts(item,ctx),
      audience:specificAudience(item,ctx)
    };
  }

  function analysisPoints(item,keyword){
    const ctx=api.painContext(item?.itemName||'',keyword,[(item?.catchcopy||''),(item?.itemCaption||''),(item?.itemDescription||'')].filter(Boolean).join(' '),item?.genrePath||item?.genreName||'');
    const out=[];
    const r=+item?.reviewCount||0;
    const v=+item?.reviewAverage||0;
    pushUnique(out,ctx?.benefit?.replace(/にぴったり$/,'')||'');
    if(r>=300) pushUnique(out,`レビュー${fmt(r)}件で安心材料が多い`);
    else if(r>=50) pushUnique(out,`レビュー${fmt(r)}件で比較しやすい`);
    if(v>=4.5&&r>=20) pushUnique(out,`★${v.toFixed(1)}の高評価`);
    pushUnique(out,factualBenefit(item));
    return out.slice(0,3);
  }

  function stableVariant(text,offset=0){
    const s=String(text||'');
    let h=0;
    for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0;
    return (h+offset)%5;
  }

  function openingText(item,ctx,offset=0){
    const point=(ctx?.points||[])[0]||'';
    const benefit=String(ctx?.benefit||'').replace(/[。！!]+$/,'');
    const audience=String(ctx?.audience||'').replace(/[。！!]+$/,'');
    const bridge=String(ctx?.bridge||'').trim();
    const hook=String(ctx?.hook||'').trim();
    const fact=factualBenefit(item);
    switch(stableVariant(item?.itemName||'',offset)){
      case 0:
        return [hook,bridge].filter(Boolean).join('\n\n');
      case 1:
        return [benefit?`これ、${benefit}。`:'',bridge].filter(Boolean).join('\n\n');
      case 2:
        return [point?`「${point}」なら、ここが使いどころ。`:'',bridge].filter(Boolean).join('\n\n');
      case 3:
        return [audience?`${audience}へ。`:'',hook].filter(Boolean).join('\n\n');
      default:
        return [fact?`${fact}。`:'',hook||bridge].filter(Boolean).join('\n\n');
    }
  }
  function makeRoomCopy(item,keyword){
    const ctx=api.painContext(item?.itemName||'',keyword,[(item?.catchcopy||''),(item?.itemCaption||''),(item?.itemDescription||'')].filter(Boolean).join(' '),item?.genrePath||item?.genreName||'');
    if(unsafeToPromote(ctx)) return safeHoldCopy(item);

    const pr=fmt(item?.itemPrice);
    const r=+item?.reviewCount||0;
    const v=+item?.reviewAverage||0;
    const title=shortTitle(item?.itemName||'');
    const s=productSpecificSections(item,ctx);
    const facts=s.facts.map(x=>'✔ '+x).join('\n');
    const reviewLine=r>=10?'\nレビュー：★'+v.toFixed(1)+'（'+fmt(r)+'件）':'';
    return s.lead+'\n\n'+s.use+'\n\n商品の特徴👇\n'+facts+'\n\n向いている人👇\n・'+s.audience+'\n\n'+title+'\n価格：'+pr+'円'+reviewLine;
  }

  function makeThreadsCopy(item,keyword){
    const ctx=api.painContext(item?.itemName||'',keyword,[(item?.catchcopy||''),(item?.itemCaption||''),(item?.itemDescription||'')].filter(Boolean).join(' '),item?.genrePath||item?.genreName||'');
    if(unsafeToPromote(ctx)) return safeHoldCopy(item);

    const pr=fmt(item?.itemPrice);
    const title=shortTitle(item?.itemName||'');
    const s=productSpecificSections(item,ctx);
    const fact=s.facts[0]||ctx?.benefit||'';
    return s.lead+'\n\n'+s.use+'\n✔ '+fact+'\n\n'+title+'\n'+pr+'円';
  }

  function makeInstagramCopy(item,keyword){
    const ctx=api.painContext(item?.itemName||'',keyword,[(item?.catchcopy||''),(item?.itemCaption||''),(item?.itemDescription||'')].filter(Boolean).join(' '),item?.genrePath||item?.genreName||'');
    if(unsafeToPromote(ctx)) return safeHoldCopy(item);

    const pr=fmt(item?.itemPrice);
    const title=shortTitle(item?.itemName||'');
    const s=productSpecificSections(item,ctx);
    const facts=s.facts.map(x=>'✔ '+x).join('\n');
    return s.lead+'\n\n'+s.use+'\n\n'+facts+'\n\nおすすめしたい人👇\n'+s.audience+'\n\n'+title+'\n価格：'+pr+'円';
  }

  api.promoTerms=promoTerms;
  api.shortTitle=shortTitle;
  api.reviewBenefit=reviewBenefit;
  api.benefits=benefits;
  api.analysisPoints=analysisPoints;
  api.makeRoomCopy=makeRoomCopy;
  api.makeThreadsCopy=makeThreadsCopy;
  api.makeInstagramCopy=makeInstagramCopy;
})(typeof window==='undefined'?null:window);

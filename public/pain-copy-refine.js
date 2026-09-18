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
    if(v>=4.5&&r>=30&&!social.includes('高評価')) pushUnique(out,\`★\${v.toFixed(1)}の高評価\`);
    pushUnique(out,factualBenefit(item));
    return out.slice(0,3);
  }

  function unsafeToPromote(ctx){
    const role=String(ctx?._role||'');
    const audience=String(ctx?.audience||'');
    return role==='safe-fallback' ||
      /商品の用途を確認|用途に合うものをきちんと選びたい|商品情報やレビューを比較/.test(audience);
  }

  function safeHoldCopy(item){
    const title=shortTitle(item?.itemName||'');
    const pr=fmt(item?.itemPrice);
    return 'この商品は、取得できた商品情報だけでは用途を十分に特定できませんでした。\\n\\n'
      +'誤った紹介文を出さないため、自動投稿文の生成を止めています。\\n\\n'
      +title+'\\n価格：'+pr+'円\\n\\n'
      +'楽天の商品ページで用途・仕様を確認してから紹介してください。';
  }

  function roleLead(ctx){
    const role=String(ctx?._role||'');
    if(role==='cleaning-glove') return '手にはめて使えるから、クロスでは拭きにくい細かい場所の掃除に。';
    if(role==='cleaning-mop') return '広い面や手が届きにくい場所を、まとめて掃除したいときに。';
    if(role==='cleaning-brush') return 'クロスでは届きにくい溝やすき間の汚れを、狙って落としたいときに。';
    if(role==='cleaning') return 'ホコリや水分をサッと拭き取りたい、日常のちょこっと掃除に。';
    if(role==='storage') return '物の定位置を作って、出しっぱなしを減らしたいときに。';
    if(role==='charging') return '外出先の充電切れを避けたいときに。';
    if(role==='cutting') return '切る・むく・刻む作業を手早く済ませたいときに。';
    if(role==='strainer') return '細かいものをすくいながら、汁や油を切りたいときに。';
    return '';
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
    const bullets=benefits(item,ctx).map(x=>'✔ '+x).join('\\n');
    const recommend=(ctx?.points||[]).slice(0,3).map(x=>'・'+x).join('\\n');
    const reviewLine=r>=10?'\\nレビュー：★'+v.toFixed(1)+'（'+fmt(r)+'件）':'';
    const lead=roleLead(ctx);
    const intro=[lead,ctx?.hook,ctx?.bridge].filter(Boolean).join('\\n\\n');
    return intro+'\\n\\n'+bullets+'\\n\\n'+title+'\\n価格：'+pr+'円'+reviewLine+'\\n\\n使いたい場面👇\\n'+recommend;
  }

  function makeThreadsCopy(item,keyword){
    const ctx=api.painContext(item?.itemName||'',keyword,[(item?.catchcopy||''),(item?.itemCaption||''),(item?.itemDescription||'')].filter(Boolean).join(' '),item?.genrePath||item?.genreName||'');
    if(unsafeToPromote(ctx)) return safeHoldCopy(item);

    const pr=fmt(item?.itemPrice);
    const title=shortTitle(item?.itemName||'');
    const point=(ctx?.points||[])[0]||ctx?.benefit||'';
    const lead=roleLead(ctx)||openingText(item,ctx,1);
    return lead+'\\n\\n'+(ctx?.benefit||'')+'\\n✔ '+point+'\\n\\n'+title+'\\n'+pr+'円';
  }

  function makeInstagramCopy(item,keyword){
    const ctx=api.painContext(item?.itemName||'',keyword,[(item?.catchcopy||''),(item?.itemCaption||''),(item?.itemDescription||'')].filter(Boolean).join(' '),item?.genrePath||item?.genreName||'');
    if(unsafeToPromote(ctx)) return safeHoldCopy(item);

    const pr=fmt(item?.itemPrice);
    const title=shortTitle(item?.itemName||'');
    const points=(ctx?.points||[]).slice(0,3).map(x=>'✔ '+x).join('\\n');
    const lead=roleLead(ctx)||openingText(item,ctx,2);
    return lead+'\\n\\n'+(ctx?.bridge||'')+'\\n\\n'+points+'\\n\\n'+title+'\\n価格：'+pr+'円';
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

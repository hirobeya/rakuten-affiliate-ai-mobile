(function(root){
  'use strict';
  if(!root||!root.UrenaviPainCopy) return;
  const api=root.UrenaviPainCopy;
  const grounding=root.UrenaviBenefitGrounding||null;
  const norm=v=>String(v||'').normalize('NFKC').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  const sourceOf=item=>[item?.itemName,item?.itemCaption,item?.catchcopy,item?.genrePath,item?.genreName].filter(Boolean).map(norm).join(' ');
  const RISK_TERMS=[
    '安心','快適','便利','時短','ラク','楽になる','手間','負担','ストレス','片付','整う','整え','省スペース',
    '持ち運び','持ち運ぶ','使いやす','選びやす','置き場所','収納場所','充電する回数','充電の頻度',
    '交換用フィルターを用意','用途に合わせて','手持ちの機器','お手入れ','蒸れにく','守る','防ぐ','備え','助け',
    '回数を減ら','頻度を減ら','作業が減','時間を減ら','家事が楽','暮らしが楽'
  ];
  const SAFE_SCAFFOLD=[
    /^価格：/,/^※アフィリエイト広告を利用しています$/, /^確認できる(?:ポイント|仕様)/,
    /^✓\s*/,/^「.+」と確認できます。$/, /^商品名には「.+」と明記されています。$/
  ];
  function unsupportedTerms(text,item){
    const t=norm(text),source=sourceOf(item);
    return RISK_TERMS.filter(term=>t.includes(term)&&!source.includes(term));
  }
  function lineIsSafe(line,item){
    const s=norm(line);
    if(!s) return true;
    if(SAFE_SCAFFOLD.some(re=>re.test(s))) return true;
    if(grounding&&typeof grounding.validateBenefitCandidate==='function'){
      const hits=unsupportedTerms(s,item);
      if(hits.length) return false;
    }
    return unsupportedTerms(s,item).length===0;
  }
  function safeLead(item,identity=''){
    const id=norm(identity);
    const source=sourceOf(item);
    if(id&&source.includes(id)) return id+'の仕様を確認して選びたい方に。';
    return '商品名にある仕様を確認して選びたい方に。';
  }
  function guardCopy(item,text,{identity=''}={}){
    const lines=String(text||'').split('\n');
    let removed=0;
    const kept=[];
    for(const line of lines){
      if(lineIsSafe(line,item)) kept.push(line);
      else removed++;
    }
    while(kept.length&&kept[0].trim()==='') kept.shift();
    if(removed&&kept.length){
      const first=norm(kept[0]);
      if(/^「|^商品名には|^確認できる|^✓|^価格：|^※/.test(first)) kept.unshift('',safeLead(item,identity));
    }
    return kept.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  function wrap(name,identityIndex){
    const original=api[name];
    if(typeof original!=='function'||original.__unsupportedBenefitGuarded) return;
    const wrapped=function(...args){
      const item=args[0]||{};
      const out=original.apply(this,args);
      const identity=identityIndex==null?'':args[identityIndex];
      return guardCopy(item,out,{identity});
    };
    wrapped.__unsupportedBenefitGuarded=true;
    api[name]=wrapped;
  }
  wrap('buildValidatedProductPost',1);
  wrap('buildGroundedBenefitPost',1);
  api.guardUnsupportedBenefits=guardCopy;
  api.unsupportedBenefitTerms=unsupportedTerms;
})(typeof window==='undefined'?globalThis:window);

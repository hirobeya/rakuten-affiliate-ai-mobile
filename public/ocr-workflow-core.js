(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.OcrWorkflow=factory();})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const text=v=>typeof v==='string'?v.normalize('NFKC').replace(/\u0000/g,'').trim():'';
  const risky=/(?:楽天.{0,3}(?:1位|一位)|最強|必ず|絶対|治療|治る|改善|予防|半額|送料無料|クーポン|ポイント|ご購入|個目|個あたり)/;
  function contains(block,value){let at=block.indexOf(value);while(at>=0){const before=block[at-1]||'',after=block[at+value.length]||'';if(!(/[0-9.,]/.test(before)&&/^[0-9.,]/.test(value))&&!(/[0-9.,]$/.test(value)&&/[0-9.,]/.test(after)))return true;at=block.indexOf(value,at+1);}return false;}
  function sanitize(data,source){
    source=text(source);const warnings=[];const candidates=[];
    for(const raw of (Array.isArray(data?.candidates)?data.candidates:[]).slice(0,3)){
      const block=text(raw.sourceText);const name=text(raw.productName);
      if(!block||!source.includes(block)||!name||name.length>240||!block.includes(name)){warnings.push('原文と照合できない候補を除外しました。商品ごとに情報を取り込んでください。');continue;}
      const c={productName:name,sourceText:block,facts:[],rank:candidates.length+1};
      for(const key of ['price','rating','reviewCount','ranking']){
        const value=text(raw[key]);c[key]=value&&value.length<=80&&contains(block,value)?value:'';
        if(value&&!c[key])warnings.push(name+'：'+key+'を原文と照合できませんでした。');
      }
      c.facts=(Array.isArray(raw.facts)?raw.facts:[]).map(text).filter(v=>v&&v.length<=180&&block.includes(v)&&!risky.test(v));
      c.facts=[...new Set(c.facts)].slice(0,6);
      c.unknowns=['用途への適合','サイズ・対応機種','現在の価格・在庫','送料・購入条件'];
      candidates.push(c);
    }
    return {candidates,recommendedIndex:null,recommendationReason:'目的と条件を見比べて、紹介する商品を選んでください。',roomCopy:'',warnings:[...new Set(warnings)]};
  }
  function draft(candidate,checkedFacts){
    const facts=(Array.isArray(checkedFacts)?checkedFacts:[]).filter(v=>candidate.facts.includes(v));
    if(!facts.length)return '';
    const name=risky.test(candidate.productName)?'':candidate.productName;
    return [name,'商品説明で確認した特徴：',...facts.map(v=>'・'+v),'サイズや購入条件は商品ページでご確認ください。'].filter(Boolean).join('\n');
  }
  function compare(c){return ['price','rating','reviewCount','ranking'].map(k=>c[k]||'未確認');}
  return {sanitize,draft,compare,text};
});

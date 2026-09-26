(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.UrenaviFactSafety=api;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:this),function(){
  'use strict';

  const PROMO_RE=/楽天(?:市場)?(?:総合)?(?:ランキング)?\s*1位|ランキング|受賞|\d+冠|ご好評です|大好評|当店人気|大人気|クーポン|SALE|セール|OFF|オフ|半額|最安|送料無料|ポイント\d*倍|P\d+倍|当日発送|即日発送|発送/i;
  const CLAIM_RE=/改善|予防|防止|安全|安心|無害|保証|発火しない|燃えにくい|難燃|抗菌|除菌|殺菌|消臭|防臭|アレルギー|疲労|痛み|快眠|安眠|健康|小顔|引き締め|リフトアップ|治る|痩せる|若返/i;

  const MATERIALS=new Set([
    '本革','牛革','山羊革','羊革','豚革','合皮','人工皮革','レザー',
    'コットン','綿','綿100%','綿100％','ポリエステル','ナイロン',
    'アルミ','アルミニウム','ステンレス','シリコン','TPU','ABS',
    'ガラス','木製','セラミック'
  ]);

  const STANDARDS=new Set([
    'USB-C','USB C','USB-C対応','USB C対応','Type-C','Type C','Type-C対応','Type C対応','HDMI','DisplayPort','PD対応',
    'Qi','Qi2','Bluetooth','Wi-Fi','WiFi','4K','日本製'
  ]);

  const NUMERIC_UNIT_RE=/^(?:約)?\d+(?:[.,]\d+)?\s*(?:mAh|Ah|Wh|kWh|W|V|A|Hz|kHz|MHz|GHz|mm|cm|m|mg|g|kg|ml|mL|L|oz|インチ|inch|GB|MB|TB)$/i;
  const DIMENSION_RE=/^\d+(?:[.,]\d+)?\s*[x×X]\s*\d+(?:[.,]\d+)?(?:\s*[x×X]\s*\d+(?:[.,]\d+)?)?\s*(?:mm|cm|m)$/i;
  const STRUCTURED_COUNT_RE=/^(?:\d+\s*(?:枚|個|本|袋|箱|組|点|粒|錠|食|包)\s*(?:入|入り|セット|組)|\d+\s*セット)$/i;
  const MULTIPACK_RE=/^\d+\s*(?:枚|個|本|袋|粒|錠)\s*[x×X]\s*\d+\s*(?:枚|個|本|袋|粒|錠)(?:\s*(?:入|入り|セット))?$/i;
  const CONTENT_AMOUNT_RE=/^内容量\s*\d+(?:[.,]\d+)?\s*(?:mAh|Ah|Wh|kWh|W|V|A|Hz|kHz|MHz|GHz|mm|cm|m|mg|g|kg|ml|mL|L|oz|GB|MB|TB)$/i;
  const MATERIAL_WITH_PERCENT_RE=/^(?:綿|コットン|ポリエステル|ナイロン)\s*100[%％]$/i;
  const SOURCE_SPLIT_RE=/[\s　【】〖〗（）()「」『』\[\]［］{}｛｝<>＜＞〈〉《》〔〕・／/\\|｜,:：;；!！?？★☆※]+/;
  const MATERIAL_PREFIX_MODIFIERS=new Set(['フェイク']);
  const MATERIAL_SUFFIX_MODIFIERS=new Set(['調','風','タッチ','柄','ライク','プリント']);

  const UNSUPPORTED_BENEFIT_TERMS=[
    '安心','快適','便利','時短','手間','負担','ストレス','省スペース',
    '片付き','片付く','整う','持ち運び','持ち運ぶ','使いやす','選びやす',
    '置き場所','収納場所','充電する回数','充電の頻度','交換用フィルターを用意',
    '用途に合わせ','手持ちの機器','お手入れ','蒸れにく','守る','防ぐ','備え','助け',
    '回数を減ら','頻度を減ら','作業が減','時間を減ら','家事が楽','暮らしが楽','保温'
  ];

  const normalize=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
  const sourceTokens=s=>String(s||'').replace(/<[^>]*>/g,' ').split(SOURCE_SPLIT_RE).map(normalize).filter(Boolean);
  const TYPE_KNOWLEDGE=new Map();
  let VALUE_RULES={version:'none',concepts:[]};

  function isAllowedSpecFact(value){
    const x=normalize(value);
    if(!x) return false;
    if(PROMO_RE.test(x)||CLAIM_RE.test(x)) return false;
    if(DIMENSION_RE.test(x)||STRUCTURED_COUNT_RE.test(x)||MULTIPACK_RE.test(x)||CONTENT_AMOUNT_RE.test(x)||MATERIAL_WITH_PERCENT_RE.test(x)) return true;
    if(MATERIALS.has(x)||STANDARDS.has(x)) return true;
    return false;
  }

  function numericUnitKey(value){
    const x=normalize(value);
    const m=x.match(/^(?:内容量\s*)?\d+(?:[.,]\d+)?\s*(mAh|Ah|Wh|kWh|W|V|A|Hz|kHz|MHz|GHz|mm|cm|m|mg|g|kg|ml|mL|L|oz|インチ|inch|GB|MB|TB)$/i);
    return m?String(m[1]||'').toLowerCase():'';
  }

  function materialOccurrenceIsUnmodified(tokens,index){
    const prev=normalize(tokens[index-1]||'');
    const next=normalize(tokens[index+1]||'');
    return !MATERIAL_PREFIX_MODIFIERS.has(prev)&&!MATERIAL_SUFFIX_MODIFIERS.has(next);
  }

  function isAllowedSpecFactForEvidence(value,evidence){
    const x=normalize(value);
    if(!isAllowedSpecFact(x)) return false;
    if(!MATERIALS.has(x)) return true;
    const tokens=sourceTokens(evidence);
    const matches=[];
    for(let i=0;i<tokens.length;i++) if(tokens[i]===x) matches.push(i);
    if(!matches.length) return false;
    return matches.some(i=>materialOccurrenceIsUnmodified(tokens,i));
  }

  function filterAllowedSpecFacts(values){
    const input=(Array.isArray(values)?values:[])
      .map(raw=>({raw:String(raw||'').trim(),norm:normalize(raw)}))
      .filter(x=>x.raw&&x.norm&&isAllowedSpecFact(x.norm));
    const byUnit=new Map();
    for(const x of input){
      const key=numericUnitKey(x.norm);
      if(!key) continue;
      if(!byUnit.has(key)) byUnit.set(key,new Set());
      byUnit.get(key).add(x.norm.toLowerCase());
    }
    const ambiguousUnits=new Set([...byUnit.entries()].filter(([,set])=>set.size>1).map(([key])=>key));
    const countFacts=input.filter(x=>STRUCTURED_COUNT_RE.test(x.norm)||MULTIPACK_RE.test(x.norm));
    const ambiguousCounts=new Set(countFacts.map(x=>x.norm.toLowerCase())).size>1;
    const dimensionFacts=input.filter(x=>DIMENSION_RE.test(x.norm));
    const ambiguousDimensions=new Set(dimensionFacts.map(x=>x.norm.toLowerCase())).size>1;
    const out=[],seen=new Set();
    for(const x of input){
      const unit=numericUnitKey(x.norm);
      if(unit&&ambiguousUnits.has(unit)) continue;
      if(ambiguousCounts&&(STRUCTURED_COUNT_RE.test(x.norm)||MULTIPACK_RE.test(x.norm))) continue;
      if(ambiguousDimensions&&DIMENSION_RE.test(x.norm)) continue;
      const key=x.norm.toLowerCase();
      if(seen.has(key)) continue;
      seen.add(key);
      out.push(x.raw);
    }
    return out;
  }

  function filterAllowedTitleFacts(titleTokens,candidates=titleTokens){
    const source=(Array.isArray(titleTokens)?titleTokens:[]).map(x=>String(x||'').trim()).filter(Boolean);
    const sourceNorm=source.map(normalize);
    const candidateSet=new Set((Array.isArray(candidates)?candidates:[]).map(normalize).filter(Boolean));
    const accepted=[];
    for(let i=0;i<source.length;i++){
      const raw=source[i], x=sourceNorm[i];
      if(!candidateSet.has(x)||!isAllowedSpecFact(x)) continue;
      if(MATERIALS.has(x)&&!materialOccurrenceIsUnmodified(sourceNorm,i)) continue;
      accepted.push(raw);
    }
    return filterAllowedSpecFacts(accepted);
  }

  function sourceText(item){
    return [item?.itemName,item?.itemCaption,item?.catchcopy,item?.genrePath,item?.genreName]
      .filter(Boolean).map(normalize).join(' ');
  }

  function aiSourceText(item){
    return [item?.itemName,item?.itemCaption].filter(Boolean).map(normalize).join(' ');
  }

  function unsupportedBenefitTerms(text,item){
    const t=normalize(text),source=sourceText(item);
    return UNSUPPORTED_BENEFIT_TERMS.filter(term=>t.includes(term)&&!source.includes(term));
  }

  function safeIdentityLead(item,identity=''){
    const id=normalize(identity),source=sourceText(item);
    if(id&&source.includes(id)) return id+'の仕様を確認して選びたい方に。';
    return '商品名にある仕様を確認して選びたい方に。';
  }

  function preserveGroundedQuote(line,item){
    const m=String(line||'').match(/「([^」]{1,120})」/);
    if(!m) return '';
    const fact=normalize(m[1]);
    return fact&&sourceText(item).includes(fact)?'「'+fact+'」と確認できます。':'';
  }

  function guardUnsupportedBenefitCopy(item,text,{identity=''}={}){
    const input=String(text||'');
    if(!input) return '';
    const lines=input.split('\n');
    const out=[];
    let removed=0;
    for(const line of lines){
      const hits=unsupportedBenefitTerms(line,item);
      if(!hits.length){out.push(line);continue;}
      removed++;
      const grounded=preserveGroundedQuote(line,item);
      if(grounded) out.push(grounded);
    }
    while(out.length&&!out[0].trim()) out.shift();
    if(removed&&out.length){
      const first=normalize(out[0]);
      if(/^「|^商品名には|^確認できる|^✓|^価格：|^※/.test(first)) out.unshift('',safeIdentityLead(item,identity));
    }
    return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }

  function setValueRankingRules(value){
    const concepts=Array.isArray(value?.concepts)?value.concepts.filter(x=>x&&typeof x==='object'):[];
    VALUE_RULES={version:String(value?.version||'unknown'),concepts};
    return VALUE_RULES;
  }

  function safeKnowledgeText(value){
    const x=normalize(value);
    if(!x||x.length>48||PROMO_RE.test(x)||CLAIM_RE.test(x)||/[0-9０-９]/.test(x)) return '';
    if(UNSUPPORTED_BENEFIT_TERMS.some(term=>x.includes(term))) return '';
    return x;
  }

  function rememberTypeKnowledge(knowledge){
    const productType=normalize(knowledge?.productType||'');
    if(!productType||knowledge?.usage!=='ranking_only') return false;
    const readerSituations=(Array.isArray(knowledge.readerSituations)?knowledge.readerSituations:[]).map(safeKnowledgeText).filter(Boolean).slice(0,3);
    const decisionAxes=(Array.isArray(knowledge.decisionAxes)?knowledge.decisionAxes:[]).map(safeKnowledgeText).filter(Boolean).slice(0,3);
    if(!readerSituations.length&&!decisionAxes.length) return false;
    TYPE_KNOWLEDGE.set(productType.toLocaleLowerCase('ja-JP'),{productType,readerSituations,decisionAxes,usage:'ranking_only'});
    return true;
  }

  function getTypeKnowledge(productType){
    return TYPE_KNOWLEDGE.get(normalize(productType).toLocaleLowerCase('ja-JP'))||null;
  }

  function patternMatch(pattern,text){
    if(!pattern) return false;
    try{return new RegExp(String(pattern),'i').test(text);}catch{return false;}
  }

  function conceptMatch(concept,fact){
    const f=normalize(fact);
    if((concept.factTerms||[]).some(term=>f.toLocaleLowerCase('ja-JP').includes(normalize(term).toLocaleLowerCase('ja-JP')))) return true;
    if(patternMatch(concept.factPattern,f)||patternMatch(concept.unitPattern,f)) return true;
    return false;
  }

  function axisMatch(concept,knowledge){
    const axes=[...(knowledge?.decisionAxes||[]),...(knowledge?.readerSituations||[])].map(normalize).join(' ');
    return (concept.axisTerms||[]).some(term=>axes.includes(normalize(term)));
  }

  function rankCopyFacts(item,facts,knowledge){
    const source=aiSourceText(item);
    const safe=(Array.isArray(facts)?facts:[])
      .map((raw,index)=>({raw:normalize(raw),index}))
      .filter(x=>x.raw&&x.raw.length<=96&&source.includes(x.raw)&&!PROMO_RE.test(x.raw)&&!CLAIM_RE.test(x.raw))
      .filter((x,i,a)=>a.findIndex(y=>y.raw===x.raw)===i);
    const concepts=Array.isArray(VALUE_RULES.concepts)?VALUE_RULES.concepts:[];
    return safe.map(entry=>{
      let best=null,bestScore=-1;
      for(const concept of concepts){
        if(!conceptMatch(concept,entry.raw)) continue;
        let score=Number(concept.baseScore)||20;
        if(axisMatch(concept,knowledge)) score+=55;
        if(/[0-9０-９]/.test(entry.raw)) score+=8;
        score+=Math.min(12,Math.floor(entry.raw.length/6));
        if(score>bestScore){bestScore=score;best=concept;}
      }
      if(!best){
        bestScore=10+Math.min(15,Math.floor(entry.raw.length/5))+(/[0-9０-９]/.test(entry.raw)?6:0);
      }
      return {...entry,score:bestScore,concept:best};
    }).sort((a,b)=>b.score-a.score||a.index-b.index);
  }

  function knowledgeLead(identity,knowledge){
    const id=normalize(identity);
    const situation=(knowledge?.readerSituations||[]).map(safeKnowledgeText).find(Boolean);
    if(situation) return situation+'で'+id+'を選ぶなら。';
    const axis=(knowledge?.decisionAxes||[]).map(safeKnowledgeText).find(Boolean);
    if(axis) return id+'を選ぶとき、'+axis+'を比べたいなら。';
    return '';
  }

  function buildRankedTypeKnowledgePost(item,identity,facts=[]){
    const id=normalize(identity),source=aiSourceText(item),knowledge=getTypeKnowledge(id);
    if(!knowledge||!id||!source.includes(id)) return '';
    const ranked=rankCopyFacts(item,facts,knowledge);
    if(!ranked.length) return '';
    const lead=knowledgeLead(id,knowledge);
    if(!lead) return '';
    const lines=[lead];
    for(const row of ranked.slice(0,2)){
      lines.push('','「'+row.raw+'」と確認できます。');
      const decision=safeKnowledgeText(row.concept?.decisionLine||'');
      if(decision) lines.push(decision);
    }
    lines.push('','確認できるポイント👇');
    for(const row of ranked.slice(0,3)) lines.push('✓ '+row.raw);
    const price=Number(item?.itemPrice);
    if(Number.isFinite(price)&&price>0) lines.push('','価格：'+new Intl.NumberFormat('ja-JP').format(price)+'円');
    lines.push('','※アフィリエイト広告を利用しています');
    return lines.join('\n').slice(0,500);
  }

  return {
    PROMO_RE,CLAIM_RE,MATERIALS,STANDARDS,
    NUMERIC_UNIT_RE,DIMENSION_RE,STRUCTURED_COUNT_RE,MULTIPACK_RE,CONTENT_AMOUNT_RE,MATERIAL_WITH_PERCENT_RE,
    normalize,sourceTokens,isAllowedSpecFact,isAllowedSpecFactForEvidence,numericUnitKey,filterAllowedSpecFacts,filterAllowedTitleFacts,
    UNSUPPORTED_BENEFIT_TERMS,unsupportedBenefitTerms,guardUnsupportedBenefitCopy,sourceText,
    setValueRankingRules,rememberTypeKnowledge,getTypeKnowledge,rankCopyFacts,buildRankedTypeKnowledgePost
  };
});

(function(root){
  'use strict';
  if(!root||typeof document==='undefined') return;
  const safety=root.UrenaviFactSafety;

  function captureTypeKnowledge(payload){
    try{
      const knowledge=payload?.typeKnowledge?.knowledge;
      const valid=payload?.validation?.productType?.valid===true;
      if(valid&&knowledge) safety.rememberTypeKnowledge(knowledge);
    }catch(_){}
  }

  function installFetchCapture(){
    if(typeof root.fetch!=='function'||root.fetch.__urenaviTypeKnowledgeCapture) return;
    const original=root.fetch.bind(root);
    const wrapped=async function(input,init){
      const response=await original(input,init);
      try{
        const url=typeof input==='string'?input:String(input?.url||'');
        if(/\/api\/room-ai(?:\?|$)/.test(url)&&response?.ok){
          const payload=await response.clone().json();
          captureTypeKnowledge(payload);
        }
      }catch(_){}
      return response;
    };
    wrapped.__urenaviTypeKnowledgeCapture=true;
    wrapped.__originalFetch=original;
    root.fetch=wrapped;
  }

  installFetchCapture();
  if(typeof root.fetch==='function'){
    root.fetch('/value-ranking-rules.json',{cache:'no-store'})
      .then(r=>r.ok?r.json():null)
      .then(data=>{if(data) safety.setValueRankingRules(data);})
      .catch(()=>{});
  }

  function install(){
    const api=root.UrenaviPainCopy;
    if(!api||!safety||typeof safety.guardUnsupportedBenefitCopy!=='function') return false;
    const wrap=(name,identityIndex)=>{
      const original=api[name];
      if(typeof original!=='function'||original.__unsupportedBenefitGuarded) return false;
      const wrapped=function(...args){
        const item=args[0]||{};
        const identity=identityIndex==null?'':args[identityIndex];
        let output='';
        if(name==='buildValidatedProductPost'){
          output=safety.buildRankedTypeKnowledgePost(item,identity,args[2]||[]);
        }
        if(!output) output=original.apply(this,args);
        return safety.guardUnsupportedBenefitCopy(item,output,{identity});
      };
      wrapped.__unsupportedBenefitGuarded=true;
      api[name]=wrapped;
      return true;
    };
    let changed=false;
    changed=wrap('buildValidatedProductPost',1)||changed;
    changed=wrap('buildGroundedBenefitPost',1)||changed;
    changed=wrap('makeRoomCopy',null)||changed;
    changed=wrap('makeThreadsCopy',null)||changed;
    changed=wrap('makeInstagramCopy',null)||changed;
    return changed || Boolean(api.buildValidatedProductPost?.__unsupportedBenefitGuarded);
  }
  if(install()) return;
  const timer=setInterval(()=>{if(install()) clearInterval(timer);},25);
  setTimeout(()=>clearInterval(timer),5000);
})(typeof window==='undefined'?null:window);

'use strict';

const {validateAiExtraction}=require('./room-ai');
const {sourceAgreementIdentity}=require('./source-agreement-identity');
const {evidenceBackedLeadingIdentity}=require('./local-semantic-composer');
const localTypeData=require('../data/local-product-types.json');

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

function accessoryScoped(title,value){
  const t=normalize(title),v=normalize(value);
  const at=t.indexOf(v);
  if(at<0) return true;
  const before=t.slice(Math.max(0,at-10),at);
  const after=t.slice(at+v.length,Math.min(t.length,at+v.length+14));
  return /(?:交換用|替え)\s*$/.test(before)
    || /^\s*(?:用|専用)\s*(?:ケース|カバー|ポーチ|ホルダー|フィルター|アダプター|ケーブル|交換|替え)/.test(after);
}

function setComponentScoped(title,caption,value){
  const t=normalize(title),c=normalize(caption),v=normalize(value);
  if(!t||!c||!v) return false;
  if(!/(?:セット|キット)/.test(t)||/(?:セット|キット)/.test(v)) return false;
  const marker=c.search(/(?:セット内容|内容物|付属品|同梱品)/);
  if(marker<0) return false;
  const window=c.slice(marker,Math.min(c.length,marker+220));
  const at=window.indexOf(v);
  if(at<0) return false;
  const before=window.slice(Math.max(0,at-18),at);
  const after=window.slice(at+v.length,Math.min(window.length,at+v.length+18));
  return /(?:セット内容|内容物|付属品|同梱品|[（(])/.test(before)
    || /(?:本体|[）)]|、|,)/.test(after);
}

function commonSuffix(a,b){
  const x=[...normalize(a)],y=[...normalize(b)];
  let n=0;
  while(n<x.length&&n<y.length&&x[x.length-1-n].toLowerCase()===y[y.length-1-n].toLowerCase()) n++;
  return x.slice(x.length-n).join('');
}

function longestCommonSubstring(a,b){
  const x=[...normalize(a).toLocaleLowerCase('ja-JP')];
  const y=[...normalize(b).toLocaleLowerCase('ja-JP')];
  if(!x.length||!y.length) return '';
  const dp=new Array(y.length+1).fill(0);
  let bestLength=0,bestEnd=0;
  for(let i=1;i<=x.length;i++){
    for(let j=y.length;j>=1;j--){
      if(x[i-1]===y[j-1]){
        dp[j]=dp[j-1]+1;
        if(dp[j]>bestLength){bestLength=dp[j];bestEnd=i;}
      }else dp[j]=0;
    }
  }
  return x.slice(bestEnd-bestLength,bestEnd).join('');
}

function validateCandidate(item,title,caption,value,version,matchIndex){
  if(!value||accessoryScoped(title,value)||setComponentScoped(title,caption,value)) return null;
  const raw={productType:{value,source:'itemName',evidence:value},features:[],sellingPoints:[],confidence:'high'};
  const validation=validateAiExtraction(raw,{itemName:title,itemCaption:caption},{imageAvailable:false});
  if(validation?.productType?.valid!==true||!['simple','simple_partial'].includes(validation.mode)) return null;
  return {raw,validation,version,matchIndex,canonicalIdentity:value};
}

function repeatedSupport(tokens,candidate,suffixLength){
  const value=normalize(candidate);
  if(!value||suffixLength<1) return 0;
  const supporters=new Set();
  for(const token of tokens){
    const t=normalize(token);
    if(!t) continue;
    const suffix=commonSuffix(value,t);
    if([...suffix].length>=suffixLength) supporters.add(t.toLocaleLowerCase('ja-JP'));
  }
  return supporters.size;
}

function identityTokens(title){
  return normalize(title)
    .split(/[\s【】〖〗（）()「」『』\[\]{}・／/\\|｜,:：;；!！?？★☆※。&＆]+/)
    .map(normalize).filter(Boolean)
    .filter(token=>token.length>=2&&token.length<=28)
    .filter(token=>!/^\d+(?:\.\d+)?(?:[A-Za-z]+)?$/.test(token))
    .filter(token=>!/^[A-Z0-9_-]{4,}$/i.test(token));
}

const BLOCKED_IDENTITIES=new Set(['ケース','カバー','バッグ','商品','用品','グッズ','セット','タイプ','モデル','シリーズ','公式','ブランド']);
const BLOCKED_STEMS=new Set(['電動','充電','防水','撥水','軽量','小型','大型','日本','公式','限定','人気','収納','便利']);

function leadingCompoundFamily(item,title,caption,tokens,blocked){
  const first=normalize(tokens[0]);
  if(!first||first.length<4||first.length>24||blocked.has(first)) return null;
  if(/^(?:送料無料|限定|公式|セール|SALE|ランキング|ポイント|クーポン|お買い物)/i.test(first)) return null;

  const chars=[...first];
  let best=null;
  for(let length=Math.min(12,chars.length);length>=4;length--){
    const suffix=chars.slice(chars.length-length).join('');
    if(!suffix||/^[0-9A-Za-z._+-]+$/.test(suffix)) continue;
    const supporters=new Set();
    for(const token of tokens){
      const t=normalize(token);
      if(!t) continue;
      const exact=t.toLowerCase()===first.toLowerCase();
      const suffixMatch=t.toLowerCase().endsWith(suffix.toLowerCase());
      const internalMatch=length>=6&&t.toLowerCase().includes(suffix.toLowerCase());
      if(exact||suffixMatch||internalMatch) supporters.add(t.toLocaleLowerCase('ja-JP'));
    }
    if(supporters.size<2) continue;
    best={suffix,supportCount:supporters.size};
    break;
  }
  if(!best) return null;

  const validated=validateCandidate(item,title,caption,first,(localTypeData.version||'local-types')+'-leading-compound',0);
  if(!validated) return null;
  validated.identityHypothesis={
    method:'leading_compound_family',
    supportCount:best.supportCount,
    sharedSuffix:best.suffix,
    leading:true
  };
  return validated;
}

function leadingStemFamily(item,title,caption,tokens,blocked){
  const first=normalize(tokens[0]);
  if(!first||first.length<4||first.length>24||blocked.has(first)) return null;
  if(/^(?:送料無料|限定|公式|セール|SALE|ランキング|ポイント|クーポン|お買い物)/i.test(first)) return null;

  const chars=[...first];
  let best=null;
  for(let length=Math.min(10,chars.length-1);length>=2;length--){
    const prefix=chars.slice(0,length).join('');
    if(!prefix||BLOCKED_STEMS.has(prefix)||/^[0-9A-Za-z._+-]+$/.test(prefix)) continue;
    const supporters=new Set();
    for(const token of tokens){
      const t=normalize(token);
      if(!t) continue;
      if(t.toLocaleLowerCase('ja-JP').startsWith(prefix.toLocaleLowerCase('ja-JP'))){
        supporters.add(t.toLocaleLowerCase('ja-JP'));
      }
    }
    const minimumSupport=length>=3?3:4;
    if(supporters.size<minimumSupport) continue;
    best={prefix,supportCount:supporters.size};
    break;
  }
  if(!best) return null;

  const validated=validateCandidate(item,title,caption,first,(localTypeData.version||'local-types')+'-leading-stem',0);
  if(!validated) return null;
  validated.identityHypothesis={
    method:'leading_stem_family',
    supportCount:best.supportCount,
    sharedPrefix:best.prefix,
    leading:true
  };
  return validated;
}

function distributedLeadingFamily(item,title,caption,tokens,blocked){
  const first=normalize(tokens[0]);
  const chars=[...first];
  if(!first||chars.length<5||chars.length>18||blocked.has(first)) return null;
  if(/^(?:送料無料|限定|公式|セール|SALE|ランキング|ポイント|クーポン|お買い物)/i.test(first)) return null;
  if(/(?:株式会社|有限会社|合同会社|実業|工業|製作所|商店|ストア|ショップ)$/.test(first)) return null;

  const segments=[];
  for(const raw of tokens.slice(1)){
    const token=normalize(raw);
    if(!token||token===first||blocked.has(token)) continue;
    const common=longestCommonSubstring(first,token);
    const length=[...common].length;
    if(length<2) continue;
    const start=first.toLocaleLowerCase('ja-JP').indexOf(common.toLocaleLowerCase('ja-JP'));
    if(start<0) continue;
    if(!segments.some(x=>x.start===start&&x.length===length)){
      segments.push({value:common,start,length,token,blockedStem:BLOCKED_STEMS.has(common)});
    }
  }
  segments.sort((a,b)=>b.length-a.length||a.start-b.start);
  const chosen=[];
  for(const segment of segments){
    const end=segment.start+segment.length;
    const overlaps=chosen.some(x=>segment.start<x.start+x.length&&x.start<end);
    if(!overlaps) chosen.push(segment);
  }
  if(chosen.length<2||!chosen.some(x=>!x.blockedStem)) return null;
  const covered=chosen.reduce((sum,x)=>sum+x.length,0);
  const coverage=covered/chars.length;
  if(covered<4||coverage<0.5) return null;

  const validated=validateCandidate(item,title,caption,first,(localTypeData.version||'local-types')+'-distributed-leading',0);
  if(!validated) return null;
  validated.identityHypothesis={
    method:'distributed_leading_support',
    supportCount:chosen.length,
    coveredChars:covered,
    coverage:Number(coverage.toFixed(3)),
    supportSegments:chosen.map(x=>x.value),
    leading:true
  };
  return validated;
}

function strongerLeading(a,b){
  if(!a) return b||null;
  if(!b) return a;
  const as=Number(a.identityHypothesis?.supportCount)||0;
  const bs=Number(b.identityHypothesis?.supportCount)||0;
  if(as!==bs) return as>bs?a:b;
  const al=[...(a.identityHypothesis?.sharedSuffix||a.identityHypothesis?.sharedPrefix||'')].length;
  const bl=[...(b.identityHypothesis?.sharedSuffix||b.identityHypothesis?.sharedPrefix||'')].length;
  if(al!==bl) return al>bl?a:b;
  return a;
}

function leadingCompoundIdentity(item){
  const title=normalize(item?.itemName),caption=normalize(item?.itemCaption);
  if(!title) return null;
  return leadingCompoundFamily(item,title,caption,identityTokens(title),BLOCKED_IDENTITIES);
}

function repeatedLiteralIdentity(item){
  const title=normalize(item?.itemName),caption=normalize(item?.itemCaption);
  if(!title) return null;
  const tokens=identityTokens(title);
  const blocked=BLOCKED_IDENTITIES;

  const leading=strongerLeading(
    leadingCompoundFamily(item,title,caption,tokens,blocked),
    leadingStemFamily(item,title,caption,tokens,blocked)
  );
  const candidates=[];
  for(let i=0;i<tokens.length;i++){
    for(let j=i+1;j<tokens.length;j++){
      if(tokens[i].toLowerCase()===tokens[j].toLowerCase()) continue;
      const suffix=commonSuffix(tokens[i],tokens[j]);
      const ascii=/^[A-Za-z0-9+._-]+$/.test(suffix);
      if((ascii&&suffix.length<4)||(!ascii&&suffix.length<3)) continue;

      const pair=[
        {value:tokens[i],index:title.indexOf(tokens[i])},
        {value:tokens[j],index:title.indexOf(tokens[j])}
      ].sort((a,b)=>a.index-b.index||a.value.length-b.value.length);
      const chosen=pair.find(x=>!blocked.has(x.value)&&x.value.toLowerCase().endsWith(suffix.toLowerCase()));
      if(!chosen||chosen.value.length-suffix.length>8) continue;
      const existing=candidates.find(x=>x.value.toLowerCase()===chosen.value.toLowerCase());
      if(existing){
        existing.suffixLength=Math.max(existing.suffixLength,suffix.length);
      }else{
        candidates.push({value:chosen.value,index:chosen.index,suffixLength:suffix.length});
      }
    }
  }
  for(const candidate of candidates){
    candidate.supportCount=repeatedSupport(tokens,candidate.value,candidate.suffixLength);
  }
  candidates.sort((a,b)=>
    b.supportCount-a.supportCount
    || b.suffixLength-a.suffixLength
    || a.index-b.index
    || a.value.length-b.value.length
  );

  let repeated=null;
  for(const hit of candidates){
    const validated=validateCandidate(item,title,caption,hit.value,(localTypeData.version||'local-types')+'-repeated-literal',hit.index);
    if(validated){
      validated.identityHypothesis={method:'repeated_title_support',supportCount:hit.supportCount,suffixLength:hit.suffixLength};
      repeated=validated;
      break;
    }
  }

  if(leading&&repeated){
    const leadingSupport=Number(leading.identityHypothesis?.supportCount)||0;
    const repeatedCount=Number(repeated.identityHypothesis?.supportCount)||0;
    if(repeatedCount>leadingSupport) return repeated;
    if(leadingSupport>repeatedCount) return leading;
    return leading;
  }
  if(leading) return leading;
  if(repeated) return repeated;

  const agreed=sourceAgreementIdentity(item);
  if(agreed){
    const validated=validateCandidate(item,title,caption,agreed.value,(localTypeData.version||'local-types')+'-source-agreement',agreed.titleIndex);
    if(validated){
      validated.identityHypothesis={method:'source_agreement',score:agreed.score,runnerUp:agreed.runnerUp||null};
      return validated;
    }
  }

  const distributed=distributedLeadingFamily(item,title,caption,tokens,blocked);
  if(distributed) return distributed;

  const composed=evidenceBackedLeadingIdentity(item);
  if(composed) return composed;
  return null;
}

module.exports={setComponentScoped,repeatedLiteralIdentity,repeatedSupport,leadingCompoundFamily,leadingCompoundIdentity,leadingStemFamily,distributedLeadingFamily};

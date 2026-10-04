'use strict';

const {validateAiExtraction}=require('./room-ai');
const {sourceAgreementIdentity}=require('./source-agreement-identity');
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

function validateCandidate(item,title,caption,value,version,matchIndex){
  if(!value||accessoryScoped(title,value)||setComponentScoped(title,caption,value)) return null;
  const raw={productType:{value,source:'itemName',evidence:value},features:[],sellingPoints:[],confidence:'high'};
  const validation=validateAiExtraction(raw,{itemName:title,itemCaption:caption},{imageAvailable:false});
  if(validation?.productType?.valid!==true||!['simple','simple_partial'].includes(validation.mode)) return null;
  return {raw,validation,version,matchIndex,canonicalIdentity:value};
}

function repeatedLiteralIdentity(item){
  const title=normalize(item?.itemName),caption=normalize(item?.itemCaption);
  if(!title) return null;
  const tokens=title
    .split(/[\s【】〖〗（）()「」『』\[\]{}・／/\\|｜,:：;；!！?？★☆※。&＆]+/)
    .map(normalize).filter(Boolean)
    .filter(token=>token.length>=3&&token.length<=28)
    .filter(token=>!/^\d+(?:\.\d+)?(?:[A-Za-z]+)?$/.test(token))
    .filter(token=>!/^[A-Z0-9_-]{4,}$/i.test(token));
  const blocked=new Set(['ケース','カバー','バッグ','商品','用品','グッズ','セット','タイプ','モデル','シリーズ','公式','ブランド']);
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
      if(!candidates.some(x=>x.value.toLowerCase()===chosen.value.toLowerCase())){
        candidates.push({value:chosen.value,index:chosen.index,suffixLength:suffix.length});
      }
    }
  }
  candidates.sort((a,b)=>b.suffixLength-a.suffixLength||a.index-b.index||a.value.length-b.value.length);
  for(const hit of candidates){
    const validated=validateCandidate(item,title,caption,hit.value,(localTypeData.version||'local-types')+'-repeated-literal',hit.index);
    if(validated) return validated;
  }

  const agreed=sourceAgreementIdentity(item);
  if(agreed){
    const validated=validateCandidate(item,title,caption,agreed.value,(localTypeData.version||'local-types')+'-source-agreement',agreed.titleIndex);
    if(validated){
      validated.identityHypothesis={method:'source_agreement',score:agreed.score,runnerUp:agreed.runnerUp||null};
      return validated;
    }
  }
  return null;
}

module.exports={setComponentScoped,repeatedLiteralIdentity};

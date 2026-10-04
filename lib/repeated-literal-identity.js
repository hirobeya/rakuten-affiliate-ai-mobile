'use strict';

const {validateAiExtraction}=require('./room-ai');
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

function commonSuffix(a,b){
  const x=[...normalize(a)],y=[...normalize(b)];
  let n=0;
  while(n<x.length&&n<y.length&&x[x.length-1-n].toLowerCase()===y[y.length-1-n].toLowerCase()) n++;
  return x.slice(x.length-n).join('');
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
      const pair=[tokens[i],tokens[j]].sort((a,b)=>a.length-b.length||title.indexOf(a)-title.indexOf(b));
      const candidate=pair.find(x=>!blocked.has(x)&&x.toLowerCase().endsWith(suffix.toLowerCase()));
      if(!candidate||candidate.length-suffix.length>8) continue;
      if(!candidates.some(x=>x.value.toLowerCase()===candidate.toLowerCase())) candidates.push({value:candidate,index:title.indexOf(candidate),suffixLength:suffix.length});
    }
  }
  candidates.sort((a,b)=>b.suffixLength-a.suffixLength||a.index-b.index||a.value.length-b.value.length);
  for(const hit of candidates){
    if(accessoryScoped(title,hit.value)) continue;
    const raw={productType:{value:hit.value,source:'itemName',evidence:hit.value},features:[],sellingPoints:[],confidence:'high'};
    const validation=validateAiExtraction(raw,{itemName:title,itemCaption:caption},{imageAvailable:false});
    if(validation?.productType?.valid!==true||!['simple','simple_partial'].includes(validation.mode)) continue;
    return {raw,validation,version:(localTypeData.version||'local-types')+'-repeated-literal',matchIndex:hit.index,canonicalIdentity:hit.value};
  }
  return null;
}

module.exports={repeatedLiteralIdentity};

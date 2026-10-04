'use strict';

const {validateAiExtraction}=require('./room-ai');
const {safeTitleFacts}=require('./local-generic-reasoner');

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

function tokens(title=''){
  return normalize(title)
    .split(/[\s【】〖〗（）()「」『』\[\]{}・／/\\|｜,:：;；!！?？★☆※。&＆]+/)
    .map(normalize).filter(Boolean);
}

const BLOCKED_LEADING=/^(?:送料無料|限定|公式|セール|SALE|ランキング|ポイント|クーポン|お買い物|新発売|人気|おすすめ)$/i;
const COMPANY_LIKE=/(?:株式会社|有限会社|合同会社|実業|工業|製作所|商店|ストア|ショップ)$/;
const DESCRIPTOR_ONLY=new Set(['充電式','電池式','防水','撥水','軽量','小型','大型','コンパクト','自動','電動','折りたたみ','折り畳み','収納','便利']);

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

function lexicalSupports(first,rest=[]){
  const out=[];
  for(const raw of rest){
    const token=normalize(raw);
    if(!token||token===first) continue;
    const common=longestCommonSubstring(first,token);
    if([...common].length<2) continue;
    if(!out.some(x=>x.common===common)) out.push({token,common,length:[...common].length});
  }
  return out.sort((a,b)=>b.length-a.length);
}

function operatorSupports(title=''){
  const t=normalize(title);
  const rules=[
    ['battery','電池式'],['timer','タイマー付き'],['timer','タイマー'],['auto_open','自動開閉'],
    ['thermal','感熱式'],['storage','収納付き'],['magnet','マグネット式'],['rechargeable','充電式']
  ];
  const out=[];
  for(const [kind,term] of rules){
    if(t.includes(term)&&!out.some(x=>x.kind===kind)) out.push({kind,term});
  }
  return out;
}

function evidenceBackedLeadingIdentity(item={}){
  const title=normalize(item.itemName),caption=normalize(item.itemCaption);
  if(!title) return null;
  const parts=tokens(title);
  const first=normalize(parts[0]);
  if(!first||first.length<4||first.length>28) return null;
  if(BLOCKED_LEADING.test(first)||COMPANY_LIKE.test(first)||DESCRIPTOR_ONLY.has(first)) return null;
  if(/^[A-Z0-9._+-]{4,}$/i.test(first)) return null;

  const raw={productType:{value:first,source:'itemName',evidence:first},features:[],sellingPoints:[],confidence:'high'};
  const validation=validateAiExtraction(raw,{itemName:title,itemCaption:caption},{imageAvailable:false});
  if(validation?.productType?.valid!==true||!['simple','simple_partial'].includes(validation.mode)) return null;

  const lexical=lexicalSupports(first,parts.slice(1));
  const facts=safeTitleFacts(title);
  const operators=operatorSupports(title);

  const supportKinds=new Set();
  if(lexical.length) supportKinds.add('lexical');
  if(facts.length) supportKinds.add('grounded_fact');
  if(operators.length) supportKinds.add('operator');

  const independentEvidence=(lexical.length?1:0)+Math.min(2,facts.length)+Math.min(1,operators.length);
  if(supportKinds.size<2||independentEvidence<2) return null;

  return {
    raw,validation,canonicalIdentity:first,matchIndex:0,
    version:'2026-10-04-evidence-backed-leading-v1',
    identityHypothesis:{
      method:'evidence_backed_leading_identity',
      leading:true,
      supportKinds:[...supportKinds],
      independentEvidence,
      lexical:lexical.slice(0,3),
      groundedFacts:facts.slice(0,4).map(x=>x.quote),
      operators:operators.slice(0,3)
    }
  };
}

module.exports={normalize,tokens,longestCommonSubstring,lexicalSupports,operatorSupports,evidenceBackedLeadingIdentity};

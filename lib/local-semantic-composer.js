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

const BLOCKED_TOKEN=/^(?:送料無料|限定|公式|セール|SALE|ランキング|ポイント|クーポン|お買い物|新発売|人気|おすすめ)$/i;
const COMPANY_LIKE=/(?:株式会社|有限会社|合同会社|実業|工業|製作所|商店|ストア|ショップ)$/;
const DESCRIPTOR_ONLY=new Set(['充電式','電池式','防水','撥水','軽量','小型','大型','コンパクト','自動','電動','折りたたみ','折り畳み','収納','便利']);
const FEATURE_RELATION=/(?:連携|対応|仕様|回転|保温|収納|軽量|小型|大型|コンパクト)$/;
const OBJECT_SUFFIX=/(?:機|器|箱|台|具|鏡|傘|靴|枕|鍋|皿|袋)$/;

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

function lexicalSupports(candidate,others=[]){
  const out=[];
  for(const raw of others){
    const token=normalize(raw);
    if(!token||token===candidate) continue;
    const common=longestCommonSubstring(candidate,token);
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

function productNounShape(value=''){
  const v=normalize(value);
  if(!v) return 0;
  if(/^[ァ-ヶーA-Za-z0-9+._-]{4,}$/.test(v)) return 3;
  if(OBJECT_SUFFIX.test(v)) return 2;
  const m=v.match(/([ァ-ヶー]{3,})$/);
  if(m&&m[1].length>=3) return 2;
  return 0;
}

function validateCandidate(title,caption,value){
  const raw={productType:{value,source:'itemName',evidence:value},features:[],sellingPoints:[],confidence:'high'};
  const validation=validateAiExtraction(raw,{itemName:title,itemCaption:caption},{imageAvailable:false});
  if(validation?.productType?.valid!==true||!['simple','simple_partial'].includes(validation.mode)) return null;
  return {raw,validation};
}

function scoreCandidate({value,index,parts,title,facts,operators}){
  if(!value||value.length<4||value.length>28||BLOCKED_TOKEN.test(value)||COMPANY_LIKE.test(value)||DESCRIPTOR_ONLY.has(value)) return null;
  if(/^[A-Z0-9._+-]{4,}$/i.test(value)) return null;
  const validated=validateCandidate(title,'',value);
  if(!validated) return null;
  const lexical=lexicalSupports(value,parts.filter((_,i)=>i!==index));
  const nounShape=productNounShape(value);
  const featurePenalty=FEATURE_RELATION.test(value)?4:0;
  const lexicalScore=lexical.length?Math.min(5,2+lexical[0].length):0;
  const evidenceScore=Math.min(2,facts.length)+(operators.length?1:0);
  const positionBonus=index===0?1:index===1?0.5:0;
  const total=nounShape+lexicalScore+evidenceScore+positionBonus-featurePenalty;
  return {value,index,total,nounShape,featurePenalty,lexical,validated};
}

function evidenceBackedLeadingIdentity(item={}){
  const title=normalize(item.itemName),caption=normalize(item.itemCaption);
  if(!title) return null;
  const parts=tokens(title);
  const facts=safeTitleFacts(title);
  const operators=operatorSupports(title);
  const rows=[];
  for(let i=0;i<Math.min(5,parts.length);i++){
    const row=scoreCandidate({value:normalize(parts[i]),index:i,parts,title,facts,operators});
    if(row) rows.push(row);
  }
  rows.sort((a,b)=>b.total-a.total||a.index-b.index||b.value.length-a.value.length);
  const best=rows[0],runner=rows[1];
  if(!best||best.total<4) return null;
  if(runner&&best.total-runner.total<1.5) return null;
  if(best.featurePenalty>0&&best.lexical.length===0) return null;

  const supportKinds=[];
  if(best.lexical.length) supportKinds.push('lexical');
  if(facts.length) supportKinds.push('grounded_fact');
  if(operators.length) supportKinds.push('operator');
  if(best.nounShape>0) supportKinds.push('noun_shape');
  if(supportKinds.length<2) return null;

  return {
    raw:best.validated.raw,validation:best.validated.validation,canonicalIdentity:best.value,matchIndex:title.indexOf(best.value),
    version:'2026-10-04-evidence-backed-semantic-composition-v2',
    identityHypothesis:{
      method:'evidence_backed_semantic_composition',leading:best.index===0,
      score:Number(best.total.toFixed(2)),margin:runner?Number((best.total-runner.total).toFixed(2)):null,
      supportKinds,lexical:best.lexical.slice(0,3),groundedFacts:facts.slice(0,4).map(x=>x.quote),operators:operators.slice(0,3),
      runnerUp:runner?{value:runner.value,score:Number(runner.total.toFixed(2))}:null
    }
  };
}

module.exports={normalize,tokens,longestCommonSubstring,lexicalSupports,operatorSupports,productNounShape,scoreCandidate,evidenceBackedLeadingIdentity};

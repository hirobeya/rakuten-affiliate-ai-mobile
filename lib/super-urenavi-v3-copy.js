'use strict';

const FALLBACK_HOOKS=[
 {type:'failure_avoidance',text:'買ってから「思っていたのと違う」は避けたいところ。'},
 {type:'scene',text:'毎日使うものほど、選ぶ基準ははっきりさせたい。'},
 {type:'question',text:'どれを選ぶか迷ったら、まず使う場面から考えてみませんか？'}
];
function compact(v=''){return String(v??'').replace(/\s+/g,' ').trim();}
function sentence(v=''){const s=compact(v);return s&&!/[。！？!?]$/.test(s)?s+'。':s;}
function priceLine(price){const n=Number(price);return Number.isFinite(n)&&n>0?`価格：${Math.round(n).toLocaleString('ja-JP')}円`:'';}
function acceptedAppeals(rows=[]){return [...rows].filter(x=>x?.verification?.supported===true).sort((a,b)=>(b.strength||0)-(a.strength||0)||(a.index||0)-(b.index||0));}
function referencedAttributes(appeal,attributes){return (appeal?.attributeRefs||[]).filter(Number.isInteger).map(i=>attributes?.[i]).filter(Boolean).slice(0,3);}
function factPhrase(a){const q=compact(a?.quote);return q?`「${q}」`:'';}
function evidenceLead(attrs){const q=attrs.map(factPhrase).filter(Boolean);return q.length?`${q.join('、')}という仕様。`:'';}
function valueBody(appeal,attrs){
 const evidence=evidenceLead(attrs),value=sentence(appeal?.text),ease=sentence(appeal?.noHassle),scene=sentence(appeal?.scene);
 return [evidence,value,ease,scene].filter(Boolean).join('');
}
function groundedFallback(validation){
 const attrs=validation?.attributes||[],specific=compact(validation?.productType?.specific);
 if(!attrs.length)return specific?`${specific}を選ぶときは、商品ページの仕様を確認して自分の使い方に合うか見ておきたいところ。`:'';
 const first=attrs[0],second=attrs[1];
 const facts=[factPhrase(first),factPhrase(second)].filter(Boolean).join('、');
 return `${specific?`${specific}を選ぶなら、`:''}${facts}はチェックしておきたいポイント。使う場面や置き場所など、自分の条件と照らし合わせて選びやすい商品です。`;
}
function chooseTier(validation,verifiedAppeals){if(!validation?.valid)return'invalid';if(acceptedAppeals(verifiedAppeals).length)return'A';if((validation?.attributes||[]).length)return'B';return'C';}
function hookCandidates(validation,appeal){
 const generated=(validation?.hooks||[]).filter(x=>x?.text).slice(0,3);
 if(generated.length)return generated;
 if(appeal?.scene)return[{type:'scene',text:sentence(appeal.scene)},...FALLBACK_HOOKS].slice(0,3);
 return FALLBACK_HOOKS;
}
function buildBody({tier,validation,verifiedAppeals}){
 if(tier==='A'){const appeal=acceptedAppeals(verifiedAppeals)[0];return valueBody(appeal,referencedAttributes(appeal,validation?.attributes||[]));}
 return groundedFallback(validation);
}
function composeVariants({item={},analysis={},maxVariants=3}={}){
 const validation=analysis.validation||analysis,verifiedAppeals=analysis.verifiedAppeals||[],tier=chooseTier(validation,verifiedAppeals);if(tier==='invalid')return{tier,variants:[]};
 const best=acceptedAppeals(verifiedAppeals)[0],hooks=hookCandidates(validation,best).slice(0,Math.max(1,Math.min(3,Number(maxVariants)||3))),body=buildBody({tier,validation,verifiedAppeals}),price=priceLine(item.itemPrice);
 const footer=['【ひとことメモ（実際に使用した場合のみ）】','',price,'※アフィリエイト広告を利用しています'].join('\n');
 return{tier,variants:hooks.map((hook,index)=>({index:index+1,hookType:hook.type||'scene',hook:compact(hook.text),text:[compact(hook.text),'',body,'',footer].join('\n')}))};
}
module.exports={FALLBACK_HOOKS,priceLine,acceptedAppeals,chooseTier,composeVariants};

'use strict';

const {assessGeneratedCopy}=require('./super-urenavi-v3-quality');
function compact(v=''){return String(v??'').replace(/\s+/g,' ').trim();}
function sentence(v=''){const s=compact(v);return s&&!/[。！？!?]$/.test(s)?s+'。':s;}
function priceLine(price){const n=Number(price);return Number.isFinite(n)&&n>0?`価格：${Math.round(n).toLocaleString('ja-JP')}円`:'';}
function acceptedAppeals(rows=[]){return [...rows].filter(x=>x?.verification?.supported===true).sort((a,b)=>(b.strength||0)-(a.strength||0)||(a.index||0)-(b.index||0));}
function referencedAttributes(appeal,attributes){return (appeal?.attributeRefs||[]).filter(Number.isInteger).map(i=>attributes?.[i]).filter(Boolean).slice(0,3);}
function factPhrase(a){const q=compact(a?.quote);return q?`「${q}」`:'';}
function evidenceLead(attrs){const q=attrs.map(factPhrase).filter(Boolean);return q.length?`${q.join('、')}という根拠があります。`:'';}
function valueBody(appeal,attrs){
 const value=sentence(appeal?.text),ease=sentence(appeal?.noHassle),scene=sentence(appeal?.scene),evidence=evidenceLead(attrs);
 return [value,ease,scene,evidence].filter(Boolean).join('');
}
function chooseTier(validation,verifiedAppeals){if(!validation?.valid)return'invalid';if(acceptedAppeals(verifiedAppeals).length)return'A';return'needs_value';}
function hookCandidates(validation,appeal){
 const generated=(validation?.hooks||[]).filter(x=>x?.text).slice(0,3);
 if(generated.length)return generated;
 if(appeal?.scene)return[{type:'scene',text:sentence(appeal.scene)}];
 return[];
}
function composeVariants({item={},analysis={},maxVariants=3}={}){
 const validation=analysis.validation||analysis,verifiedAppeals=analysis.verifiedAppeals||[],tier=chooseTier(validation,verifiedAppeals);
 if(tier!=='A')return{tier,variants:[],quality:{copyReady:false,reasons:[tier==='invalid'?'invalid_product_identity':'no_verified_customer_value']}};
 const best=acceptedAppeals(verifiedAppeals)[0],hooks=hookCandidates(validation,best).slice(0,Math.max(1,Math.min(3,Number(maxVariants)||3)));
 if(!hooks.length)return{tier:'needs_value',variants:[],quality:{copyReady:false,reasons:['no_product_specific_hook']}};
 const body=valueBody(best,referencedAttributes(best,validation?.attributes||[])),price=priceLine(item.itemPrice);
 const footer=['【ひとことメモ（実際に使用した場合のみ）】','',price,'※アフィリエイト広告を利用しています'].join('\n');
 const variants=hooks.map((hook,index)=>({index:index+1,hookType:hook.type||'scene',hook:compact(hook.text),text:[compact(hook.text),'',body,'',footer].join('\n')}));
 const quality=assessGeneratedCopy({validation,verifiedAppeals,variants});
 if(!quality.copyReady)return{tier:'needs_value',variants:[],quality};
 return{tier:'A',variants,quality};
}
module.exports={priceLine,acceptedAppeals,chooseTier,composeVariants};

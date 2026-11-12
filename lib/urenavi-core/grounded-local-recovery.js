'use strict';
// Offline-only grounded editorial proposals. Source quotes are not approval that
// the claimed feature belongs to the selling unit; publication stays forbidden.
const {hash}=require('../room-writer-raw/source');
const compact=x=>String(x||'').normalize('NFKC').replace(/[\s・／/]+/g,'');
const RISK=/(?:安心|安全|絶対|必ず|効果抜群|抜群|最強|最高|保証|治療|予防|改善|無害|誰でも|どんな.*でも)/;
const OTHER=/(?:Pickup Item|その他のサイズ|関連商品|他の商品|別売|付属品|ランキング|クーポン|送料無料)/i;
const RULES=[
 {axis:'removable',source:'itemCaption',re:/(?:取[っり]?手が取り外せる|ハンドルが取り外せる|取り外し可能)/g,relation:'storage',value:'取っ手を取り外せる'},
 {axis:'stackable',source:'itemCaption',re:/(?:重ねて収納できます|重ねて収納可能|重ねて収納できる)/g,relation:'storage',value:'重ねて収納できる'},
 {axis:'care',source:'itemCaption',re:/(?:水洗い\s*\(手洗い\)\s*が出来る|手洗い(?:が|で)?(?:出来る|できる|可能)|手洗いで洗えます)/gi,relation:'care',value:'手洗いでお手入れできる'},
 {axis:'use',source:'itemCaption',re:/[^\s。！？!、]{3,50}(?:にもご使用いただけます|としてご使用いただけます|として使用できます)/g,relation:'use',value:null},
 {axis:'dualuse',source:'itemCaption',re:/(?:ベンチや踏み台としても使える|ベンチとしても使える|踏み台としても使える)/g,relation:'use',value:null},
 {axis:'integrated',source:'itemName',re:/(?:Type-C|USB-C|Lightning)ケーブル内蔵/gi,relation:'charging',value:null},
 {axis:'remaining',source:'itemName',re:/(?:LED残量表示|バッテリー残量表示)/g,relation:'charging',value:null},
 {axis:'heat',source:'itemCaption',re:/(?:IH、ガス火両対応|IHとガス火(?:の)?両方に対応)/gi,relation:'cooking',value:null},
 {axis:'colors',source:'itemCaption',re:/(?:カラーは全[0-9０-９]+色|[0-9０-９]+色からお選びいただけます)/g,relation:'choice',value:null}
];
const RELATIONS={
 storage:{context:'片付けるときの収納方法にも目を向けたいなら',reason:'取り外しや重ね置きの仕様を確認して選べます'},
 care:{context:'使ったあとのお手入れ方法も気になるなら',reason:'洗い方を確認して選べます'},
 use:{context:'置く場所や使い道を考えて選びたいなら',reason:'使える場面が具体的に書かれています'},
 charging:{context:'外出先での充電方法を考えて選びたいなら',reason:'ケーブルや残量確認の仕様に注目できます'},
 cooking:{context:'調理器具の対応熱源を確認したいなら',reason:'対応する熱源を確認して選べます'}
};
function relevantRegion(caption){
 // Only avoid the preceding carousel; never silently rewrite the source.
 const marker=caption.lastIndexOf('その他のサイズはこちら');
 return marker<0?{text:caption,offset:0}:{text:caption.slice(marker),offset:marker};
}
function facts(item){
 const out=[],region=relevantRegion(item.itemCaption);
 for(const rule of RULES){
  const full=item[rule.source],area=rule.source==='itemCaption'?region.text:full;
  for(const match of area.matchAll(rule.re)){
   const quote=match[0].trim(),at=match.index+(rule.source==='itemCaption'?region.offset:0);
   if(quote.length<4||quote.length>85||RISK.test(quote)||OTHER.test(quote)||!full.includes(quote))continue;
   if(out.some(f=>f.source===rule.source&&f.quote===quote))continue;
   out.push({axis:rule.axis,relation:rule.relation,source:rule.source,quote,at,value:rule.value});
  }
 }
 return out;
}
function distinctClaims(selected){
 const byAxis=new Map(selected.map(f=>[f.axis,f]));
 const has=axis=>byAxis.has(axis);
 if(has('removable')&&has('stackable'))return '取っ手を外して重ねて収納できる仕様です';
 if(has('use')&&has('dualuse')){
  const use=byAxis.get('use').quote.replace(/ご使用いただけます$/,'使えます').replace(/(?:にも|として)使えます$/,'にも使えます');
  return use+'。'+byAxis.get('dualuse').quote+'のも特徴です';
 }
 const lead=selected[0];
 if(lead.axis==='care')return '手洗いでお手入れできる仕様です';
 if(lead.axis==='integrated')return lead.quote+'タイプです';
 if(lead.axis==='removable')return lead.value+'仕様です';
 if(lead.axis==='stackable')return lead.value+'仕様です';
 if(lead.axis==='use')return lead.quote.replace('ご使用いただけます','使えます');
 if(lead.axis==='dualuse')return lead.quote;
 if(lead.axis==='heat')return 'IHとガス火の両方に対応しています';
 return lead.quote+'と記載されています';
}
function preview(item,{identity}={}){
 if(!item||typeof item.itemCode!=='string'||typeof item.itemName!=='string'||typeof item.itemCaption!=='string')
  return {status:'held',reason:'source_not_valid',publication:false,copyable:false};
 const id=String(identity||'').trim();
 if(!id||!compact(item.itemName).includes(compact(id)))
  return {status:'held',reason:'selling_identity_not_established',publication:false,copyable:false};
 const all=facts(item);
 if(!all.length)return {status:'held',reason:'no_source_bound_use_feature',publication:false,copyable:false};
 // Rank *relations* instead of keyword occurrence. A supporting claim should
 // express a distinct axis, not inflate the same specification twice.
 const priority=['removable','care','integrated','use','dualuse','stackable','remaining','heat','colors'];
 all.sort((a,b)=>priority.indexOf(a.axis)-priority.indexOf(b.axis)||a.at-b.at);
 const lead=all[0],selected=[lead],relation=lead.relation;
 const complementary=all.filter(f=>f!==lead&&f.axis!==lead.axis&&
   (f.relation===relation||(relation==='care'&&f.axis==='colors')));
 const add=complementary[0];
 if(add)selected.push(add);
 const claims=distinctClaims(selected),style=RELATIONS[relation];
 if(!style||!claims||RISK.test(claims))
  return {status:'held',reason:'unrenderable_or_risky_claim',publication:false,copyable:false};
 let sentence=claims.replace(/[。！？!]+$/,'');
 if(selected.some(f=>f.axis==='integrated')&&selected.some(f=>f.axis==='remaining'))
  sentence='ケーブル内蔵の仕様に加え、'+selected.find(f=>f.axis==='remaining').quote+'も記載されています';
 const proposal=style.context+'。\n'+id+'は、'+sentence+'。\n'+style.reason+'。';
 return {
  version:'local-grounded-recovery-v2',status:'proposed_requires_independent_review',
  itemCode:item.itemCode,
  sourceHash:hash({itemCode:item.itemCode,itemName:item.itemName,itemCaption:item.itemCaption,catchcopy:item.catchcopy||''}),
  identity:id,relation,evidence:selected.map(f=>({source:f.source,quote:f.quote,axis:f.axis,at:f.at})),
  proposal,publication:false,copyable:false,semanticApproved:false,
  unresolved:['selling_unit','claim_scope','naturalness','six_axis_quality']
 };
}
module.exports={preview};

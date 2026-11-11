'use strict';
// Offline editorial recovery. This NEVER certifies or publishes a product claim.
// It extracts verbatim spans from the seller's acquired fields and makes a
// narrow proposal for independent semantic/selling-unit review.
const {hash}=require('../room-writer-raw/source');

const SPECIFIC_PATTERNS=[
  {axis:'care',source:'itemCaption',re:/(?:水洗い\s*\(手洗い\)\s*が出来る|手洗い(?:が|で)?(?:出来る|できる|可能)|手洗いで洗えます)/gi,scene:'お手入れ方法を見て選びたいときに'},
  {axis:'removable',source:'itemCaption',re:/(?:取[っり]?手が取り外せる|ハンドルが取り外せる|取り外し可能)/g,scene:'使わないときの片付け方も考えたいなら'},
  {axis:'stackable',source:'itemCaption',re:/(?:重ねて収納できます|重ねて収納可能|重ねて収納できる)/g,scene:'収納方法も見て選びたいなら'},
  {axis:'use',source:'itemCaption',re:/[^\s。！？!、]{3,50}(?:にもご使用いただけます|としてご使用いただけます|として使用できます)/g,scene:'使う場所や用途を見て選びたいなら'},
  {axis:'integrated',source:'itemName',re:/(?:Type-C|USB-C|Lightning)ケーブル内蔵/gi,scene:'充電するときのケーブル構成も考えたいなら'}
];
const UNSAFE=/(?:安心|安全|絶対|必ず|効果抜群|抜群|最強|最高|保証|治療|予防|改善|無害|安心して|誰でも|どんな.*でも)/;
const OTHER_ITEM=/(?:Pickup Item|その他のサイズ|関連商品|他の商品|別売|付属品|ランキング|クーポン|送料無料)/i;
function preview(item,{identity}={}){
 if(!item||typeof item.itemName!=='string'||typeof item.itemCaption!=='string'||!item.itemCode)return {status:'held',reason:'source_not_valid',publication:false,copyable:false};
 const id=String(identity||'').trim();
 if(!id||!item.itemName.includes(id))return {status:'held',reason:'selling_identity_not_established',publication:false,copyable:false};
 const evidence=[];
 for(const rule of SPECIFIC_PATTERNS){
  const source=item[rule.source];
  for(const m of source.matchAll(rule.re)){
   const quote=m[0].trim();
   if(quote.length<4||quote.length>85||UNSAFE.test(quote)||OTHER_ITEM.test(quote)||!source.includes(quote))continue;
   // An exact span is a source location, not independent proof that the
   // selected offer/model actually owns the property.
   if(!evidence.some(e=>e.quote===quote&&e.source===rule.source))
    evidence.push({source:rule.source,quote,axis:rule.axis,scene:rule.scene,at:m.index});
  }
 }
 if(!evidence.length)return {status:'held',reason:'no_source_bound_use_feature',publication:false,copyable:false};
 const priority={removable:0,stackable:1,care:2,use:3,integrated:4};
 evidence.sort((a,b)=>priority[a.axis]-priority[b.axis]||a.at-b.at);
 const lead=evidence[0],support=evidence.find(e=>e.axis!==lead.axis&&e.source==='itemCaption');
 const selected=[lead,...(support?[support]:[])];
 const statements=selected.map(e=>e.quote.replace(/^(?:さらに|また)\s*/,'').replace(/[。！？!]+$/,''));
 const proposal=[lead.scene+'。',id+'は、'+statements.join('。')+'。'].join('\n');
 return {
  version:'local-grounded-recovery-v1',status:'proposed_requires_independent_review',
  itemCode:item.itemCode,sourceHash:hash({itemCode:item.itemCode,itemName:item.itemName,itemCaption:item.itemCaption,catchcopy:item.catchcopy||''}),
  identity:id,evidence:selected,proposal,
  publication:false,copyable:false,semanticApproved:false,
  unresolved:['selling_unit','claim_scope','naturalness','six_axis_quality']
 };
}
module.exports={preview};

'use strict';
const C=require('../../lib/urenavi-core/contracts');
function fixture(){
 const item={itemCode:'offline:kettle',itemName:'電気ケトル',itemCaption:'忙しい朝にカップ1杯分が約85秒で沸騰する。',catchcopy:''};
 const q={field:'itemCaption',start:0,end:item.itemCaption.length,text:item.itemCaption};
 const proof={quotes:[q],verdict:'supported'};
 const text='忙しい朝にお湯を用意したいとき、カップ1杯分を約85秒で沸かせる電気ケトルです。';
 const plan={sellingProduct:{id:'p',type:'電気ケトル',user:'お湯を用意する人',use:'湯沸かし',target:'水',...proof},owners:[{id:'body',kind:'body',parentId:'p',...proof}],features:[{id:'f',content:'カップ1杯分が約85秒で沸騰',ownerId:'body',scope:{model:'',size:'カップ1杯分',part:'本体',target:'水',conditions:'カップ1杯分',negation:'',degree:'約',measurements:'約85秒'},...proof}],intentions:[{id:'i',kind:'use',content:'忙しい朝にお湯を用意したい',hypothetical:true}],relations:[{id:'r',featureId:'f',intentionId:'i',meaning:'忙しい朝に必要なカップ1杯分のお湯を用意する目的に少量の沸騰時間が対応する',intentionBoundary:'忙しい朝にお湯を用意したいという仮定',notGuaranteed:'準備全体の即時完了を保証しない',...proof}],bindings:[{sentence:0,featureIds:['f'],relationIds:['r'],quotes:[q],clauses:[{text,featureIds:['f'],relationIds:['r'],quotes:[q]}]}]};
 const draft={plan,product:{what:'電気ケトル',acts_on:'水',acts_on_quote:q.text},sentences:[{text,kinds:['spec','scene'],quotes:[q.text]}]};
 const legacy={product:{what:'supported',acts_on:'supported'},sentences:[{text,evidenceQuotes:[],reason:'mock: timing scope retained',...Object.fromEntries(C.dimensions.map(k=>[k,'supported']))}],quality:Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(k=>[k,'supported']))};
 const review={legacy,plan:[plan.sellingProduct,...plan.owners,...plan.features,...plan.relations].map(x=>({id:x.id,...Object.fromEntries(C.dimensions.map(k=>[k,'supported'])),reason:'mock only: original scope and ownership retained',quotes:[q]})),quality:Object.fromEntries(C.axes.map(k=>[k,{verdict:'pass',sentence:0,text,quotes:[q],reason:'mock only: exercise acceptance path, not real quality evidence'}]))};
 return {item,draft,review};
}
module.exports={fixture};

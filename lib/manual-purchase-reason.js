'use strict';
const {reviewSourceBenefit}=require('./local-editorial-quality');
const {catalogueOnly,sellerNarrative,hasUseRelation}=require('../public/purchase-copy-quality');
const {guardUnsupportedBenefitCopy}=require('../public/fact-safety');
const {RISK}=require('../public/structured-room-copy');

// Scope and relation must be explicit in one independently attributable
// sentence. Keep all qualifiers inside their exact evidence spans.
const relation=/^(?<scene>[^、。]{4,40}とき)(?:は|に)?、(?<feature>[^、。]{4,65})(?<link>ので|ことで|により)、(?<benefit>[^、。]{5,65})。$/u;
const unsafe=/(?:別売|別モデル|別の|他の|関連商品|付属しない|実際に使|購入しました|他社|おすすめ|楽天|送料無料|クーポン|保証|医療|治療|予防|殺菌|抗菌|除菌|消臭|安全|安心|[<>【】「」]|https?:|[%％])/iu;
const extraScope=/(?:ほかの|他の|の場合|のみ|とき|ときは|に限|を除|以外|によって)/u;
const catalog=/(?:素材|材質|備考|原産国|メーカー名)[：:]/u;
const condition=/(?:のみ|だけ|場合|とき|に限|以上|以下|未満|以内|なくても)/gu;
const audience=/(?:初心者|子ども|子供|大人|高齢者|左利き|右利き)(?:でも|向け|は|が)/gu;
const degree=/(?:約|最大|最小|およそ|ほど|やすい|にくい|少し|楽に)/gu;
const negative=/(?:なくても|不要|しない|できない|できません|ない|ません|不可)/gu;
const number=/[0-9０-９]+(?:[.．][0-9０-９]+)?(?:\s?(?:mm|cm|ml|kg|mL|g|L|円|時間|分|秒|枚|本|段|個|回|人|℃|度))?/gu;

function qualifiers(span){
 return {audience:span.match(audience)||[],conditions:span.match(condition)||[],
  degrees:span.match(degree)||[],negations:span.match(negative)||[],numbers:span.match(number)||[]};
}
function understand(item){
 const title=item.itemName.trim(),caption=item.itemCaption;
 if(title.length<3||title.length>42||/[\n。！？、：:]|[!?]|\s{2,}/u.test(title)
   ||unsafe.test(title)||RISK.test(title))return null;
 if(caption.includes('\n'))return null;
 const named=caption.startsWith(title+'は、')?title.length+2:0;
 const match=caption.slice(named).match(relation);
 if(!match||unsafe.test(caption)||catalog.test(caption)||RISK.test(caption)||sellerNarrative(caption)
   ||!hasUseRelation(caption)||!reviewSourceBenefit({quote:caption,identity:title}).ok)return null;
 const {scene,feature,link,benefit}=match.groups;
 if(extraScope.test(feature)||/(?:ではなく|じゃなく|ので|ことで|により)/.test(benefit))return null;
 const featureStart=caption.indexOf('、',named)+1;
 const benefitStart=featureStart+feature.length+link.length+1;
 return {
  subject:{source:'itemName',quote:title},
  sentence:{source:'itemCaption',quote:caption,start:0,end:caption.length},
  scene:{quote:scene,start:named,end:named+scene.length,...qualifiers(scene)},
  feature:{quote:feature,start:featureStart,end:featureStart+feature.length,...qualifiers(feature)},
  benefit:{quote:benefit,start:benefitStart,end:benefitStart+benefit.length,...qualifiers(benefit)},
  link
 };
}
function render(proof,price){
 const {subject,scene,feature,benefit,link}=proof;
 const priceLine=price>0?'\n\n価格：'+price.toLocaleString('ja-JP')+'円':'';
 return subject.quote+'\n'+scene.quote+'は、'+feature.quote+link+benefit.quote+'。'+priceLine+
  '\n\n※アフィリエイト広告を利用しています';
}
function verify(item,proof,proposed){
 const current=understand(item);
 return current!==null&&JSON.stringify(current)===JSON.stringify(proof)
  &&render(current,item.itemPrice)===proposed&&!catalogueOnly(proposed)
  &&guardUnsupportedBenefitCopy(item,proposed)===proposed;
}
function hasStructuredReason(item){
 return item.itemCaption.split('\n').some(line=>{
  const prefix=item.itemName.trim()+'は、';
  return relation.test(line.startsWith(prefix)?line.slice(prefix.length):line);
 });
}
function compose(item){
 const proof=understand(item);
 if(!proof)return null;
 const text=render(proof,item.itemPrice);
 return verify(item,proof,text)?{text,proof}:null;
}
module.exports={understand,compose,verify,hasStructuredReason};

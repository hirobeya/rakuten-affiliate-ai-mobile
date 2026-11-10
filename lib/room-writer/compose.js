'use strict';
// Deterministic review presentation. Cannot publish, post or copy directly.
const DISCLOSURE='※アフィリエイト広告を利用しています';
function compose(draft,verdict,{itemPrice}={}){
 if(!verdict||verdict.status!=='needs_semantic_review'||verdict.ok!==true)throw Error('room_writer_machine_rejected');
 if(!draft?.post||draft.hold?.active)throw Error('room_writer_held');
 const lines=[draft.post.hook.text,...draft.post.body.map(c=>c.text)];
 const price=Number(itemPrice);
 if(Number.isFinite(price)&&price>0)lines.push('','価格：'+price.toLocaleString('ja-JP')+'円');
 if(draft.post.note.trim())lines.push('',draft.post.note.trim());
 const tags=draft.tags.filter(s=>/^#[^\s#]{1,35}$/.test(s)).slice(0,5);
 if(tags.length)lines.push('',tags.join(' '));
 lines.push('',DISCLOSURE);
 return Object.freeze({status:'review_only',publication:false,copyable:false,text:lines.join('\n'),short:[...lines.slice(0,2),'',DISCLOSURE].join('\n')});
}
module.exports={compose,DISCLOSURE};

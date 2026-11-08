'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Browser=require('../../public/room-copy-result');
const {inspect,publication,questions}=require('../../lib/room-semantic-contract');
const source={itemCode:'test:multi',itemName:'収納ケース',itemCaption:'前面から開けられる収納ケースです。'};
const prefix='収納ケースは前面から開けられるタイプです。';
const sentence=(text)=>({text,kinds:['spec'],quotes:[source.itemCaption]});
const draftOf=texts=>({product:{what:'収納ケース',acts_on:'収納する物',acts_on_quote:source.itemCaption},sentences:texts.map(sentence)});
function approved(draft){return {product:{what:'supported',acts_on:'supported'},sentences:draft.sentences.map(s=>({text:s.text,evidenceQuotes:[],reason:'verified',...Object.fromEntries(questions.map(q=>[q,'supported']))})),quality:Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(q=>[q,'supported']))};}
test('platform length uses completed text including newline and mandatory ad disclosure',()=>{
 const d=draftOf([prefix]);
 const post=Browser.compose(d.sentences);
 assert.ok(post.includes('※アフィリエイト広告'));
 assert.equal(Browser.fitsLength('あ'.repeat(500)),true);
 assert.equal(Browser.fitsLength('あ'.repeat(501)),false);
 assert.equal(Browser.fitsLength(post),true);
 assert.equal(Browser.compose(d.sentences),post);
});
test('oversized posts are rejected by server before any review approval can publish',()=>{
 const long='収納ケースは前面から開けられるタイプです。'+ '使いたい場面にあわせて特徴を確認したいときに。'.repeat(8);
 assert.ok(long.length<350);
 const d=draftOf([long,long+'こちらは1',long+'こちらは2']);
 assert.ok(Browser.compose(d.sentences).length>500);
 const machine=inspect(source,d);
 assert.ok(machine.failures.some(f=>f.rule==='post_exceeds_room_limit'),JSON.stringify(machine.failures));
 const published=publication(source,d,approved(d));
 assert.equal(published.status,'blocked');
 assert.equal(published.text,'');
 assert.ok(published.reasons.some(r=>r.rule==='post_exceeds_room_limit'));
});
test('browser rejects oversized even if server erroneously stamps ready, never clips text',()=>{
 const long='収納ケースは前面から開けられるタイプです。'+'原文にない効果は加えません。'.repeat(17);
 const d=draftOf([long,long+'A']);
 const text=Browser.compose(d.sentences);
 assert.ok(text.length>500);
 const result={version:'room_contract_test',ok:true,pending:false,product:d.product,sentences:d.sentences,quality:{status:'ready',machine:{ok:true},review:{ok:true},text},variants:[{text}]};
 assert.equal(Browser.ready(result),'');
 assert.deepEqual(Browser.ledger(result),[]);
});
test('fully checked multi-paragraph post remains untruncated',()=>{
 const texts=[
 '収納ケースは前面から開けられるタイプです。使う場所や収納する物に合わせ、前面の開閉方法を確認したい人に向けた商品です。',
 '前面の開け方を確かめて選びたいときに。',
 '収納ケースの仕様を理解してから選ぶ人へ。',
 '商品の形状と使う場所を考えたいときに。',
 '使用する前に開け方を確かめる収納ケースです。'];
 const d=draftOf(texts),text=Browser.compose(d.sentences);
 assert.ok(text.length>150&&text.length<=500);
 const result={version:'room_contract_test',ok:true,pending:false,product:d.product,sentences:d.sentences,quality:{status:'ready',machine:{ok:true},review:{ok:true},text},variants:[{text}]};
 assert.equal(Browser.ready(result),text);
 assert.equal(Browser.ledger(result).length,5);
});

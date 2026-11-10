'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),L=require('../../lib/urenavi-core/editorial-source-ledger'),C=require('../../lib/room-semantic-contract'),P=require('../../lib/room-semantic-provider');
const item={itemName:'収納ベンチ 2人掛け',itemCaption:'本体サイズ 幅120×奥行37×高さ40cm●座部を上げると内部に物を収納できます。※別売りのソファは含みません。商品補足説明 検索 収納 時短 大人気',catchcopy:''};
test('reference ledger preserves original offsets, entire sources and negative conditions',()=>{
 const ledger=L.build(item);assert.deepEqual(ledger,L.build(item));
 for(const p of ledger.passages)assert.equal(item[p.field].slice(p.start,p.end),p.text);
 assert(ledger.passages.some(p=>p.text.includes('含みません')));
 assert(ledger.excluded.length===1);assert(!ledger.passages.some(p=>p.text.includes('大人気')));
 const r=P.stageRequest('generate',item,{},P.REVIEW_PROMPT,'editorial');assert.equal(r.userPayload.itemCaption,item.itemCaption);assert.equal(r.schema.additionalProperties,false);
 assert.equal(r.schema.properties.sentences.items.properties.quotes,undefined);
});
test('canonical draft restores exact original citations without model retyping or changing text',()=>{
 const ledger=L.build(item),use=ledger.passages.find(p=>p.text.includes('座部')),title=ledger.passages.find(p=>p.field==='itemName');
 const raw={product:{what:'収納ベンチ',acts_on:'収納',sourceId:use.id},sentences:[{text:'物をしまいたいときに、座部を上げて内部に収納できる収納ベンチです。',sourceIds:[title.id,use.id],kinds:['scene','benefit']}]};
 const before=JSON.stringify(raw),draft=L.restore(raw,item);assert.equal(JSON.stringify(raw),before);assert.equal(draft.sentences[0].text,raw.sentences[0].text);assert.equal(draft.sentences[0].quotes[1],use.text);assert.equal(C.inspect(item,draft).ok,true);
 for(const bad of [-1,999,'0',null]){const x=structuredClone(raw);x.sentences[0].sourceIds=[bad];assert.throws(()=>L.restore(x,item));}
 const duplicate=structuredClone(raw);duplicate.sentences[0].sourceIds=[use.id,use.id];assert.throws(()=>L.restore(duplicate,item));
 const fabricated=structuredClone(raw);fabricated.sentences[0].quotes=['創作'];assert.throws(()=>L.restore(fabricated,item));
});
test('BOS search keywords cannot become citation references or certified usage',()=>{
 const x={itemName:'臭わない袋 BOS SSサイズ 200枚 日本製',itemCaption:'●【袋サイズ】SSサイズ（17×27cm）●防臭力はいずれも同じです。 「検索用キーワード」 レジ 処理 防災 備蓄 生ゴミ'};
 const ledger=L.build(x);assert(!ledger.passages.some(p=>/レジ|防災|生ゴミ/.test(p.text)));assert(ledger.excluded.length);
});

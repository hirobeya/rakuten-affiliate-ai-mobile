'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const contract=require('../public/room-copy-result.js');

test('legacy AI responses cannot be published as verified copy',()=>{
  const legacy={ok:true,validation:{confidence:'high',mode:'full'},rawAiJson:{sentences:[{text:'便利です'}]}};
  assert.equal(contract.canonical(legacy),false);
  assert.equal(contract.ready(legacy),'');
});

test('verified copy must contain the exact reviewed text and source quotes',()=>{
  const sentences=[{text:'本革を使用した財布です。',kinds:['spec'],quotes:['本革']}];
  const text='本革を使用した財布です。\n\n※アフィリエイト広告を利用しています';
  const valid={version:'room_contract_test',ok:true,pending:false,product:{what:'財布',acts_on:'収納',acts_on_quote:'財布'},sentences,variants:[{text}],quality:{status:'ready',machine:{ok:true},review:{ok:true},text}};
  assert.equal(contract.ready(valid),text);
  assert.equal(contract.ready({...valid,quality:{...valid.quality,review:{ok:false}}}),'');
  assert.equal(contract.ready({...valid,quality:{...valid.quality,text:'未検証の別文章'}}),'');
  assert.equal(contract.ready({...valid,sentences:[{...sentences[0],quotes:[]}]}),'');
});

test('production must not invoke the unsupported legacy AI endpoint',()=>{
  const app=fs.readFileSync('public/app.html','utf8');
  assert.doesNotMatch(app,/fetch\(['"]\/api\/room-ai['"]/);
  assert.match(app,/RoomCopyResult\.ready/);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {propose}=require('../../lib/urenavi-core/editorial-cleanup');
const item={itemName:'ペットベッド',itemCaption:'<3D構造体> 通気性に優れた立体構造で、寝返りしやすく、ムレを防ぎながらもしっかりと体を支えます。'};
const quote=item.itemCaption;
const original='ペットベッドは、'+quote+'\n\n価格：9,990円\n\n※アフィリエイト広告を利用しています';
test('grounded heading-only cleanup remains private and preserves all nonheading text',()=>{
 const p=propose({item,originalText:original,sourceQuote:quote});
 assert.ok(p);
 assert.equal(p.proposedText,'ペットベッドは、通気性に優れた立体構造で、寝返りしやすく、ムレを防ぎながらもしっかりと体を支えます。\n\n価格：9,990円\n\n※アフィリエイト広告を利用しています');
 assert.equal(p.originalText,original);
 assert.equal(p.status,'requires_full_editorial_review');
 assert.equal(p.publication,false);
 assert.equal(p.copyable,false);
});
test('unverified quote and arbitrary replacement cannot be proposed',()=>{
 for(const sourceQuote of ['<3D構造体> 通気性が抜群です。','<3D構造体> 通気性に優れた立体構造で、寝返りしやすく、ムレを防ぎながもしっかりと体を支えます。'])
  assert.equal(propose({item,originalText:original,sourceQuote}),null);
});
test('do not alter sentences without leading heading or with unsupported extra markup',()=>{
 const text='ペットベッドは、通気性に優れた立体構造です。';
 assert.equal(propose({item:{itemName:'ベッド',itemCaption:text},originalText:text,sourceQuote:text}),null);
 const withExtra='<3D構造体> 立体構造で使えます <追加特徴>';
 assert.equal(propose({item:{itemName:'ベッド',itemCaption:withExtra},originalText:withExtra,sourceQuote:withExtra}),null);
});

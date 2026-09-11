const {test}=require('node:test');
const assert=require('node:assert/strict');
const search=require('../api/search');

const wrap=target=>'https://hb.afl.rakuten.co.jp/hgc/example/?pc='+encodeURIComponent(target);

function item(overrides={}){
  return {
    itemName:'AVIREX 2WAY LEG BAG AVX348',
    shopName:'Water mode',
    affiliateRate:4,
    affiliateUrl:wrap('https://item.rakuten.co.jp/watermode/avx348/'),
    itemUrl:wrap('https://item.rakuten.co.jp/watermode/avx348/'),
    ...overrides
  };
}

test('normal marketplace item is ROOM eligible and yields canonical product URL',()=>{
  const result=search.roomEligibility(item());
  assert.equal(result.ok,true);
  assert.equal(result.roomItemUrl,'https://item.rakuten.co.jp/watermode/avx348/');
});

test('affiliate URL or positive rate is mandatory',()=>{
  assert.equal(search.roomEligibility(item({affiliateRate:0})).ok,false);
  assert.equal(search.roomEligibility(item({affiliateUrl:''})).ok,false);
});

test('unknown canonical product destination is fail-closed',()=>{
  const result=search.roomEligibility(item({affiliateUrl:'https://example.test/x',itemUrl:'https://example.test/x'}));
  assert.equal(result.ok,false);
  assert.equal(result.reason,'room-url');
});

test('Rakuten Kobo and Books digital products are excluded',()=>{
  assert.equal(search.roomEligibility(item({itemName:'楽天Kobo 電子書籍',shopName:'楽天Kobo'})).ok,false);
  const ebook=item({
    itemName:'電子書籍タイトル',
    shopName:'楽天ブックス',
    affiliateUrl:wrap('https://books.rakuten.co.jp/rk/abc123/'),
    itemUrl:wrap('https://books.rakuten.co.jp/rk/abc123/')
  });
  assert.equal(search.roomEligibility(ebook).ok,false);
});

test('physical Rakuten Books product remains eligible',()=>{
  const physical=item({
    itemName:'紙の書籍タイトル',
    shopName:'楽天ブックス',
    affiliateUrl:wrap('https://books.rakuten.co.jp/rb/12345678/'),
    itemUrl:wrap('https://books.rakuten.co.jp/rb/12345678/')
  });
  const result=search.roomEligibility(physical);
  assert.equal(result.ok,true);
  assert.equal(result.roomItemUrl,'https://books.rakuten.co.jp/rb/12345678/');
});

test('medicines are excluded',()=>{
  assert.equal(search.roomEligibility(item({itemName:'【第2類医薬品】かぜ薬 30錠'})).ok,false);
  assert.equal(search.roomEligibility(item({itemName:'要指導医薬品 テスト'})).ok,false);
});

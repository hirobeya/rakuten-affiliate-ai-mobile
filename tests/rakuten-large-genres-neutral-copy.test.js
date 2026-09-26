const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');

function load(){
  const document={createElement(){return {textContent:''};},head:{appendChild(){}}};
  const window={document,Intl};
  const ctx=vm.createContext({window,Intl,console});
  vm.runInContext(fs.readFileSync('public/fact-safety.js','utf8'),ctx);
  vm.runInContext(fs.readFileSync('public/pain-copy.js','utf8'),ctx);
  vm.runInContext(fs.readFileSync('public/room-copy-quality.js','utf8'),ctx);
  return window.UrenaviPainCopy;
}

function fixtureGenres(){
  const dir=path.join(__dirname,'fixtures');
  const files=fs.readdirSync(dir)
    .filter(x=>/^rakuten-large-genres-20260925-.*\.json$/.test(x))
    .sort();
  const genres=[];
  for(const file of files){
    const data=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
    for(const genre of data.genres||[]) genres.push({...genre,fixtureFile:file});
  }
  return genres;
}

function stableHash(s){
  return crypto.createHash('sha256').update(String(s||'')).digest('hex');
}

test('Rakuten major genres neutral copy structural validation >=700 fixed products',()=>{
  const api=load();
  const genres=fixtureGenres();
  const seenGenre=new Set();
  let total=0,generated=0,fallback=0;
  const rows=[];
  const genreStats=[];

  for(const genre of genres){
    assert.ok(!seenGenre.has(genre.genreId),'duplicate genre '+genre.genreId);
    seenGenre.add(genre.genreId);
    assert.ok(Array.isArray(genre.items)&&genre.items.length>=20,genre.nameJa+' must have >=20 products');

    let gGenerated=0,gFallback=0;
    for(const item of genre.items){
      total++;
      const title=String(item.itemName||'');
      assert.ok(title,'empty itemName in '+genre.nameJa);

      const sourceTokens=api.titleFactTokens(item);
      const facts=api.extractFallbackTitleFacts(item);
      for(const fact of facts){
        assert.ok(sourceTokens.includes(fact),genre.nameJa+' non-token fact: '+fact+' <= '+title);
        assert.equal(api.isSafeLocalFactToken(fact),true,genre.nameJa+' unsafe fact: '+fact);
        const nums=String(fact).match(/\d+(?:[.,]\d+)?\s*(?:mAh|Ah|Wh|W|V|cm|mm|kg|mg|g|ml|mL|L|個|枚|本|袋|組|台|段|色|ポート|時間|分)/gi)||[];
        for(const num of nums) assert.ok(title.includes(num),genre.nameJa+' unsupported number/unit: '+num+' <= '+title);
      }

      const post=api.buildGroundedBenefitPost(item,facts);
      const roomPost=api.makeRoomCopy(item,'');
      const threadsPost=api.makeThreadsCopy(item,'');
      const instagramPost=api.makeInstagramCopy(item,'');
      assert.ok(roomPost,genre.nameJa+' ROOM route must never be blank');
      assert.ok(threadsPost,genre.nameJa+' Threads route must never be blank');
      assert.ok(instagramPost,genre.nameJa+' Instagram route must never be blank');
      for(const routed of [roomPost,threadsPost,instagramPost]){
        assert.match(routed,/※アフィリエイト広告を利用しています/);
        assert.doesNotMatch(routed,/絶対|必ず|確実に|改善|治る|痩せる|若返|No\\.?\\s*1|ナンバーワン/);
      }
      if(post){
        assert.equal(roomPost,post,genre.nameJa+' strict ROOM route changed unexpectedly');
        assert.equal(threadsPost,post,genre.nameJa+' strict Threads route changed unexpectedly');
        assert.equal(instagramPost,post,genre.nameJa+' strict Instagram route changed unexpectedly');
      }else{
        assert.notEqual(roomPost,'',genre.nameJa+' generic fallback missing');
      }
      if(post){
        generated++;gGenerated++;
        assert.match(post,/確認できる仕様👇/);
        assert.match(post,/商品名には「[^」]+」と明記されています。/);
        assert.match(post,/※アフィリエイト広告を利用しています/);
        assert.doesNotMatch(post,/絶対|必ず|確実に|改善|治る|痩せる|若返|No\.?\s*1|ナンバーワン/);
        const factLines=post.split('\n').filter(x=>x.startsWith('✓ ')).map(x=>x.slice(2));
        assert.ok(factLines.length>0,genre.nameJa+' generated post without facts');
        for(const fact of factLines){
          assert.ok(sourceTokens.includes(fact),genre.nameJa+' post fact not exact source token: '+fact);
          assert.equal(api.isSafeLocalFactToken(fact),true,genre.nameJa+' post contains claim/promo/unsafe token: '+fact);
        }
      }else{
        fallback++;gFallback++;
      }
      rows.push({
        genreId:genre.genreId,genre:genre.nameJa,itemName:title,itemPrice:Number(item.itemPrice)||0,
        generated:Boolean(post),facts,post
      });
    }
    genreStats.push({genreId:genre.genreId,genre:genre.nameJa,count:genre.items.length,generated:gGenerated,fallback:gFallback,fallbackRate:Number((gFallback/genre.items.length).toFixed(4))});
  }

  assert.ok(total>=700,'expected >=700 fixed Rakuten products, got '+total);
  assert.equal(generated+fallback,total);
  const sample=[...rows]
    .sort((a,b)=>stableHash(a.genreId+'|'+a.itemName).localeCompare(stableHash(b.genreId+'|'+b.itemName)))
    .slice(0,100);

  console.log('RAKUTEN_MAJOR_GENRE_REPORT '+JSON.stringify({
    genreCount:genres.length,total,generated,fallback,
    fallbackRate:Number((fallback/total).toFixed(4)),
    genres:genreStats
  }));
  console.log('RAKUTEN_MAJOR_GENRE_SAMPLE100 '+JSON.stringify(sample));
});

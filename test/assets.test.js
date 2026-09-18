const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('Inline scripts compile and public assets contain no private keys',()=>{
 for(const file of fs.readdirSync('public')){
  if(!/\.(html|js|json|webmanifest)$/.test(file))continue;
  const source=fs.readFileSync('public/'+file,'utf8');
  for(const pattern of [/\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/g,/\bwhsec_[A-Za-z0-9]{16,}/g,/\bsb_secret_[A-Za-z0-9_-]+/g])assert.equal(pattern.test(source),false,'Private credential in '+file);
  if(file.endsWith('.html'))for(const match of source.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){const attrs=match[1]||'';if(/type=["']application\/ld\+json["']/i.test(attrs))continue;new vm.Script(match[2]);}
 }
 const manifest=JSON.parse(fs.readFileSync('public/manifest.webmanifest','utf8'));
 assert.equal(manifest.start_url,'/app.html');
 assert.ok(fs.existsSync('public'+manifest.icons[0].src));
});


test('product engine is loaded before interactive app logic and is not injected late',()=>{
  const app=fs.readFileSync('public/app.html','utf8');
  const pain=app.indexOf('<script src="/pain-copy.js');
  const refine=app.indexOf('<script src="/pain-copy-refine.js');
  const context=app.indexOf('<script src="/pain-copy-context-fix.js');
  const state=app.indexOf('<script src="/return-state.js');
  const supabase=app.indexOf('<script src="https://cdn.jsdelivr.net/npm/@supabase');
  assert.ok(pain>=0 && refine>pain && context>refine && state>context && supabase>state);
  const bridge=fs.readFileSync('public/return-state.js','utf8');
  assert.doesNotMatch(bridge,/createElement\('script'\)[\s\S]{0,300}pain-copy/);
  assert.doesNotMatch(bridge,/installProductLogic|__urenaviPostPatched|root\.post=function/);
});


test('app has a single source of truth for product copy',()=>{
  const app=fs.readFileSync('public/app.html','utf8');
  assert.match(app,/function productContext\(i\)/);
  assert.match(app,/UrenaviPainCopy\.makeRoomCopy/);
  assert.match(app,/UrenaviPainCopy\.makeThreadsCopy/);
  assert.match(app,/UrenaviPainCopy\.makeInstagramCopy/);
  assert.doesNotMatch(app,/楽天で見つけた注目アイテム/);
  assert.doesNotMatch(app,/レビューを見ながら失敗しにくく選びたい人/);
  const bridge=fs.readFileSync('public/return-state.js','utf8');
  assert.doesNotMatch(bridge,/__urenaviPostPatched|root\.post=function|root\.aud=function|root\.pts=function/);
});


test('public copy engine contains no generic price-first sales hook',()=>{
  for(const file of ['public/pain-copy.js','public/pain-copy-refine.js','public/app.html','public/return-state.js','public/access-guard.js']){
    const source=fs.readFileSync(file,'utf8');
    assert.doesNotMatch(source,/試しやすい価格帯|この価格なら試しやすい|比較しやすい価格帯/);
  }
});


test('access guard cannot override the product-specific first line',()=>{
  const guard=fs.readFileSync('public/access-guard.js','utf8');
  assert.doesNotMatch(guard,/let hook=|この価格なら試しやすい|これ、見つけたらチェックしたい|選ばれている理由が気になる/);
  assert.doesNotMatch(guard,/return \`\$\{hook\}/);
});

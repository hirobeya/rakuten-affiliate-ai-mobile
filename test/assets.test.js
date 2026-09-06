const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('Inline scripts compile and public assets contain no private keys',()=>{
 for(const file of fs.readdirSync('public')){
  if(!/\.(html|js|json|webmanifest)$/.test(file))continue;
  const source=fs.readFileSync('public/'+file,'utf8');
  for(const pattern of [/\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/g,/\bwhsec_[A-Za-z0-9]{16,}/g,/\bsb_secret_[A-Za-z0-9_-]+/g])assert.equal(pattern.test(source),false,'Private credential in '+file);
  if(file.endsWith('.html'))for(const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 }
 const manifest=JSON.parse(fs.readFileSync('public/manifest.webmanifest','utf8'));
 assert.equal(manifest.start_url,'/app.html');
 assert.ok(fs.existsSync('public'+manifest.icons[0].src));
});

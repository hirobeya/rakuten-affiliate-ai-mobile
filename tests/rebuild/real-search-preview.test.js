'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../scripts/rebuild/real-search-preview');
test('real-search deployment uses original app and auth, with no synthetic data or generation routes',()=>{
 const config=JSON.parse(fs.readFileSync(root+'/vercel.json'));assert.equal(config.crons,undefined);assert.equal(config.rewrites,undefined);
 assert.deepEqual(fs.readdirSync(root+'/api').sort(),['access.js','room-copy.js','runtime-env.js','search.js']);
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'real-ui-'));try{
 const fakeFs={...fs,mkdirSync(){},writeFileSync(name,value){fs.writeFileSync(path.join(out,path.basename(name)),value);},copyFileSync(a,b){fs.copyFileSync(a,path.join(out,path.basename(b)));}};
 const code=fs.readFileSync(root+'/build.cjs','utf8');vm.runInNewContext(code,{require:name=>name==='node:fs'?fakeFs:require(name),__dirname:root,console:{log(){}}});
 const html=fs.readFileSync(out+'/index.html','utf8'),script=fs.readFileSync(out+'/app-inline-1.js','utf8');
 assert.ok(html.includes('data-completed-core-only="true"'));assert.ok(html.includes('https://cdn.jsdelivr.net/npm/@supabase/'));assert.ok(html.includes('実商品検索の限定検証'));
 assert.ok(!html.includes('fixture-items.js'));assert.ok(!html.includes('isolation.js'));assert.ok(!html.includes('/access-guard.js'));
 assert.ok(html.includes('<details hidden '));assert.ok(html.includes('id="loginBtn" class="authBtn" hidden'));assert.ok(html.includes('id="previewLoginPassword"'));assert.ok(html.includes('/password-login.js'));
 assert.ok(script.includes('「Sign in」を開かずに長押し'));assert.ok(!script.includes('届いたリンクを押してください。'));
 assert.ok(fs.readFileSync(path.resolve(root,'../../../public/app.html'),'utf8').includes('届いたリンクを押してください。'));
 assert.ok(html.includes('authObservation'));assert.ok(html.includes('/auth-observation.js'));assert.ok(script.includes('UrenaviAuthObservation.watch(sb.auth)'));assert.ok(script.includes('UrenaviAuthObservation.access(response.status)'));assert.ok(script.includes('supabase.createClient'));assert.ok(script.includes("'/api/search?'+"));assert.ok(script.includes('completed-cache-only'));assert.ok(script.includes('autoAi=false'));assert.ok(!script.includes('AppFixtureItems'));
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});
test('real-search access route rejects all write/payment actions before authorization',async()=>{
 const r={setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;}};const h=require(root+'/api/access');await h({method:'POST',query:{action:'upgrade-pro'}},r);assert.equal(r.code,403);
});

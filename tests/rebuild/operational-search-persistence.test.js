'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const W=require('../../lib/urenavi-core/preview-artifact-writer'),A=require('../../lib/urenavi-core/authenticated-completed-read'),S=require('../../lib/urenavi-core/trusted-product-source'),Copy=require('../../public/room-copy-result');
const search=require('../../api/search'),E=require('../../lib/urenavi-core/local-engine'),C=require('../../lib/urenavi-core/contracts'),{fixture}=require('./fixture.cjs'),{identity}=require('../../public/room-outcomes');
function response(){return {setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;}};}
function storage(){const files=new Map();let puts=0;return {files,get puts(){return puts;},async get(name){const r=files.get(name);return r?{statusCode:200,blob:{etag:r.etag},stream:new Blob([r.value]).stream()}:{statusCode:404};},async put(name,value,options){const old=files.get(name);if(old&&(!options.allowOverwrite||options.ifMatch!==old.etag))throw Error('conflict');assert.equal(options.access,'private');assert.equal(options.addRandomSuffix,false);const etag='e'+(++puts);files.set(name,{etag,value});return {etag};}};}
const auth={ok:true,plan:'owner',user:{id:'owner-id'}};
test('existing search API preserves query/product identity through raw capture, completed save and authenticated read',async t=>{
 const previousFetch=global.fetch,env={...process.env};Object.assign(process.env,{VERCEL_ENV:'preview',RAKUTEN_APP_ID:'mock',RAKUTEN_ACCESS_KEY:'mock',RAKUTEN_AFFILIATE_ID:'mock'});
 const blob=storage(),writer=W.create({blob,assertWriteAllowed:async()=>true}),f=fixture(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'operational-flow-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let requested=[],quota=0;
 try{
 const bag={itemCode:'test:bag',itemName:'レッグバッグ',itemCaption:'<p>脚に装着するバッグ。</p>  ポケット2個。',catchcopy:'携帯用'};
 global.fetch=async url=>{const u=new URL(url),keyword=u.searchParams.get('keyword');requested.push(keyword);return {ok:true,status:200,json:async()=>({items:[keyword==='レッグバッグ'?bag:f.item],count:1})};};
 const h=search.createHandler({authorize:async()=>auth,claimSearch:async id=>{assert.equal(id,auth.user.id);quota++;return true;},captureSources:writer.captureSources});
 const run=async keyword=>{const r=response();await h({method:'GET',headers:{},query:{keyword}},r);assert.equal(r.code,200);return r.body.items[0];};
 const bagShown=await run('レッグバッグ');assert.equal(bagShown.itemCode,bag.itemCode);assert.equal(bagShown.itemName,bag.itemName);assert.equal(bagShown.itemCaption,'脚に装着するバッグ。 ポケット2個。');
 const raw=JSON.parse(blob.files.get(S.pathname({owner:auth.user.id,itemCode:bag.itemCode})).value);assert.equal(raw.source.itemCaption,bag.itemCaption);assert.equal(raw.searchKeyword,'レッグバッグ');
 const kettleShown=await run('電気ケトル');assert.equal(kettleShown.itemCode,f.item.itemCode);assert.deepEqual(requested,['レッグバッグ','電気ケトル']);assert.equal(quota,2);
 const artifact=await E.run({item:f.item,directory:dir,limits:{tokens:10000000,requests:80,perCallTokens:1000000},transport:async(_,m)=>({raw:m.stage==='draft'?f.draft:f.review,usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2},finish_reason:'stop'})});
 assert.equal((await writer.saveCompleted({authorization:auth,artifact})).stored,true);const before=blob.puts;assert.equal((await writer.saveCompleted({authorization:auth,artifact})).reused,true);assert.equal(blob.puts,before);
 const read=A.createOperational({blob,authorize:async()=>auth});const copy=async item=>{const r=response();await read({method:'POST',headers:{},body:{...item,completedCoreOnly:true}},r);return r;};
 let r=await copy(kettleShown);assert.equal(r.code,200);assert.ok(Copy.ready(r.body));r=await copy(bagShown);assert.equal(r.code,404);assert.equal(Copy.ready(r.body),'');
 r=await copy({...bagShown,itemName:kettleShown.itemName});assert.equal(r.code,409);assert.equal(Copy.ready(r.body),'');
 const invalid=structuredClone(artifact);invalid.output.sentences[0].text='wrong';await assert.rejects(()=>writer.saveCompleted({authorization:auth,artifact:invalid}));assert.equal(blob.puts,before);
 const conflict=structuredClone(artifact);conflict.history.push({note:'different saved evidence'});await assert.rejects(()=>writer.saveCompleted({authorization:auth,artifact:conflict}),/conflict/);assert.equal(blob.puts,before);
 const other=A.createOperational({blob,authorize:async()=>({...auth,user:{id:'other'}})}),denied=response();await other({method:'POST',headers:{'x-fixture-owner':auth.user.id},body:{...kettleShown,completedCoreOnly:true,owner:auth.user.id,artifact}},denied);assert.equal(denied.code,409);assert.equal(Copy.ready(denied.body),'');
 }finally{global.fetch=previousFetch;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}
});
test('writer stops before unapproved/Production writes, rejects incomplete artifacts and unconfirmed persistence',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';try{
 const blob=storage(),f=fixture();let writer=W.create({blob,assertWriteAllowed:async()=>false});await assert.rejects(()=>writer.captureSources({authorization:auth,keyword:'x',items:[f.item]}));assert.equal(blob.puts,0);
 writer=W.create({blob,assertWriteAllowed:async()=>true});process.env.VERCEL_ENV='production';await assert.rejects(()=>writer.captureSources({authorization:auth,keyword:'x',items:[f.item]}));assert.equal(blob.puts,0);process.env.VERCEL_ENV='preview';
 await assert.rejects(()=>writer.captureSources({authorization:auth,keyword:'x',items:[{...f.item,catchcopy:undefined}]}));assert.equal(blob.puts,0);
 await assert.rejects(()=>writer.saveCompleted({authorization:auth,artifact:{source:f.item,status:'pending'}}));assert.equal(blob.puts,0);
 const bad={get:async()=>({statusCode:404}),put:async()=>({etag:'not-persisted'})};await assert.rejects(()=>W.create({blob:bad,assertWriteAllowed:async()=>true}).captureSources({authorization:auth,keyword:'x',items:[f.item]}),/save_unconfirmed/);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('source update uses conditional concurrency and exactly one competing update succeeds',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';try{
 const blob=storage(),writer=W.create({blob,assertWriteAllowed:async()=>true}),f=fixture();
 await writer.captureSources({authorization:auth,keyword:'initial',items:[f.item]});
 const results=await Promise.allSettled(['first','second'].map(keyword=>writer.captureSources({authorization:auth,keyword,items:[{...f.item,itemCaption:f.item.itemCaption+keyword}]})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal(blob.puts,2);
 const row=JSON.parse(blob.files.get(S.pathname({owner:auth.user.id,itemCode:f.item.itemCode})).value);assert.equal(row.source.itemCaption,f.item.itemCaption+row.searchKeyword);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('full originals survive display projection across genres and reject synthetic/mismatched source',async()=>{
 const {boundedSource}=require('../../lib/product-source');
 for(const [index,name] of ['バッグ','調理器具','食品','書籍'].entries()){
  const source={itemCode:'shop:'+index,itemName:name,itemCaption:'<p>条件。</p> '+('原文の情報。'.repeat(2500)),catchcopy:'<b>見出し</b>'};
  const selected={...source,itemCaption:boundedSource(source.itemCaption,12000),catchcopy:boundedSource(source.catchcopy,500)};
  const good={owner:auth.user.id,provenance:'rakuten-api',source,sourceHash:C.hash(source),productIdentity:identity(source)};
  const resolver=S.create({loadSource:async()=>good});assert.deepEqual(await resolver({authorization:auth,item:selected}),source);
  for(const bad of [null,{...good,provenance:'synthetic'},{...good,owner:'other'},{...good,sourceHash:'wrong'},{...good,productIdentity:'wrong'}])await assert.rejects(()=>S.create({loadSource:async()=>bad})({authorization:auth,item:selected}));
  await assert.rejects(()=>resolver({authorization:auth,item:{...selected,itemName:'wrong'}}));
 }
});

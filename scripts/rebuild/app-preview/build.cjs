'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'../../..'),out=path.join(__dirname,'dist');
(async()=>{
fs.mkdirSync(out,{recursive:true});
const E=require(root+'/lib/urenavi-core/local-engine'),Registry=require(root+'/lib/urenavi-core/completed-store');
const rows=[],items=[];
for(const [code,seconds] of [['a','85'],['b','95']]){
 let f=require(root+'/tests/rebuild/fixture.cjs').fixture();
 f=JSON.parse(JSON.stringify(f).replaceAll('85',seconds));
 f.item.itemCode='synthetic:'+code;f.item.itemName+='（架空商品'+code.toUpperCase()+'）';
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'app-fixture-'));
 try{const artifact=await E.run({item:f.item,directory:dir,limits:{tokens:10000000,requests:80,perCallTokens:1000000},transport:async(_,m)=>({raw:m.stage==='draft'?f.draft:f.review,usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2},finish_reason:'stop'})});
 for(const owner of ['fixture-a','fixture-b'])rows.push({owner,artifact});
 items.push({...f.item,itemPrice:3000,itemUrl:'https://example.invalid/'+code,score:90,relevance:99,sellability:80,profitability:60});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
Registry.create(rows);
fs.writeFileSync(path.join(__dirname,'artifacts.json'),JSON.stringify(rows));
fs.writeFileSync(out+'/fixture-items.js','window.AppFixtureItems='+JSON.stringify(items)+';');
for(const file of fs.readdirSync(root+'/public'))if(/\.js$/.test(file))fs.copyFileSync(root+'/public/'+file,out+'/'+file);
fs.copyFileSync(__dirname+'/isolation.js',out+'/isolation.js');
let html=fs.readFileSync(root+'/public/app.html','utf8');
html=html.replace('<html lang="ja">','<html lang="ja" data-completed-core-only="true">');
if(!html.includes('data-completed-core-only'))html=html.replace(/<html([^>]*)>/,'<html$1 data-completed-core-only="true">');
html=html.replace(/<script src="https:\/\/cdn.jsdelivr.net[^>]*><\/script>/,'');
html=html.replace(/<script src="\/access-guard[^>]*><\/script>/,'');
html=html.replace('<head>','<head><script src="/isolation.js"></script><script src="/fixture-items.js"></script>');
html=html.replace('async function checkAuth(){','async function checkAuth(){ if(window.AppIsolation) return;');
html=html.replace('function aiTargetDecision(item){','function aiTargetDecision(item){ if(window.AppIsolation)return {callAi:true,reasons:["completed-cache-only"]};');
html=html.replace("if(currentAppSession?.access_token) headers.Authorization", "if(window.AppIsolation)headers['X-Fixture-Owner']=window.AppIsolation.owner;\n    if(currentAppSession?.access_token) headers.Authorization");
const marker='\n\n</script>\n\n<script>\n(function(){';
if(!html.includes(marker))throw Error('main_script_boundary_missing');
html=html.replace(marker,'\n'+fs.readFileSync(__dirname+'/boot.js','utf8')+marker);
// Externalize every inline script so the strict CSP does not need unsafe-inline scripts.
let n=0;html=html.replace(/<script>([\s\S]*?)<\/script>/g,(_,code)=>{const name='app-inline-'+(++n)+'.js';fs.writeFileSync(out+'/'+name,code);return '<script src="/'+name+'"></script>';});
fs.writeFileSync(out+'/index.html',html);
console.log('Existing app.html isolated build: two distinct synthetic source/features/texts; '+rows.length+' owner-scoped artifacts; '+n+' original inline scripts.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});

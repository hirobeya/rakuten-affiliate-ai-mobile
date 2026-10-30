'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.join(__dirname,'dist');fs.mkdirSync(out,{recursive:true});
for(const file of fs.readdirSync(root+'/public'))if(file.endsWith('.js'))fs.copyFileSync(root+'/public/'+file,out+'/'+file);
let html=fs.readFileSync(root+'/public/app.html','utf8');
html=html.replace('<html lang="ja">','<html lang="ja" data-completed-core-only="true">');
// Keep real Supabase login. Omit the old device/payment/handoff decorator only in this isolated build.
html=html.replace(/<script src="\/access-guard[^>]*><\/script>/,'');
html=html.replace('{autoAi=true,restored=false,keyword=lastSearchKeyword}={}','{autoAi=false,restored=false,keyword=lastSearchKeyword}={}');
html=html.replace('function aiTargetDecision(item){','function aiTargetDecision(item){ if(document.documentElement.dataset.completedCoreOnly==="true")return {callAi:true,reasons:["completed-cache-only"]};');
html=html.replace('<nav id="urenaviWorkTabs"','<section class="box"><b>実商品検索の限定検証</b><p>本人の実検索は累計2回まで。Groq生成・決済・cronは無効です。新規生成は行わず、完成cacheがない商品は本文を表示しません。</p></section><nav id="urenaviWorkTabs"');
let n=0;html=html.replace(/<script>([\s\S]*?)<\/script>/g,(_,code)=>{const file='app-inline-'+(++n)+'.js';fs.writeFileSync(out+'/'+file,code);return '<script src="/'+file+'"></script>';});
fs.writeFileSync(out+'/index.html',html);fs.writeFileSync(out+'/app.html',html);
console.log('Existing app UI, real auth/search, completed-cache-only, no fixture or inference routes.');

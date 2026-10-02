'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm');
const baseline='3fb18811de413448384317f2beead78cd29a2ae3';
function load(before){const window={},ctx=vm.createContext({window,Intl,console});for(const name of [...(!before?['structured-room-copy']:[]),'fact-safety','pain-copy','room-copy-quality']){const code=before?cp.execFileSync('git',['show',baseline+':public/'+name+'.js'],{encoding:'utf8'}):fs.readFileSync('public/'+name+'.js','utf8');vm.runInContext(code,ctx);}return window.UrenaviPainCopy;}
const old=load(true),current=load(false),s=require('../public/structured-room-copy');
const rows=require('../tests/fixtures/structured-copy-categories.json').map(item=>({input:item,inputKind:item.category==='バイクグローブ'?'user_supplied_title':'synthetic_contract_fixture',before:old.makeRoomCopy(item,''),after:current.makeRoomCopy(item,''),ledger:s.compose(item)}));
const corpus=[];for(const file of fs.readdirSync('tests/fixtures').filter(x=>/^rakuten-large-genres-20260925-.*\.json$/.test(x))){for(const genre of JSON.parse(fs.readFileSync('tests/fixtures/'+file,'utf8')).genres||[])for(const item of genre.items)corpus.push({genre:genre.nameJa,itemName:item.itemName,before:old.makeRoomCopy(item,''),after:current.makeRoomCopy(item,'')});}
const count=key=>corpus.filter(x=>x[key]).length;
const report={baseline,generatedAt:new Date().toISOString(),limits:['No live Rakuten API or Groq generation measured','No visual image facts extracted','Fixtures other than glove are synthetic; they do not verify real products','Unknown/no safe facts stop rather than fabricate a scene'],summary:{categories:rows.length,categoryGenerated:rows.filter(x=>x.after).length,corpusTotal:corpus.length,beforeGenerated:count('before'),afterGenerated:count('after'),afterStopped:corpus.length-count('after')},rows};
fs.mkdirSync('docs',{recursive:true});fs.writeFileSync('docs/structured-copy-report-20261002.json',JSON.stringify(report,null,2)+'\n');
fs.writeFileSync('public/structured-copy-samples.json',JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(report.summary));

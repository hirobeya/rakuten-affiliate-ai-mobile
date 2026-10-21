'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../public/app.html'),'utf8');
const source=html.slice(html.indexOf('function pendingAiStatus('),html.indexOf('function updateAiPanel('));
const c={Date};vm.createContext(c);vm.runInContext(source,c);
test('pending draft shows next stage and a fixed device-local resumption time without scheduling requests',()=>{
 const now=Date.UTC(2026,9,21,1,0,0),after=now+65000;
 const result={state:'pending',resumeAfter:after,data:{phase:'verification',retryAfterMs:65000}};
 const message=c.pendingAiStatus(result,now);
 const time=new Date(after).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
 assert.ok(message.includes(time));assert.ok(message.includes('次は内容の確認'));assert.ok(message.includes('自動では再開しません'));
 assert.equal(c.pendingAiStatus(result,now+1000),message);
});
test('elapsed wait invites only explicit continuation and retains incomplete status',()=>{
 const text=c.pendingAiStatus({resumeAfter:100,data:{phase:'reverification'}},101);
 assert.ok(text.includes('まだ未完成'));assert.ok(text.includes('次は再作成後の確認'));assert.ok(text.includes('「確認を続ける」を押してください'));
 assert.ok(!text.includes('再開の目安'));
});

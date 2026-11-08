'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const Browser=require('../../public/room-copy-result');
const html=fs.readFileSync(path.resolve(__dirname,'../../public/app.html'),'utf8');
function extract(name,nextName){
 const from=html.indexOf('function '+name+'('),to=html.indexOf('function '+nextName+'(',from);
 assert.ok(from>=0&&to>from,'UI function must exist: '+name);
 return html.slice(from,to);
}
test('legacy V3 approved 501+ character post is not returned to iPhone, but complete 500-character posts remain intact',()=>{
 const code=extract('readyV3Post','aiSalesInsight');
 const ctx={RoomCopyResult:Browser,isV3PreviewResult:()=>true};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 const approved={ok:true,quality:{status:'ready'},variants:[{text:'あ'.repeat(501)}]};
 assert.equal(ctx.readyV3Post(approved),'');
 approved.variants[0].text='あ'.repeat(500);
 assert.equal(ctx.readyV3Post(approved),'あ'.repeat(500));
 assert.equal(approved.variants[0].text.length,500,'no clipping or mutation of source');
});
test('all legacy/local and AI copy routes reject long text before even checking trust metadata',()=>{
 const code=extract('roomCopyNeedsReview','isFullyReviewedCopyState');
 const ctx={RoomCopyResult:Browser};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 for(const validated of [false,true]){
  assert.equal(ctx.roomCopyNeedsReview('あ'.repeat(501),{},validated,{}),true);
  assert.equal(ctx.roomCopyNeedsReview('あ'.repeat(600),{},validated,{model:'local',ok:true}),true);
 }
});
test('user-facing copy route renders explicit length error and never calls generic evidence error for overflow',()=>{
 assert.match(html,/function postDisplay\(i,p='room'\)/);
 assert.match(html,/if\(typeof RoomCopyResult==='undefined'\|\|!RoomCopyResult\.fitsLength\(text\)\)/);
 assert.match(html,/投稿文の全文が楽天ROOMの文字数上限を超えています/);
});

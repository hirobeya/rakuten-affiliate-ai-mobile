'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../public/app.html'),'utf8');
test('one integrated app exposes five task tabs without enabling billing',()=>{
 for(const tab of ['search','copy','operations','results','today'])assert.match(html,new RegExp('data-urenavi-tab="'+tab+'"'));
 assert.match(html,/id="urenaviCandidateTools"/);
 assert.match(html,/id="roomOpsPanel"/);
 assert.match(html,/id="roomOutcomesPanel"/);
 assert.match(html,/id="roomAccountBackupPanel"/);
 assert.match(html,/function setAppScreen\(\)/);
});
test('tab change script is syntactically valid and direct anchors target existing IDs',()=>{
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
 for(const id of ['normalScreen','res','roomOpsPanel','proDailyDashboard','outcomeHistory'])assert.match(html,new RegExp('id="'+id+'"'));
});


test('ROOM management screens explain steps and retain their operational controls',()=>{
 for(const text of ['いいね・フォロー管理','対応待ち（返しを優先）','投稿確認・売上管理','実際にROOMへ投稿してから'])assert.ok(html.includes(text));
 for(const id of ['roomOpsAdd','roomOpsQueue','roomOpsRestorePreview','roomOpsRestoreApply','outcomeSave','outcomeRestorePreview','outcomeRestoreApply'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/class="urenaviAdvanced"/);
});

test('management flow prioritizes confirmation and keeps legacy records secondary',()=>{const a=html.indexOf('<h3>① 投稿できたかを確認</h3>'),b=html.indexOf('<h3>② 商品別の成果を入力</h3>'),c=html.indexOf('<h3>③ 次の商品選びのヒント</h3>');assert.ok(a>0&&a<b&&b<c);assert.match(html,/<details class="proTasks urenaviAdvanced" id="proActivityPanel">/);assert.match(html,/<summary>名前・理由を追加する（任意）<\/summary>/);});

test('outcomes navigation provides evidence-bounded next choice',()=>{assert.match(html,/id="outcomeDecision"/);assert.match(html,/次の商品選びのヒント/);assert.match(html,/商品別の記録を詳しく比較する/);});

test('exchange shortcuts and earnings follow-up remain in the same app',()=>{for(const id of ['roomOpsQuickStatus','roomOpsQuickGo','roomOpsPaste','outcomeToSearch'])assert.match(html,new RegExp('id="'+id+'"'));assert.match(html,/getElementById\('outcomeToSearch'\)\.addEventListener\('click',goToProductSearch\)/);assert.match(html,/navigator\.clipboard\.readText\(\)/);});

test('reusing a past ROOM contact keeps URL entry optional and retains duplicate validation',()=>{const panel=fs.readFileSync(require.resolve('../public/room-operations-panel.js'),'utf8');new vm.Script(panel);assert.match(panel,/data-room-reuse/);assert.match(panel,/store\.add\(\{type:previous\.type,url:previous\.url,name:previous\.name,reason:previous\.reason\}\)/);});

test('saved ROOM contacts can be searched and reused without manual URL input',()=>{
 const panel=fs.readFileSync(require.resolve('../public/room-operations-panel.js'),'utf8');
 new vm.Script(panel);
 for(const id of ['roomOpsFind','roomOpsFindStatus','roomOpsRecent'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(panel,/roomOpsFind'\)\.addEventListener\('input',render\)/);
 assert.match(panel,/filteredQueue=queue\.filter\(matches\)/);
 assert.match(panel,/data-room-reuse/);
 assert.match(panel,/24時間以上前に登録した返し候補/);
});

test('ROOM engagement prioritizes four activities and keeps contact lookup secondary',()=>{for(const k of ['like_return','follow_return','like_visit','follow_visit'])assert.match(html,new RegExp('data-room-work="'+k+'"'));assert.match(html,/<summary>以前の相手を探す・再利用する（必要なときだけ）<\/summary>/);assert.match(html,/document\.getElementById\('roomOpsType'\)\.value=button\.dataset\.roomWork/);});


test('copy tab has no redundant next-product control',()=>{assert.doesNotMatch(html,/id="urenaviCopyToSearch"|id="urenaviNextSearchBtn"/);assert.match(html,/data-urenavi-tab="search"/);});

test('preview version identifies stale iPhone sessions and weak copy is blocked',()=>{assert.match(html,/id="urenaviPreviewVersion"/);assert.match(html,/function roomCopyNeedsReview\(text,item,validatedByServer=false\)/);assert.match(html,/!roomCopyNeedsReview\(text,i,isFullyReviewedCopyState\(s\)\)/);assert.doesNotMatch(html,/投稿済みにして次の商品へ/);});

test('weak copy from the reported washing-net screen is not publish-ready',()=>{
 const vm=require('node:vm');const start=html.indexOf('function roomCopyNeedsReview(text,item,validatedByServer=false){');const end=html.indexOf('function postReady(',start);
 assert.ok(start>0&&end>start);
 const ctx={window:{UrenaviStructuredCopy:{compose:()=>({status:'ok',understanding:{scene:'商品に合う場面'},values:[]})}}};vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
 assert.equal(ctx.roomCopyNeedsReview('ブラジャーの型崩れを防ぎつつ、ドラム式洗濯機で手軽に洗いたいときに使えます。\n\n※アフィリエイト広告を利用しています'),true);
 ctx.window.UrenaviStructuredCopy.compose=()=>({status:'ok',understanding:{scene:''},values:[]});
 assert.equal(ctx.roomCopyNeedsReview('財布の素材を確認。\n\n本革の財布です。\n\n※アフィリエイト広告を利用しています',{}),true);
 assert.equal(ctx.roomCopyNeedsReview('用途は根拠を確認済み。\n\n素材を説明した文章です。\n\n※アフィリエイト広告を利用しています',{},true),false);
 ctx.window.UrenaviStructuredCopy.compose=()=>({status:'ok',understanding:{scene:'商品に合う場面'},values:[]});
 assert.equal(ctx.roomCopyNeedsReview('使う場面の説明を確認しました。\n\n2枚組で選べる洗濯ネットです。\n\n※アフィリエイト広告を利用しています',{}),false);
});

test('restored search never creates a next-product button or marks a product posted',()=>{
 const fs=require('node:fs');
 const durable=fs.readFileSync('public/durable-session.js','utf8');
 const loader=fs.readFileSync('public/return-state.js','utf8');
 assert.doesNotMatch(durable,/投稿済みにして次の商品へ|button\.textContent=.*次の商品へ|action:'posted-next'|function postedNext\(/);
 assert.doesNotMatch(durable,/root\.location\.assign\(url\)/);
 assert.match(loader,/durable-session\.js\?v=20261011-ux-restore-no-next/);
 assert.match(durable,/function applyResumeUI\(\)/);
});

test('only contract-verified AI may bypass local evidence gate',()=>{assert.match(html,/function isFullyReviewedCopyState\(s\)/);assert.match(html,/RoomCopyResult\.canonical\(data\) && RoomCopyResult\.ready\(data\)/);assert.match(html,/isV3PreviewResult\(data\) && readyV3Post\(data\)/);assert.doesNotMatch(html,/Boolean\(s\.gate\?\.full&&!s\.gate\?\.useLegacy\)/);});

test('Rakuten product link restores by stable action role rather than button label',()=>{const durable=fs.readFileSync('public/durable-session.js','utf8');assert.match(html,/data-urenavi-product-link="market"/);assert.match(durable,/link\.dataset\.urenaviProductLink!=='market'/);assert.match(html,/data-urenavi-product-link="market" href=[^\n]*target="_blank"/);assert.doesNotMatch(durable,/root\.location\.assign\(/);assert.doesNotMatch(durable,/event\.preventDefault\(\)/);assert.doesNotMatch(durable,/String\(link\.textContent\|\|''\)\.trim\(\)!=='楽天で見る'/);});

test('all copy shortcuts recheck product readiness before touching clipboard',()=>{assert.match(html,/if\(!postReady\(a\[index\],b\.dataset\.p\)\)/);assert.match(html,/if\(!i\|\|!postReady\(i,'room'\)\)/);assert.match(html,/if\(b\.dataset\.p==='room'\)window\.roomOutcomePrepared\(a\[index\]\)/);});

test('return-state does not hijack internal work tabs or Rakuten new-tab links',()=>{const state=fs.readFileSync('public/return-state.js','utf8');assert.match(state,/link\.dataset\?\.urenaviProductLink==='market'/);assert.doesNotMatch(state,/root\.location\.assign\(link\.href\)/);assert.doesNotMatch(state,/event\.stopImmediatePropagation\(\)/);assert.match(state,/楽天の商品ページは別画面で開きます/);});

test('actual copy-quality guard rejects generic laundry copy and ungrounded local spec-only copy',()=>{
 const start=html.indexOf('function roomCopyNeedsReview('),end=html.indexOf('function isFullyReviewedCopyState(',start);
 assert.ok(start>0&&end>start);
 const context={window:{UrenaviStructuredCopy:{compose:item=>item.scene?{status:'ok',understanding:{scene:'洗うときに'},values:[]}:{status:'ok',understanding:{scene:''},values:[]}}}};
 vm.createContext(context);vm.runInContext(html.slice(start,end),context);
 const weak='ブラジャーの型崩れを防ぎつつ、ドラム式洗濯機で手軽に洗いたいときに使えます。\\n\\n※アフィリエイト広告を利用しています';
 assert.equal(context.roomCopyNeedsReview(weak,{scene:true},false),true);
 assert.equal(context.roomCopyNeedsReview('財布 本革\\n仕様：本革\\n価格：5000円\\n※アフィリエイト広告を利用しています',{scene:false},false),true);
 // A scene label alone, without supported purchase benefits, is still not publish-ready.
 assert.equal(context.roomCopyNeedsReview('洗うときに\\n洗濯ネットです。\\n洗える仕様です。\\n※アフィリエイト広告を利用しています',{scene:true},false),true);
});

test('local readiness requires a grounded purchase-value sentence in the displayed copy',()=>{
 const start=html.indexOf('function roomCopyNeedsReview('),end=html.indexOf('function isFullyReviewedCopyState(',start);
 assert.ok(start>0&&end>start);
 const ctx={window:{UrenaviStructuredCopy:{compose:()=>({status:'ok',understanding:{scene:'外出先での充電に。'},values:[{text:'コードをつながずに使うタイプです。',factRefs:['コードレス']}]})}}};
 vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
 const unrelated='外出先での充電に。\n\n見た目を楽しみながら選べる一品です。\n\n※アフィリエイト広告を利用しています';
 assert.equal(ctx.roomCopyNeedsReview(unrelated,{},false),true);
 const grounded='外出先での充電に。\n\n充電式のモバイルバッテリーです。\nコードをつながずに使うタイプです。\n\n※アフィリエイト広告を利用しています';
 assert.equal(ctx.roomCopyNeedsReview(grounded,{},false),false);
});


test('unresolved local spec alone cannot bypass Groq fallback, grounded copy can',()=>{
 const start=html.indexOf('function aiTargetDecision(item){'),end=html.indexOf('function activeAiProgress(',start);
 assert.ok(start>0&&end>start);
 const ctx={usePurchasePlan:false,groundedAnalysis:()=>({outputMode:'fallback',ambiguous:false,topCandidates:[],conflicts:[]}),
   window:{UrenaviPainCopy:{extractFallbackTitleFacts:()=>['洗える'],buildGroundedBenefitPost:()=> '洗える仕様です。'}},
   roomCopyNeedsReview:()=>true};
 vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
 assert.equal(ctx.aiTargetDecision({itemName:'洗濯ネット 洗える'}).callAi,true);
 assert.ok(ctx.aiTargetDecision({itemName:'洗濯ネット 洗える'}).reasons.includes('insufficient_grounded_purchase_reason'));
 ctx.window.UrenaviPainCopy.buildGroundedBenefitPost=()=> '洗濯ネットです。洗うときに確認できます。';
 ctx.roomCopyNeedsReview=()=>false;
 assert.equal(ctx.aiTargetDecision({itemName:'洗濯ネット 洗える'}).callAi,false);
 ctx.groundedAnalysis=()=>({outputMode:'full',ambiguous:false,topCandidates:[],conflicts:[]});
 ctx.roomCopyNeedsReview=()=>true;
 assert.equal(ctx.aiTargetDecision({itemName:'洗濯ネット 洗える'}).callAi,true);
});

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

test('preview version identifies stale iPhone sessions and weak copy is blocked',()=>{assert.match(html,/id="urenaviPreviewVersion"/);assert.match(html,/function roomCopyNeedsReview\(text\)/);assert.match(html,/!roomCopyNeedsReview\(text\)/);assert.doesNotMatch(html,/投稿済みにして次の商品へ/);});

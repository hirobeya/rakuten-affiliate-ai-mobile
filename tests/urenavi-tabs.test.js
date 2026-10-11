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

test('next product search button switches to in-app search without an external URL',()=>{assert.match(html,/id="urenaviNextSearchBtn"/);assert.match(html,/function goToProductSearch\(\)\{\s*choose\('search'\)/);assert.match(html,/getElementById\('urenaviNextSearchBtn'\)\.addEventListener\('click',[\s\S]*?goToProductSearch\(\)/);assert.match(html,/function goToProductSearch\(\)/);assert.match(html,/search\.scrollIntoView\(\{block:'start'\}\)/);assert.match(html,/event\.stopPropagation\(\)/);});

test('ROOM management screens explain steps and retain their operational controls',()=>{
 for(const text of ['いいね・フォロー管理','対応待ち（返しを優先）','投稿確認・売上管理','実際にROOMへ投稿してから'])assert.ok(html.includes(text));
 for(const id of ['roomOpsAdd','roomOpsQueue','roomOpsRestorePreview','roomOpsRestoreApply','outcomeSave','outcomeRestorePreview','outcomeRestoreApply'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/class="urenaviAdvanced"/);
});

test('management flow prioritizes confirmation and keeps legacy records secondary',()=>{const a=html.indexOf('<h3>① 投稿できたかを確認</h3>'),b=html.indexOf('<h3>② 商品別の成果を入力</h3>'),c=html.indexOf('<h3>③ 次の商品選びのヒント</h3>');assert.ok(a>0&&a<b&&b<c);assert.match(html,/<details class="proTasks urenaviAdvanced" id="proActivityPanel">/);assert.match(html,/<summary>名前・理由を追加する（任意）<\/summary>/);});

test('outcomes navigation provides evidence-bounded next choice',()=>{assert.match(html,/id="outcomeDecision"/);assert.match(html,/次の商品選びのヒント/);assert.match(html,/商品別の記録を詳しく比較する/);});

test('exchange shortcuts and earnings follow-up remain in the same app',()=>{for(const id of ['roomOpsQuickStatus','roomOpsQuickGo','roomOpsPaste','outcomeToSearch'])assert.match(html,new RegExp('id="'+id+'"'));assert.match(html,/getElementById\('outcomeToSearch'\)\.addEventListener\('click',goToProductSearch\)/);assert.match(html,/navigator\.clipboard\.readText\(\)/);});

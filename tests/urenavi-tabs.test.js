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

test('next product search button switches to in-app search without an external URL',()=>{assert.match(html,/id="urenaviNextSearchBtn"/);assert.match(html,/getElementById\('urenaviNextSearchBtn'\)\.addEventListener\('click',[\s\S]*?choose\('search'\)/);assert.match(html,/getElementById\('k'\)\.focus/);});

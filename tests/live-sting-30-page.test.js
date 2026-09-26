'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const file=path.join(__dirname,'../public/live-sting-30.html');
const html=fs.readFileSync(file,'utf8');

function keywordList(){
  const m=html.match(/const KEYWORDS=\[([\s\S]*?)\];/);
  assert.ok(m,'KEYWORDS list must exist');
  return [...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);
}

test('live sting harness has exactly 30 unique product families',()=>{
  const keys=keywordList();
  assert.equal(keys.length,30);
  assert.equal(new Set(keys).size,30);
});

test('live sting harness never auto-starts Groq on page load',()=>{
  assert.match(html,/\$\('run'\)\.onclick=run/);
  assert.doesNotMatch(html,/if\(s&&!finalPayload&&!running\)run\(\)/);
  assert.match(html,/ページを開いただけではGroqを呼びません/);
});

test('live sting result keeps human persuasiveness score separate from safety evaluation',()=>{
  assert.match(html,/humanScore:''/);
  assert.match(html,/humanNote:''/);
  assert.match(html,/刺さる \/ 普通 \/ 刺さらない/);
  assert.match(html,/typeGrounded/);
  assert.match(html,/factsGrounded/);
});

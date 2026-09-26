'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../public/v3-live-30.html'),'utf8');

const listMatch=html.match(/const KEYWORDS=\[(.*?)\];/s);
assert.ok(listMatch,'keyword list missing');
const keywords=Function(`return [${listMatch[1]}]`)();
assert.equal(keywords.length,30);
assert.equal(new Set(keywords).size,30);
assert.match(html,/まず5件だけ実測/);
assert.match(html,/残り25件を実測/);
assert.match(html,/runRange\(0,5\)/);
assert.match(html,/runRange\(5,30\)/);
assert.doesNotMatch(html,/(?:DOMContentLoaded|load|pageshow)[\s\S]{0,180}runRange\(/);
assert.doesNotMatch(html,/setInterval\([^)]*runRange/);
assert.match(html,/if\(ai\.status===429\)stop=true/);
assert.match(html,/groq:\s*ai\.data\?\.groq/);
assert.match(html,/\/api\/room-ai-v3/);
console.log('super-urenavi-v3-live30-page.test.js: PASS');

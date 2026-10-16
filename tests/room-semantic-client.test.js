'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {run}=require('../public/room-preview-request');

(async()=>{
 let calls=0,waits=0;
 const out=await run({itemName:'商品'},{
  fetchImpl:async()=>{calls++;return {status:202,json:async()=>({pending:true,phase:'verification',retryAfterMs:1700})};},
  waitImpl:async()=>{waits++;}
 });
 assert.equal(out.status,202);
 assert.equal(calls,1);
 assert.equal(waits,0);

 const html=fs.readFileSync(require('node:path').join(__dirname,'../public/app.html'),'utf8');
 assert.match(html,/RoomCopyResult\.canonical\(result\)\) return RoomCopyResult\.ready\(result\)/);
 assert.match(html,/unexpected_ai_contract/);
 assert.doesNotMatch(
  html,
  /startsWith\('super-urenavi-v3-'\)\|\|String\(ai\.data\?\.version\|\|''\)\.startsWith\('room_contract_'\)/
 );
 console.log('room-semantic-client: PASS (verified canonical contract; no automatic polling)');
})().catch(e=>{console.error(e);process.exitCode=1;});

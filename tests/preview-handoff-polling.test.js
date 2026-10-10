'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/access-guard.js','utf8');
const fn=source.slice(source.indexOf('  function startHandoffPolling('),source.indexOf('  const logoutBtn='));
const timers=new Map(),values=new Map();let sequence=0,pending;
const sandbox={localStorage:{getItem:k=>values.get(k),removeItem:k=>values.delete(k)},setTimeout:f=>{const id=++sequence;timers.set(id,f);return id;},clearTimeout:id=>timers.delete(id),fetch:()=>new Promise(resolve=>{pending=resolve;}),Date,encodeURIComponent};
vm.createContext(sandbox);vm.runInContext("let handoffTimer=null,handoffPollGeneration=0,deviceAllowed=false,deviceEmail='';const HANDOFF_KEY='pending';"+fn+"globalThis.start=startHandoffPolling;globalThis.allowed=()=>deviceAllowed;",sandbox);
(async()=>{
 values.set('pending','a'.repeat(64));sandbox.start();const old=timers.values().next().value;const running=old();
 values.set('pending','b'.repeat(64));sandbox.start(true);
 pending({status:200,json:async()=>({email:'test@example.invalid'})});await running;
 assert.equal(sandbox.allowed(),false,'old reply must not grant access or consume new request');assert.equal(values.get('pending'),'b'.repeat(64));
 const newest=timers.get(sequence);const current=newest();pending({status:200,json:async()=>({email:'test@example.invalid'})});await current;
 assert.equal(sandbox.allowed(),true);assert.equal(values.has('pending'),false);
 console.log('preview-handoff-polling.test.js: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});

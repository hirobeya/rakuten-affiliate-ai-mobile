'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDurableComparisonJournal}=require('../../lib/urenavi-core/comparison-journal');
const {createIsolatedComparisonSupabase}=require('../../scripts/rebuild/isolated-comparison-supabase.cjs');

function fixture(){
 const records=new Map(),calls=[];
 const db=async(path,{body})=>{
  const params=JSON.parse(body);calls.push(path);
  if(path.endsWith('_lock_v2')){
   if(records.has('execution-lock'))return false;
   records.set('execution-lock',params.p_token);return true;
  }
  if(path.endsWith('_unlock_v2')){
   if(records.get('execution-lock')!==params.p_token)return false;
   records.delete('execution-lock');return true;
  }
  if(path.endsWith('_create_v2')){
   if(records.has(params.p_key)||params.p_key==='execution-lock')return false;
   records.set(params.p_key,params.p_value);return true;
  }
  if(path.endsWith('_read_v2'))return records.get(params.p_key)??null;
  throw Error('unexpected_rpc');
 };
 return {db,records,calls};
}

test('durable comparison journal persists exact records and locks across process reconstruction',async()=>{
 const {db,records,calls}=fixture();
 const a=createDurableComparisonJournal(db),b=createDurableComparisonJournal(db);
 const unlock=await a.lock();
 await assert.rejects(b.lock(),/durable_comparison_lock_unavailable/);
 await a.create('attempt-claim',{itemCode:'A:1',text:'日本語',status:'sent'});
 assert.deepEqual(await b.read('attempt-claim'),{itemCode:'A:1',text:'日本語',status:'sent'});
 await assert.rejects(b.create('attempt-claim',{status:'replay'}),/durable_journal_create_unconfirmed/);
 assert.equal(await a.read('absent'),null);
 assert.ok(records.has('execution-lock'));
 await unlock();
 await assert.rejects(unlock(),/already_released/);
 const resume=await b.lock();
 await resume();
 assert.ok(calls.includes('rpc/urenavi_comparison_journal_create_v2'));
 assert.ok(calls.includes('rpc/urenavi_comparison_journal_read_v2'));
});
test('durable lock and persistence fail closed on ambiguous database response',async()=>{
 const journal=createDurableComparisonJournal(async(path)=>path.endsWith('_read_v2')?undefined:false);
 await assert.rejects(journal.lock(),/durable_comparison_lock_unavailable/);
 await assert.rejects(journal.create('a',{}),/durable_journal_create_unconfirmed/);
 await assert.rejects(journal.read('a'),/durable_journal_read_unconfirmed/);
});
test('hosted comparison access is pinned to newly isolated Supabase only',()=>{
 const creds={serviceKey:'fake',ownerJwt:'fake',fetchImpl:async()=>{throw Error('not_called');}};
 for(const url of ['https://upooxcugrplfmjnqpuxs.supabase.co/',
  'https://other.supabase.co/','http://vyzpklomggsazwigxkfh.supabase.co/',
  'https://vyzpklomggsazwigxkfh.supabase.co.evil.org/',
  'https://vyzpklomggsazwigxkfh.supabase.co/path','https://vyzpklomggsazwigxkfh.supabase.co/?x=1'
 ]){
  assert.throws(()=>createIsolatedComparisonSupabase({...creds,url,allowRemote:true}),
   /isolated_supabase_destination_required/,url);
 }
 assert.throws(()=>createIsolatedComparisonSupabase({
  ...creds,url:'https://vyzpklomggsazwigxkfh.supabase.co/'
 }),/isolated_supabase_destination_required/);
 assert.ok(createIsolatedComparisonSupabase({
  ...creds,url:'https://vyzpklomggsazwigxkfh.supabase.co/',allowRemote:true
 }).db);
 assert.ok(createIsolatedComparisonSupabase({...creds,url:'http://127.0.0.1:54321'}).db);
});

'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');

// Use a dedicated persistent local volume. Exclusive file creation keeps
// records immutable and missing/partial receipts fail closed on re-entry.
function createComparisonJournal(directory){
 if(!path.isAbsolute(directory))throw Error('absolute_comparison_journal_required');
 function location(key){
  if(!/^[a-z0-9-]{1,100}$/u.test(key))throw Error('invalid_comparison_journal_key');
  return path.join(directory,key+'.json');
 }
 async function syncDirectory(){
  const dir=await fs.open(directory,'r');
  try{await dir.sync();}finally{await dir.close();}
 }
 return {
  async lock(){
   const file=location('execution-lock');
   const handle=await fs.open(file,'wx',0o600);
   try{await handle.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));await handle.sync();}
   finally{await handle.close();}
   await syncDirectory();
   return async()=>{await fs.unlink(file);await syncDirectory();};
  },
  async read(key){
   try{return JSON.parse(await fs.readFile(location(key),'utf8'));}
   catch(error){if(error.code==='ENOENT')return null;throw error;}
  },
  async create(key,value){
   const handle=await fs.open(location(key),'wx',0o600);
   try{await handle.writeFile(JSON.stringify(value)+'\n','utf8');await handle.sync();}
   finally{await handle.close();}
   await syncDirectory();
  }
 };
}
// Database-backed equivalent of the local journal API. The adapter only
// accepts a caller-supplied, service-role authenticated DB request function.
// All records and the execution mutex survive an Actions runner shutdown.
function createDurableComparisonJournal(db){
 if(typeof db!=='function')throw Error('comparison_journal_db_required');
 const {randomUUID}=require('node:crypto');
 const verifyKey=key=>{
  if(typeof key!=='string'||!/^[a-z0-9-]{1,100}$/.test(key))
   throw Error('invalid_comparison_journal_key');
  return key;
 };
 const rpc=async(action,args)=>{
  const result=await db('rpc/urenavi_comparison_journal_'+action+'_v2',{
   method:'POST',body:JSON.stringify(args)
  });
  return result;
 };
 return {
  async lock(){
   const token=randomUUID();
   if(await rpc('lock',{p_token:token})!==true)
    throw Error('durable_comparison_lock_unavailable');
   let released=false;
   return async()=>{
    if(released)throw Error('comparison_lock_already_released');
    if(await rpc('unlock',{p_token:token})!==true)
     throw Error('durable_comparison_unlock_unconfirmed');
    released=true;
   };
  },
  async read(key){
   const value=await rpc('read',{p_key:verifyKey(key)});
   if(value===null)return null;
   if(typeof value!=='string')throw Error('durable_journal_read_unconfirmed');
   return JSON.parse(value);
  },
  async create(key,value){
   const json=JSON.stringify(value);
   if(!json||await rpc('create',{p_key:verifyKey(key),p_value:json})!==true)
    throw Error('durable_journal_create_unconfirmed');
  }
 };
}
module.exports={createComparisonJournal,createDurableComparisonJournal};

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
module.exports={createComparisonJournal};

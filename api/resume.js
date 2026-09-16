const {authorize, db} = require('../lib/billing');

const TABLE='urenavi_search_sessions';
const PENDING='pending';
const PROCESSING='processing';
const POSTED='posted';
const allowedStatus=new Set([PENDING,PROCESSING,POSTED]);

const emailOf=result=>String(result?.user?.email||'').trim().toLowerCase();
const uuid=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(x||''));
const itemKey=item=>String(item?.itemCode || item?.affiliateUrl || item?.itemUrl || `${item?.itemName||''}|${item?.itemPrice||''}`);

function validateItems(items){
  return Array.isArray(items) && items.length>0 && items.length<=10 && items.every(i=>i && typeof i==='object' && typeof i.itemName==='string');
}

function cleanFields(value){
  const v=value && typeof value==='object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(['k','min','max','sort'].map(k=>[k,String(v[k]||'').slice(0,500)]));
}

function cleanPlatforms(value,count){
  const v=Array.isArray(value)?value:[];
  return Array.from({length:count},(_,i)=>['room','threads','instagram'].includes(v[i])?v[i]:'room');
}

function statusesFor(items,existing={}){
  const out={};
  for(const item of items){
    const key=itemKey(item);
    const status=existing?.[key];
    out[key]=allowedStatus.has(status)?status:PENDING;
  }
  return out;
}

function signature(items,fields){
  return JSON.stringify({
    k:String(fields?.k||''),min:String(fields?.min||''),max:String(fields?.max||''),sort:String(fields?.sort||''),
    keys:items.map(itemKey)
  });
}

async function activeFor(email){
  const qs=new URLSearchParams({email:'eq.'+email,status:'eq.active',select:'*',order:'updated_at.desc',limit:'1'});
  const rows=await db(TABLE+'?'+qs);
  return rows?.[0]||null;
}

async function sessionFor(email,id){
  if(!uuid(id)) return null;
  const qs=new URLSearchParams({id:'eq.'+id,email:'eq.'+email,select:'*',limit:'1'});
  const rows=await db(TABLE+'?'+qs);
  return rows?.[0]||null;
}

async function updateRow(id,email,patch){
  const qs=new URLSearchParams({id:'eq.'+id,email:'eq.'+email});
  const rows=await db(TABLE+'?'+qs,{
    method:'PATCH',
    headers:{Prefer:'return=representation'},
    body:JSON.stringify({...patch,updated_at:new Date().toISOString()})
  });
  return rows?.[0]||null;
}

async function saveSearch(email,body){
  const items=body.items;
  if(!validateItems(items)) throw Object.assign(new Error('Invalid items'),{status:400});
  const searchFields=cleanFields(body.search_fields);
  const platforms=cleanPlatforms(body.platforms,items.length);
  const active=await activeFor(email);

  if(active && signature(active.items||[],active.search_fields||{})===signature(items,searchFields)){
    return updateRow(active.id,email,{
      items,
      search_fields:searchFields,
      item_statuses:statusesFor(items,active.item_statuses||{}),
      platforms
    });
  }

  if(active) await updateRow(active.id,email,{status:'completed'});
  const row={
    email,
    status:'active',
    search_fields:searchFields,
    items,
    item_statuses:statusesFor(items,{}),
    platforms,
    current_index:0,
    updated_at:new Date().toISOString()
  };
  const rows=await db(TABLE,{
    method:'POST',
    headers:{Prefer:'return=representation'},
    body:JSON.stringify(row)
  });
  return rows?.[0]||null;
}

async function markProcessing(email,body){
  const row=await sessionFor(email,body.session_id);
  if(!row || row.status!=='active') throw Object.assign(new Error('Session not found'),{status:404});
  const index=Number(body.index);
  if(!Number.isInteger(index)||index<0||index>=row.items.length) throw Object.assign(new Error('Invalid item index'),{status:400});
  const statuses=statusesFor(row.items,row.item_statuses||{});
  for(const key of Object.keys(statuses)) if(statuses[key]===PROCESSING) statuses[key]=PENDING;
  statuses[itemKey(row.items[index])]=PROCESSING;
  return updateRow(row.id,email,{item_statuses:statuses,current_index:index,platforms:cleanPlatforms(body.platforms,row.items.length)});
}

async function markPostedNext(email,body){
  const row=await sessionFor(email,body.session_id);
  if(!row || row.status!=='active') throw Object.assign(new Error('Session not found'),{status:404});
  const statuses=statusesFor(row.items,row.item_statuses||{});
  let current=row.items.findIndex(item=>statuses[itemKey(item)]===PROCESSING);
  if(current>=0) statuses[itemKey(row.items[current])]=POSTED;

  let next=-1;
  for(let i=Math.max(0,current+1);i<row.items.length;i++){
    if(statuses[itemKey(row.items[i])]===PENDING){next=i;break;}
  }
  if(next<0){
    for(let i=0;i<=current && i<row.items.length;i++){
      if(statuses[itemKey(row.items[i])]===PENDING){next=i;break;}
    }
  }

  if(next<0){
    const updated=await updateRow(row.id,email,{item_statuses:statuses,status:'completed'});
    return {session:updated,next:null};
  }

  statuses[itemKey(row.items[next])]=PROCESSING;
  const updated=await updateRow(row.id,email,{item_statuses:statuses,current_index:next});
  return {session:updated,next:{index:next,item:row.items[next]}};
}

async function savePlatforms(email,body){
  const row=await sessionFor(email,body.session_id);
  if(!row || row.status!=='active') throw Object.assign(new Error('Session not found'),{status:404});
  return updateRow(row.id,email,{platforms:cleanPlatforms(body.platforms,row.items.length)});
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  if(!['GET','POST'].includes(req.method)) return res.status(405).json({message:'Method not allowed'});
  try{
    const auth=await authorize(req);
    if(!auth.ok) return res.status(auth.status||401).json({message:'Authentication required'});
    const email=emailOf(auth);
    if(!email) return res.status(401).json({message:'Authentication required'});

    if(req.method==='GET'){
      return res.status(200).json({session:await activeFor(email)});
    }

    const body=req.body&&typeof req.body==='object'?req.body:{};
    let result;
    switch(String(body.action||'')){
      case 'save-search': result={session:await saveSearch(email,body)}; break;
      case 'mark-processing': result={session:await markProcessing(email,body)}; break;
      case 'posted-next': result=await markPostedNext(email,body); break;
      case 'save-platforms': result={session:await savePlatforms(email,body)}; break;
      default: return res.status(400).json({message:'Invalid action'});
    }
    return res.status(200).json(result);
  }catch(e){
    console.error('resume failed',e?.message||'unknown');
    return res.status(Number(e?.status)||503).json({message:Number(e?.status)<500?e.message:'続き情報を保存できませんでした。時間をおいて再度お試しください。'});
  }
};

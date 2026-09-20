const {db,authorizeProEmail}=require('../lib/billing');
const {searchProducts}=require('../lib/pro-search');

function jstParts(now=new Date()){
  const d=new Date(now.getTime()+9*60*60*1000);
  return {
    date:d.toISOString().slice(0,10),
    hour:d.getUTCHours(),
    minute:d.getUTCMinutes()
  };
}
function parseTime(s){
  const m=String(s||'').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return m?{h:+m[1],m:+m[2]}:null;
}
function minutes(h,m){return h*60+m;}
function scheduledUtc(localDate,time){
  const [y,mo,d]=localDate.split('-').map(Number);
  const t=parseTime(time);
  return new Date(Date.UTC(y,mo-1,d,t.h-9,t.m,0,0)).toISOString();
}
async function recentCodes(email){
  const since=new Date(Date.now()-30*24*60*60*1000).toISOString().slice(0,10);
  const rows=await db('urenavi_pro_queue?'+new URLSearchParams({email:'eq.'+email,local_date:'gte.'+since,select:'items'}));
  const codes=[];
  for(const row of rows||[]) for(const item of Array.isArray(row.items)?row.items:[]) if(item?.itemCode) codes.push(String(item.itemCode));
  return codes;
}
module.exports=async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({message:'Method not allowed'});
  const secret=String(process.env.CRON_SECRET||'');
  if(!secret || req.headers.authorization!==`Bearer ${secret}`) return res.status(401).json({message:'Unauthorized'});
  try{
    const settings=await db('urenavi_pro_settings?enabled=eq.true&select=*');
    const now=new Date();
    const local=jstParts(now);
    const current=minutes(local.hour,local.minute);
    let generated=0,skipped=0,failed=0;

    for(const s of settings||[]){
      try{
        const auth=await authorizeProEmail(s.email);
        if(!auth.ok){skipped++;continue;}
        const times=(Array.isArray(s.posting_times)?s.posting_times:[]).map(String);
        for(const slot of times){
          const t=parseTime(slot);
          if(!t) continue;
          const target=minutes(t.h,t.m);
          let diff=current-target;
          if(diff<0) diff+=24*60;
          if(diff>29) continue;

          const exists=await db('urenavi_pro_queue?'+new URLSearchParams({
            email:'eq.'+s.email,
            local_date:'eq.'+local.date,
            slot:'eq.'+slot,
            select:'id',
            limit:'1'
          }));
          if(exists?.length){skipped++;continue;}

          const excludeCodes=s.avoid_duplicates?await recentCodes(s.email):[];
          const items=await searchProducts(s,{excludeCodes});
          if(!items.length){failed++;continue;}
          await db('urenavi_pro_queue',{
            method:'POST',
            headers:{Prefer:'return=minimal'},
            body:JSON.stringify({
              email:String(s.email).toLowerCase(),
              local_date:local.date,
              slot,
              scheduled_for:scheduledUtc(local.date,slot),
              status:'ready',
              items,
              updated_at:new Date().toISOString()
            })
          });
          generated++;
        }
      }catch(e){
        failed++;
        console.error('pro cron user failed',String(s?.email||''),e?.message||'unknown');
      }
    }
    return res.status(200).json({ok:true,generated,skipped,failed});
  }catch(e){
    console.error('pro cron failed',e?.message||'unknown');
    return res.status(500).json({ok:false});
  }
};

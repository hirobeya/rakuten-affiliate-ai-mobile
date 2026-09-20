const {authorizePro,db,setDeviceCookie}=require('../lib/billing');
const {searchProducts}=require('../lib/pro-search');

const ALLOWED_SORTS=new Set(['standard','-reviewCount','-reviewAverage','-affiliateRate','+itemPrice']);
const DEFAULTS={
  enabled:true,
  genre:'',
  genre_id:null,
  genre_name:null,
  theme:'',
  min_price:null,
  max_price:null,
  sort:'standard',
  sale_priority:true,
  avoid_duplicates:true,
  posting_times:['08:00','12:30','20:00'],
  timezone:'Asia/Tokyo'
};

function jstDate(){
  const d=new Date(Date.now()+9*60*60*1000);
  return d.toISOString().slice(0,10);
}
function cleanTime(v){
  const s=String(v||'');
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s)?s:null;
}
function sanitize(input={}){
  const times=(Array.isArray(input.posting_times)?input.posting_times:DEFAULTS.posting_times)
    .map(cleanTime).filter(Boolean).slice(0,6);
  const min=input.min_price===''||input.min_price==null?null:Number(input.min_price);
  const max=input.max_price===''||input.max_price==null?null:Number(input.max_price);
  if(min!=null&&(!Number.isInteger(min)||min<0)) throw new Error('最低価格を確認してください。');
  if(max!=null&&(!Number.isInteger(max)||max<0)) throw new Error('最高価格を確認してください。');
  if(min!=null&&max!=null&&min>max) throw new Error('価格帯を確認してください。');
  const sort=String(input.sort||DEFAULTS.sort);
  if(!ALLOWED_SORTS.has(sort)) throw new Error('並び順を確認してください。');
  const genreId=input.genre_id==null||input.genre_id===''?null:String(input.genre_id).trim();
  if(genreId && !/^\d+$/.test(genreId)) throw new Error('楽天ジャンルを選び直してください。');
  const genreName=String(input.genre_name||'').trim().slice(0,128)||null;
  const theme=String(input.theme||'').trim().slice(0,128);
  if(!genreId) throw new Error('楽天市場カテゴリーを選んでください。');
  return {
    enabled:input.enabled!==false,
    genre:'',
    genre_id:genreId,
    genre_name:genreName,
    theme,
    min_price:min,
    max_price:max,
    sort,
    sale_priority:input.sale_priority!==false,
    avoid_duplicates:input.avoid_duplicates!==false,
    posting_times:times.length?times:DEFAULTS.posting_times,
    timezone:'Asia/Tokyo',
    updated_at:new Date().toISOString()
  };
}
async function getSettings(email){
  const rows=await db('urenavi_pro_settings?'+new URLSearchParams({email:'eq.'+email,select:'*'}));
  return rows[0]||{email,...DEFAULTS};
}
async function getRecentCodes(email){
  const since=new Date(Date.now()-30*24*60*60*1000).toISOString().slice(0,10);
  const rows=await db('urenavi_pro_queue?'+new URLSearchParams({
    email:'eq.'+email,
    local_date:'gte.'+since,
    select:'items'
  }));
  const codes=[];
  for(const row of rows||[]) for(const item of Array.isArray(row.items)?row.items:[]) if(item?.itemCode) codes.push(String(item.itemCode));
  return codes;
}
async function listQueue(email){
  const date=jstDate();
  return db('urenavi_pro_queue?'+new URLSearchParams({
    email:'eq.'+email,
    local_date:'eq.'+date,
    select:'*',
    order:'scheduled_for.asc'
  }));
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method||'GET')) return res.status(405).json({message:'Method not allowed'});
  try{
    const auth=await authorizePro(req);
    if(!auth.ok) return res.status(auth.status||403).json({message:'pro_subscription_required'});
    const email=String(auth.user?.email||'').trim().toLowerCase();
    if(!email) return res.status(401).json({message:'Authentication required'});
    setDeviceCookie(res,email);

    const action=String(req.query?.action||'status');

    if(req.method==='GET' && action==='status'){
      return res.status(200).json({allowed:true,pro:true,email,settings:await getSettings(email),queue:await listQueue(email)});
    }

    if(req.method==='POST' && action==='settings'){
      const row={email,...sanitize(req.body||{})};
      await db('urenavi_pro_settings?on_conflict=email',{
        method:'POST',
        headers:{Prefer:'resolution=merge-duplicates,return=representation'},
        body:JSON.stringify(row)
      });
      return res.status(200).json({saved:true,settings:row});
    }

    if(req.method==='POST' && action==='generate'){
      const settings=await getSettings(email);
      const excludeCodes=settings.avoid_duplicates?await getRecentCodes(email):[];
      const items=await searchProducts(settings,{excludeCodes});
      if(!items.length) return res.status(404).json({message:'条件に合う新しい商品候補が見つかりませんでした。条件を少し広げてください。'});
      const now=new Date();
      const localDate=jstDate();
      const slot='manual-'+now.toISOString().replace(/\D/g,'').slice(8,14);
      const row={email,local_date:localDate,slot,scheduled_for:now.toISOString(),status:'ready',items,updated_at:now.toISOString()};
      await db('urenavi_pro_queue',{
        method:'POST',
        headers:{Prefer:'return=representation'},
        body:JSON.stringify(row)
      });
      return res.status(200).json({generated:true,items,queue:await listQueue(email)});
    }

    if(req.method==='POST' && action==='queue-status'){
      const id=String(req.body?.id||'');
      const status=String(req.body?.status||'');
      if(!/^[0-9a-f-]{36}$/i.test(id) || !['ready','posted','skipped'].includes(status)) return res.status(400).json({message:'更新内容を確認してください。'});
      await db('urenavi_pro_queue?'+new URLSearchParams({id:'eq.'+id,email:'eq.'+email}),{
        method:'PATCH',
        headers:{Prefer:'return=minimal'},
        body:JSON.stringify({status,updated_at:new Date().toISOString()})
      });
      return res.status(200).json({updated:true});
    }

    return res.status(400).json({message:'Invalid action'});
  }catch(e){
    console.error('pro api failed',e?.message||'unknown');
    return res.status(500).json({message:'Pro処理を完了できませんでした。'});
  }
};

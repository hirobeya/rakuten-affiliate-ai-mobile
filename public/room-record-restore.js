(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RoomRecordRestore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const fail=()=>{throw Error('バックアップの形式・記録内容を確認してください。既存記録は変更していません。');};
const timestamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const text=(x,max)=>typeof x==='string'&&x.length<=max;
const amount=x=>x===null||Number.isSafeInteger(x)&&x>=0;
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&timestamp(x+'T00:00:00Z')&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
function canonical(x){if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';return JSON.stringify(x);}
function validate(d,kind){
 if(!d||d.version!==1)fail();
 const primary=kind==='outcomes'?'products':'candidates',secondary=kind==='outcomes'?'results':'events';
 if(!Array.isArray(d[primary])||!Array.isArray(d[secondary]))fail();
 const ids=new Set();for(const r of d[primary]){
  if(!r||!text(r.id,200)||!r.id||ids.has(r.id))fail();ids.add(r.id);
  if(kind==='outcomes'){
   if(!/^[a-z0-9_-]+:[a-z0-9_.-]+$/.test(r.id)||!text(r.name,1000)||!['prepared','posted'].includes(r.state)||!timestamp(r.preparedAt)||(r.state==='posted'&&!timestamp(r.postedAt)))fail();
  }else{
   if(!['like_visit','like_return','follow_visit','follow_return'].includes(r.type)||!['pending','opened','done','skipped'].includes(r.state)||!text(r.name,160)||!text(r.reason,240)||!timestamp(r.at))fail();
   let u;try{u=new URL(r.url);}catch{fail();}const p=u.pathname.split('/').filter(Boolean);
   if(u.protocol!=='https:'||u.hostname!=='room.rakuten.co.jp'||u.username||u.password||u.port||u.search||u.hash||!p.length||p.length>3||!/^room_[a-zA-Z0-9_-]+$/.test(p[0])||p.some(x=>!/^[-a-zA-Z0-9_]+$/.test(x)))fail();
   if(r.state==='opened'&&!timestamp(r.openedAt)||r.state==='done'&&(!timestamp(r.openedAt)||!timestamp(r.completedAt)))fail();
  }
 }
 const seen=new Set();for(const r of d[secondary]){
  if(!r||!ids.has(kind==='outcomes'?r.id:r.candidateId))fail();
  if(kind==='outcomes'){
   if(!date(r.date)||!['sales','commission','units','minutes'].every(k=>amount(r[k]))||['sales','commission','units','minutes'].every(k=>r[k]===null))fail();const k=r.id+'|'+r.date;if(seen.has(k))fail();seen.add(k);
  }else if(!['open','complete','skip','undo'].includes(r.action)||!timestamp(r.at))fail();
 }
 return {version:1,[primary]:d[primary],[secondary]:d[secondary]};
}
function plan(current,input,kind){
 if(typeof input!=='string'||input.length>2000000)throw Error('バックアップは2MB以内のJSONを指定してください。');
 let incoming;try{incoming=JSON.parse(input);}catch{fail();}incoming=validate(incoming,kind);current=validate(current,kind);
 const primary=kind==='outcomes'?'products':'candidates',secondary=kind==='outcomes'?'results':'events',rows=new Map(current[primary].map(r=>[r.id,r])),details=new Map(current[secondary].map(r=>[kind==='outcomes'?r.id+'|'+r.date:canonical(r),r]));let added=0,records=0;
 for(const r of incoming[primary]){const old=rows.get(r.id);if(old&&canonical(old)!==canonical(r))throw Error('同じ記録の状態・内容が異なるため復元を中止しました。既存記録とバックアップを確認してください。');if(!old){rows.set(r.id,r);added++;}}
 for(const r of incoming[secondary]){const k=kind==='outcomes'?r.id+'|'+r.date:canonical(r),old=details.get(k);if(old&&canonical(old)!==canonical(r))throw Error('同じ商品・日付の実績が異なるため復元を中止しました。');if(!old){details.set(k,r);records++;}}
 if(kind==='operations'){
  // Compare newly imported candidates against current candidates; preserve valid historical repeats.
  const day=x=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(new Date(x));
  for(const r of incoming.candidates.filter(r=>!current.candidates.some(x=>x.id===r.id)))for(const x of rows.values()){
   if(x.id===r.id||x.state==='skipped'||r.state==='skipped')continue;
   const a=new URL(x.url),b=new URL(r.url),follow=r.type.startsWith('follow');
   if(x.type.split('_')[0]!==r.type.split('_')[0]||(follow?a.pathname.split('/')[1]!==b.pathname.split('/')[1]:a.href!==b.href))continue;
   if(follow||x.state!=='done'||r.state!=='done'||day(x.completedAt)===day(r.completedAt))throw Error('同じ相手への重複活動があります。復元を中止しました。');
  }
 }
 return {data:{version:1,[primary]:[...rows.values()],[secondary]:[...details.values()]},added,records};
}
return {plan};
});

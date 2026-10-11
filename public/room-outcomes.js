(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RoomOutcomes=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function identity(item){
 const code=String(item?.itemCode||'').trim();if(/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_.-]+$/.test(code))return code.toLowerCase();
 let u;try{u=new URL(item?.itemUrl||'');}catch{throw new Error('商品の識別情報がありません。商品URL付きの候補を選んでください。');}
 const p=u.pathname.split('/').filter(Boolean);if(u.protocol!=='https:'||u.hostname!=='item.rakuten.co.jp'||u.username||u.password||p.length!==2||p.some(x=>!/^[-a-zA-Z0-9_.]+$/.test(x)))throw new Error('楽天の商品URLを確認してください。');return p.join(':').toLowerCase();
}
function day(value){const d=new Date(value);if(!Number.isFinite(d.getTime()))throw new Error('日時を確認してください。');return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
function number(value){if(value===''||value==null)return null;const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new Error('実績は0以上の整数を入力してください。');return n;}
function createStore(storage,owner){
 if(!String(owner||'').trim())throw new Error('ログインしてから実績を管理してください。');const key='urenavi_room_outcomes_v1:'+encodeURIComponent(String(owner).trim().toLowerCase());
 function read(){const raw=storage.getItem(key);if(!raw)return {version:1,products:[],results:[]};let d;try{d=JSON.parse(raw);}catch{throw new Error('実績データを読み込めません。バックアップを確認してください。');}if(d.version!==1||!Array.isArray(d.products)||!Array.isArray(d.results))throw new Error('実績の保存形式を確認してください。');return d;}
 function save(d){storage.setItem(key,JSON.stringify(d));}
 function prepared(item,at=new Date().toISOString()){const id=identity(item),d=read();let row=d.products.find(p=>p.id===id);if(!row){if(d.products.length>=2000)throw new Error('保存上限です。実績をバックアップしてください。');row={id,name:String(item.itemName||'').slice(0,1000),state:'prepared',preparedAt:at};d.products.push(row);}save(d);return row;}
 function posted(id,at=new Date().toISOString()){const d=read(),p=d.products.find(p=>p.id===id);if(!p||p.state!=='prepared')throw new Error('投稿文をコピーしてから、ROOMでの投稿完了を記録してください。');p.state='posted';p.postedAt=at;save(d);return p;}
 function undo(id){const d=read(),p=d.products.find(p=>p.id===id);if(!p||p.state!=='posted')throw new Error('投稿済み記録がありません。');p.state='prepared';delete p.postedAt;save(d);}
 function isPosted(item){try{return read().products.some(p=>p.id===identity(item)&&p.state==='posted');}catch(e){if(e.message.startsWith('実績'))throw e;return false;}}
 function result(input){const d=read();if(!d.products.some(p=>p.id===input.id&&p.state==='posted'))throw new Error('投稿済み商品を選んでください。');if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||new Date(input.date+'T00:00:00Z').toISOString().slice(0,10)!==input.date)throw new Error('実績の日付を確認してください。');const row={id:input.id,date:input.date,sales:number(input.sales),commission:number(input.commission),units:number(input.units),minutes:number(input.minutes)};if(['sales','commission','units','minutes'].every(k=>row[k]===null))throw new Error('確認できた実績を一つ以上入力してください。');const i=d.results.findIndex(r=>r.id===row.id&&r.date===row.date);if(i<0)d.results.push(row);else d.results[i]=row;save(d);return row;}
 function analysis(){const d=read();return d.products.filter(p=>p.state==='posted').map(p=>{const rows=d.results.filter(r=>r.id===p.id),paired=rows.filter(r=>r.commission!=null&&r.minutes>0);const sum=k=>rows.some(r=>r[k]!=null)?rows.reduce((n,r)=>n+(r[k]??0),0):null;return {id:p.id,name:p.name,sales:sum('sales'),commission:sum('commission'),minutes:sum('minutes'),records:rows.length,paired:paired.length,observedPerHour:paired.length?Math.round(paired.reduce((n,r)=>n+r.commission,0)*60/paired.reduce((n,r)=>n+r.minutes,0)):null};});}
 function summary(){const d=read(),known=field=>{const rows=d.results.filter(r=>r[field]!=null);return {total:rows.length?rows.reduce((s,r)=>s+r[field],0):null,known:rows.length,unknown:d.results.length-rows.length};};return {posted:d.products.filter(p=>p.state==='posted').length,prepared:d.products.filter(p=>p.state==='prepared').length,sales:known('sales'),commission:known('commission'),minutes:known('minutes')};}
 return {read,prepared,posted,undo,isPosted,result,summary,analysis,exportData:()=>JSON.stringify(read(),null,2)};
}
return {identity,day,createStore};
});

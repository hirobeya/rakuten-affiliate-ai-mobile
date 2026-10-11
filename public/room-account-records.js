(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RoomAccountRecords=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';const KEY='urenavi_account_records_v2',REVENUE='urenavi_pro_verified_revenue_v1',ACTIVITY='urenavi_pro_activities_v1',types=new Set(['post','like_visit','like_return','follow_visit','follow_return']);
function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
function money(n){return n===null||Number.isSafeInteger(n)&&n>=0;}
function revenue(data){if(!data||typeof data!=='object'||Array.isArray(data))throw Error('売上記録の保存形式を確認してください。');for(const [day,r] of Object.entries(data))if(!date(day)||!r||!money(r.sales??null)||!money(r.commission??null))throw Error('旧売上に不正な日付・金額があります。元データを修正してから取り込んでください。');return data;}
function activities(rows){if(!Array.isArray(rows)||rows.some(r=>!r||!types.has(r.type)||!date(r.day)||!Number.isFinite(Date.parse(r.at))||typeof(r.note??'')!=='string'))throw Error('活動記録の保存形式を確認してください。');return rows;}
function parsed(raw,fallback){if(raw===null||raw===undefined||raw==='')return fallback;try{return JSON.parse(raw);}catch{throw Error('保存記録を読み込めません。元データは変更していません。');}}
function createStore(storage,owner){const account=String(owner||'').trim().toLowerCase();if(!account)throw Error('ログインしてから記録を保存してください。');
 function all(){const d=parsed(storage.getItem(KEY),{version:2,accounts:{},legacyOwner:null});if(d.version!==2||!d.accounts||typeof d.accounts!=='object'||Array.isArray(d.accounts))throw Error('アカウント記録の形式を確認してください。');return d;}
 function read(){const r=all().accounts[account]||{revenue:{},activities:[]};return {revenue:revenue(r.revenue),activities:activities(r.activities)};}
 function put(r){const d=all();d.accounts[account]={revenue:revenue(r.revenue),activities:activities(r.activities)};storage.setItem(KEY,JSON.stringify(d));}
 function setRevenue(rows){const r=read();r.revenue=rows;put(r);}
 function setActivities(rows){const r=read();r.activities=rows;put(r);}
 function preview(){const d=all();if(d.legacyOwner)return {available:false,claimed:true,own:d.legacyOwner===account};const r=revenue(parsed(storage.getItem(REVENUE),{})),a=activities(parsed(storage.getItem(ACTIVITY),[])),current=read();return {available:Object.keys(r).length+a.length>0,days:Object.keys(r).length,activities:a.length,conflicts:Object.keys(r).filter(k=>current.revenue[k]).length};}
 function migrate(){const d=all();if(d.legacyOwner)throw Error(d.legacyOwner===account?'旧記録は取り込み済みです。':'旧記録は別のアカウントへ取り込み済みです。');const p=preview();if(!p.available)throw Error('取り込める旧記録がありません。');if(p.conflicts)throw Error('同じ日付の売上記録があります。上書きせず、旧記録のバックアップと現在の記録を確認してください。');const oldRevenue=revenue(parsed(storage.getItem(REVENUE),{})),oldActivities=activities(parsed(storage.getItem(ACTIVITY),[])),r=read(),unique=new Set(r.activities.map(x=>JSON.stringify([x.type,x.at,x.day,x.note||''])));for(const row of oldActivities){const key=JSON.stringify([row.type,row.at,row.day,row.note||'']);if(!unique.has(key)){r.activities.push(row);unique.add(key);}}r.revenue={...oldRevenue,...r.revenue};d.accounts[account]=r;d.legacyOwner=account;storage.setItem(KEY,JSON.stringify(d));return p;}
 function legacyBackup(){return JSON.stringify({revenue:parsed(storage.getItem(REVENUE),{}),activities:parsed(storage.getItem(ACTIVITY),[])},null,2);}
 return {read,setRevenue,setActivities,preview,migrate,legacyBackup};
}
return {createStore};
});

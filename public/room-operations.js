(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.RoomOperations=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const labels={like_visit:'いいね回り',like_return:'いいね返し',follow_visit:'フォロー回り',follow_return:'フォロー返し'};
  function day(at){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));}
  function roomUrl(value){
    let u;try{u=new URL(String(value).trim());}catch{throw new Error('相手のROOMのURLを入力してください。');}
    if(u.protocol!=='https:'||u.hostname!=='room.rakuten.co.jp'||u.username||u.password||u.port) throw new Error('https://room.rakuten.co.jp/ で始まる相手のURLが必要です。');
    const parts=u.pathname.split('/').filter(Boolean);
    if(!parts.length||!/^room_[a-zA-Z0-9_-]+$/.test(parts[0])||parts.length>3||parts.some(x=>!/^[-a-zA-Z0-9_]+$/.test(x)))throw new Error('相手のROOMプロフィールまたは投稿のURLを入力してください。');
    u.search='';u.hash='';u.pathname='/'+parts.join('/')+'/';return u.href;
  }
  function key(row){const u=new URL(row.url);return row.type.startsWith('follow')?u.origin+'/'+u.pathname.split('/')[1]+'/':row.url;}
  function sameAction(a,b){return a.type.split('_')[0]===b.type.split('_')[0]&&key(a)===key(b);}
  function createStore(storage,owner){
    if(!String(owner||'').trim())throw new Error('ログインしてから交流を管理してください。');
    const storageKey='urenavi_room_operations_v1:'+encodeURIComponent(String(owner).trim().toLowerCase());
    function read(){
      const raw=storage.getItem(storageKey);
      if(!raw)return {version:1,candidates:[],events:[]};
      let data;try{data=JSON.parse(raw);}catch{throw new Error('交流データを読み込めません。保存内容を確認してください。');}
      if(data.version!==1||!Array.isArray(data.candidates)||!Array.isArray(data.events))throw new Error('交流データの形式を確認してください。');
      return data;
    }
    function save(data){storage.setItem(storageKey,JSON.stringify(data));return data;}
    function add(input,at=new Date().toISOString()){
      const data=read(),row={id:at+'-'+Math.random().toString(36).slice(2,10),type:input.type,url:roomUrl(input.url),name:String(input.name||'').trim().slice(0,160),reason:String(input.reason||'').trim().slice(0,240),state:'pending',at};
      if(!labels[row.type])throw new Error('活動内容を選択してください。');
      if(data.candidates.some(x=>x.state!=='skipped'&&sameAction(x,row)&&(x.state!=='done'||!row.type.startsWith('like')||day(x.completedAt)===day(at))))throw new Error('同じ相手・活動は登録済み、または実施済みです。');
      if(data.candidates.length>=2000)throw new Error('候補が保存上限に達しています。記録をバックアップしてください。');
      data.candidates.push(row);save(data);return row;
    }
    function transition(id,action,at=new Date().toISOString()){
      const data=read(),row=data.candidates.find(x=>x.id===id);
      if(!row)throw new Error('候補が見つかりません。');
      if(action==='open'){
        if(!['pending','opened'].includes(row.state))throw new Error('この候補は完了または保留中です。');
        row.state='opened';row.openedAt=at;
      }else if(action==='complete'){
        if(row.state!=='opened')throw new Error('相手のROOMを開いて、実施を確認してから記録してください。');
        row.state='done';row.completedAt=at;
      }else if(action==='skip'){
        if(!['pending','opened'].includes(row.state))throw new Error('この候補は処理済みです。');
        row.state='skipped';
      }else if(action==='undo'){
        if(!['done','skipped'].includes(row.state))throw new Error('取り消す完了記録がありません。');
        if(data.candidates.some(x=>x.id!==row.id&&x.state!=='skipped'&&sameAction(x,row)&&(x.state!=='done'||!row.type.startsWith('like')||day(x.completedAt)===day(at))))throw new Error('同じ相手・活動の候補または実施済み記録があります。重複するため候補へ戻せません。');
        row.state='pending';delete row.completedAt;delete row.openedAt;
      }else throw new Error('操作を確認してください。');
      data.events.push({candidateId:id,action,at});save(data);return row;
    }
    function queue(){return read().candidates.filter(x=>['pending','opened'].includes(x.state)).sort((a,b)=>Number(b.type.endsWith('_return'))-Number(a.type.endsWith('_return'))||a.at.localeCompare(b.at));}
    function summary(at=new Date().toISOString()){
      const rows=read().candidates,done=rows.filter(x=>x.state==='done'&&day(x.completedAt)===day(at));
      return {pending:queue().length,today:done.length,counts:Object.fromEntries(Object.keys(labels).map(t=>[t,done.filter(x=>x.type===t).length])),next:queue()[0]||null};
    }
 function restorePlan(input){const engine=typeof module==='object'&&module.exports?require('./room-record-restore'):RoomRecordRestore;return engine.plan(read(),input,'operations');}
 function previewRestore(input){const p=restorePlan(input);return {added:p.added,records:p.records};}
 function restore(input){const p=restorePlan(input);save(p.data);return {added:p.added,records:p.records};}
    return {previewRestore,restore,read,add,transition,queue,summary,exportData:()=>JSON.stringify(read(),null,2)};
  }
  return {labels,roomUrl,day,createStore};
});

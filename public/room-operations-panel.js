(function(){
  'use strict';
  let store=null;
  const $=id=>document.getElementById(id);
  const escape=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  function message(s){$('roomOpsMessage').textContent=s;}
  function render(){
    if(!store)return;
    try{
      const data=store.read(),summary=store.summary(),queue=store.queue(),labels=RoomOperations.labels;
      $('roomOpsQuickStatus').textContent=summary.pending?('対応待ち '+summary.pending+'件。'+(summary.next?'次は「'+labels[summary.next.type]+'」を確認しましょう。':'')):'今のところ対応待ちはありません。必要なときだけ候補を登録してください。';
      $('roomOpsQuickGo').textContent=summary.pending?'対応待ち '+summary.pending+'件を見る':'候補の登録欄を見る';
      $('roomTodayCounts').textContent='交流完了 '+summary.today+'件 ／ 対応待ち '+summary.pending+'件';
      $('roomNextAction').textContent=summary.next?labels[summary.next.type]+'：'+(summary.next.name||'登録したROOM')+'を確認しましょう。':'投稿する商品を選ぶか、ROOMで見つけた交流候補を登録しましょう。';
      const term=$('roomOpsFind').value.trim().toLocaleLowerCase('ja-JP');
      const matches=row=>!term||[row.name,row.url,labels[row.type]].some(v=>String(v||'').toLocaleLowerCase('ja-JP').includes(term));
      const filteredQueue=queue.filter(matches);
      const past=data.candidates.filter(row=>['done','skipped'].includes(row.state)&&matches(row));
      const unique=new Set();
      const recent=past.slice().reverse().filter(row=>{
        const k=row.type.split('_')[0]+'|'+row.url.split('/').slice(0,4).join('/');
        if(unique.has(k))return false;
        unique.add(k);return true;
      }).slice(0,6);
      const waitingOverDay=queue.filter(row=>row.type.endsWith('_return')&&Number.isFinite(Date.parse(row.at))&&Date.now()-Date.parse(row.at)>86400000).length;
      $('roomOpsFindStatus').textContent=(term?'検索結果：対応待ち '+filteredQueue.length+'件、履歴 '+past.length+'件。':'過去の相手を再利用できます。')+(waitingOverDay?' ／ 24時間以上前に登録した返し候補 '+waitingOverDay+'件（登録時刻基準）':'');
      $('roomOpsRecent').innerHTML=recent.length?'<h3>過去の相手から再登録</h3>'+recent.map(row=>'<article class="proCard"><b>'+escape(row.name||'相手のROOM')+'</b><p class="proMeta">'+escape(labels[row.type])+' ／ '+escape(row.state==='done'?'実施済み':'保留')+'</p><button type="button" data-room-reuse="'+escape(row.id)+'">この相手を再登録</button></article>').join(''):'';
      $('roomOpsQueue').innerHTML=filteredQueue.map(row=>'<article class="proCard"><b>'+escape(labels[row.type])+'｜'+escape(row.name||'相手のROOM')+'</b><p class="proMeta">'+escape(row.reason||'本人が選んだ交流候補')+'</p><p class="proMeta">'+(row.state==='opened'?'ROOMを開いた状態・実施は未確認':'未対応')+'</p><div class="roomActionRow"><a class="roomLink" href="'+escape(row.url)+'" target="_blank" rel="noopener noreferrer" data-room-open="'+escape(row.id)+'">相手のROOMを開く</a><button type="button" data-room-complete="'+escape(row.id)+'" '+(row.state!=='opened'?'disabled':'')+'>実施したと記録</button><button type="button" data-room-skip="'+escape(row.id)+'">保留</button></div></article>').join('')||'<p class="proHint">対応待ちはありません。いいね・フォローの実操作はROOMで行います。</p>';
      $('roomOpsHistory').innerHTML=past.slice(-50).reverse().map(row=>'<article class="proCard"><b>'+escape(labels[row.type])+'｜'+escape(row.name||'相手のROOM')+'</b><p class="proMeta">'+(row.state==='done'?'本人が実施を確認：'+escape(new Date(row.completedAt).toLocaleString('ja-JP')):'保留')+'</p><button type="button" data-room-reuse="'+escape(row.id)+'">同じ相手を候補に追加</button><button type="button" data-room-undo="'+escape(row.id)+'">'+(row.state==='done'?'記録を取り消して候補へ戻す':'候補へ戻す')+'</button></article>').join('')||'<p class="proHint">履歴はまだありません。</p>';
      window.dispatchEvent(new Event('room-outcomes-change'));
      const counts=summary.counts;
      $('roomOpsAnalysis').textContent=Object.keys(labels).map(k=>labels[k]+' '+counts[k]+'件').join(' ／ ')+'。返しの候補を優先表示しています。実施件数から売上への効果は判断できません。';
    }catch(e){message(e.message);}
  }
  window.roomOperationsOverview=()=>store?store.summary():null;
  window.roomOperationsToday=()=>store?store.summary().today:0;
  window.initRoomOperations=function(owner){
    try{store=RoomOperations.createStore(localStorage,owner);render();message('候補・履歴はこのブラウザに保存されます。端末を変える前にバックアップしてください。');}
    catch(e){store=null;message(e.message);}
  };
  $('roomOpsFind').addEventListener('input',render);
  $('roomOpsAdd').addEventListener('click',()=>{
    try{
      if(!store)throw new Error('ログイン状態を確認してください。');
      store.add({type:$('roomOpsType').value,url:$('roomOpsUrl').value,name:$('roomOpsName').value,reason:$('roomOpsReason').value});
      $('roomOpsUrl').value='';$('roomOpsName').value='';$('roomOpsReason').value='';render();message('候補を保存しました。返しの候補から順に確認できます。');
    }catch(e){message(e.message);}
  });
  $('roomOpsPanel').addEventListener('click',event=>{
    const button=event.target.closest('[data-room-open],[data-room-complete],[data-room-skip],[data-room-undo],[data-room-reuse]');
    if(!button)return;
    if(button.dataset.roomReuse){
      try{
        if(!store)throw new Error('ログイン状態を確認してください。');
        const previous=store.read().candidates.find(row=>row.id===button.dataset.roomReuse);
        if(!previous)throw new Error('元の履歴がありません。');
        store.add({type:previous.type,url:previous.url,name:previous.name,reason:previous.reason});
        render();message('同じ相手を新しい候補に追加しました。対応待ちに表示します。');
      }catch(error){message(error.message);}
      return;
    }
    const entry=[['roomOpen','open'],['roomComplete','complete'],['roomSkip','skip'],['roomUndo','undo']].find(([k])=>button.dataset[k]);
    try{
      if(!store)throw new Error('ログイン状態を確認してください。');
      if(entry[1]==='complete'&&!window.confirm('楽天ROOMで実際に行った活動ですか？実施済みの場合だけ記録します。'))return;
      store.transition(button.dataset[entry[0]],entry[1]);
      // Keep the clicked anchor alive until the browser opens its target.
      if(entry[1]==='open')setTimeout(render,0);else render();
      message(entry[1]==='open'?'ROOMを開きました。活動を行って戻ったら、実施を記録してください。':'状態を保存しました。');
    }catch(e){event.preventDefault();message(e.message);}
  });
  $('roomOpsExport').addEventListener('click',async()=>{
    try{
      if(!store)throw new Error('ログイン状態を確認してください。');
      const backup=store.exportData();
      $('roomOpsBackup').value=backup;$('roomOpsBackup').hidden=false;
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(backup);message('バックアップをコピーしました。安全な場所に保存してください。');}
      else message('下のバックアップを選択してコピーしてください。');
    }catch(e){message('コピーできません。下のバックアップを選択してコピーしてください。');}
  });
  RoomRestorePanel.bind('roomOps',()=>store,render,message);
window.addEventListener('storage',render);
})();

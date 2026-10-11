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
      $('roomTodayCounts').textContent='交流完了 '+summary.today+'件 ／ 対応待ち '+summary.pending+'件';
      $('roomNextAction').textContent=summary.next?labels[summary.next.type]+'：'+(summary.next.name||'登録したROOM')+'を確認しましょう。':'投稿する商品を選ぶか、ROOMで見つけた交流候補を登録しましょう。';
      $('roomOpsQueue').innerHTML=queue.map(row=>'<article class="proCard"><b>'+escape(labels[row.type])+'｜'+escape(row.name||'相手のROOM')+'</b><p class="proMeta">'+escape(row.reason||'本人が選んだ交流候補')+'</p><p class="proMeta">'+(row.state==='opened'?'ROOMを開いた状態・実施は未確認':'未対応')+'</p><div class="roomActionRow"><a class="roomLink" href="'+escape(row.url)+'" target="_blank" rel="noopener noreferrer" data-room-open="'+escape(row.id)+'">相手のROOMを開く</a><button type="button" data-room-complete="'+escape(row.id)+'" '+(row.state!=='opened'?'disabled':'')+'>実施したと記録</button><button type="button" data-room-skip="'+escape(row.id)+'">保留</button></div></article>').join('')||'<p class="proHint">対応待ちはありません。いいね・フォローの実操作はROOMで行います。</p>';
      $('roomOpsHistory').innerHTML=data.candidates.filter(x=>['done','skipped'].includes(x.state)).slice(-50).reverse().map(row=>'<article class="proCard"><b>'+escape(labels[row.type])+'｜'+escape(row.name||'相手のROOM')+'</b><p class="proMeta">'+(row.state==='done'?'本人が実施を確認：'+escape(new Date(row.completedAt).toLocaleString('ja-JP')):'保留')+'</p><button type="button" data-room-undo="'+escape(row.id)+'">'+(row.state==='done'?'記録を取り消して候補へ戻す':'候補へ戻す')+'</button></article>').join('')||'<p class="proHint">履歴はまだありません。</p>';
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
  $('roomOpsAdd').addEventListener('click',()=>{
    try{
      if(!store)throw new Error('ログイン状態を確認してください。');
      store.add({type:$('roomOpsType').value,url:$('roomOpsUrl').value,name:$('roomOpsName').value,reason:$('roomOpsReason').value});
      $('roomOpsUrl').value='';$('roomOpsName').value='';$('roomOpsReason').value='';render();message('候補を保存しました。返しの候補から順に確認できます。');
    }catch(e){message(e.message);}
  });
  $('roomOpsPanel').addEventListener('click',event=>{
    const button=event.target.closest('[data-room-open],[data-room-complete],[data-room-skip],[data-room-undo]');
    if(!button)return;
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

(function(){
'use strict';let store=null;const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
function msg(s){$('outcomeMsg').textContent=s;}
window.roomOutcomeOverview=()=>store?store.summary():null;
window.roomOutcomeToday=()=>store?store.summary().todayPosts:0;
function decision(analysis,summary){
 const measured=analysis.filter(p=>p.commission!==null&&p.records>0);
 if(summary.prepared)return 'まずコピー済み・投稿未確認の'+summary.prepared+'商品を確認しましょう。投稿前の商品を実績に混ぜません。';
 if(!summary.posted)return 'まだ投稿記録がありません。商品検索から投稿を準備しましょう。';
 if(!measured.length)return '投稿済みの商品はありますが、商品別の報酬記録がありません。楽天で確認できた実績があれば入力しましょう。';
 const ordered=[...measured].sort((a,b)=>b.commission-a.commission);
 if(ordered.length===1)return '「'+ordered[0].name.slice(0,45)+'」に報酬の記録があります。比較するには、別の商品にも確認済み実績が必要です。';
 const first=ordered[0],second=ordered[1];
 return '記録済み商品のうち「'+first.name.slice(0,45)+'」の入力報酬が最も大きい（'+first.commission.toLocaleString()+'円）。次はこの商品と比較対象のジャンル・価格・用途を確認しましょう。記録期間と未入力の違いがあるため、売れやすさの順位や将来の成果を意味しません。';
}
function render(){if(!store)return;try{const d=store.read(),s=store.summary(),money=x=>x.total===null?'未記録':x.total.toLocaleString()+'円';$('outcomeSummary').textContent='投稿確認 '+s.posted+'商品 ／ コピー済み・投稿未確認 '+s.prepared+'商品 ／ 商品別売上 '+money(s.sales)+' ／ 入力報酬（区分未確認） '+money(s.commission)+' ／ 作業時間 '+(s.minutes.total===null?'未記録':s.minutes.total+'分');const selected=$('outcomeProduct').value;$('outcomeProduct').innerHTML='<option value="">投稿済み商品を選択</option>'+d.products.filter(p=>p.state==='posted').map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');$('outcomeProduct').value=selected;$('outcomeHistory').innerHTML=d.products.slice(-50).reverse().map(p=>'<article class="proCard"><b>'+esc(p.name)+'</b><p>'+ (p.state==='posted'?'本人確認済みの投稿':'コピー済み・投稿未確認')+'</p><button type="button" data-outcome-'+(p.state==='posted'?'undo':'post')+'="'+esc(p.id)+'">'+(p.state==='posted'?'投稿記録を取り消す':'ROOMに投稿したと記録')+'</button>'+d.results.filter(r=>r.id===p.id).map(r=>'<p class="proMeta">'+esc(r.date)+' ｜ 売上 '+(r.sales??'未記録')+'円 ／ 報酬 '+(r.commission??'未記録')+'円 ／ 販売 '+(r.units??'未記録')+'件 ／ 作業 '+(r.minutes??'未記録')+'分</p>').join('')+'</article>').join('');$('outcomeDecision').textContent=decision(store.analysis(),s);$('outcomeComparison').innerHTML=store.analysis().map(p=>'<article class="proCard"><b>'+esc(p.name)+'</b><p>記録分の売上 '+(p.sales??'未記録')+'円 ／ 報酬 '+(p.commission??'未記録')+'円 ／ 作業 '+(p.minutes??'未記録')+'分</p><p class="proMeta">同じ日付に報酬・時間を記録した '+p.paired+'日分の報酬／作業1時間：'+(p.observedPerHour===null?'算出できません':p.observedPerHour+'円')+'。記録範囲の比較で、今後の収益予測ではありません。</p></article>').join('');$('outcomeAdvice').textContent=s.prepared?'コピー済みの商品の投稿完了を確認しましょう。':s.posted&&!d.results.length?'楽天の実績画面で確認できた商品別成果を記録しましょう。':'商品別の売上・報酬と作業時間を比較し、次の商品選びに使いましょう。';window.dispatchEvent(new Event('room-outcomes-change'));}catch(e){msg(e.message);}}
window.initRoomOutcomes=function(owner){try{store=RoomOutcomes.createStore(localStorage,owner);render();$('outcomeDate').value=RoomOutcomes.day(new Date());}catch(e){store=null;msg(e.message);}};
window.roomOutcomePosted=item=>store?store.isPosted(item):false;
window.roomOutcomePrepared=function(item){try{if(!store)throw new Error('ログイン状態を確認してください。');store.prepared(item);render();msg('コピー済みとして保存しました。ROOMで投稿した後、投稿完了を記録してください。');}catch(e){msg(e.message);}};
$('roomOutcomesPanel').addEventListener('click',e=>{const b=e.target.closest('[data-outcome-post],[data-outcome-undo]');if(!b||!store)return;try{if(b.dataset.outcomePost){if(!confirm('楽天ROOMでこの商品の投稿を完了しましたか？コピーだけでは投稿済みになりません。'))return;store.posted(b.dataset.outcomePost);}else{if(!confirm('投稿済み記録を取り消して候補に戻しますか？楽天ROOMの投稿は削除されません。'))return;store.undo(b.dataset.outcomeUndo);}render();msg('記録を保存しました。');}catch(error){msg(error.message);}});
$('outcomeProduct').addEventListener('change',load);$('outcomeDate').addEventListener('change',load);
function load(){if(!store)return;try{const row=store.read().results.find(r=>r.id===$('outcomeProduct').value&&r.date===$('outcomeDate').value);for(const k of ['sales','commission','units','minutes'])$('outcome-'+k).value=row?.[k]??'';}catch(e){msg(e.message);}}
$('outcomeSave').addEventListener('click',()=>{try{if(!store)throw new Error('ログイン状態を確認してください。');const input={id:$('outcomeProduct').value,date:$('outcomeDate').value};for(const k of ['sales','commission','units','minutes'])input[k]=$('outcome-'+k).value;store.result(input);render();msg('同じ商品・日付の実績を保存しました。再保存は上書きされ、二重加算しません。');}catch(e){msg(e.message);}});
$('outcomeExport').addEventListener('click',async()=>{try{if(!store)throw new Error('ログイン状態を確認してください。');$('outcomeBackup').hidden=false;$('outcomeBackup').value=store.exportData();await navigator.clipboard.writeText($('outcomeBackup').value);msg('実績バックアップをコピーしました。');}catch(e){msg('コピーできない場合は、表示されたバックアップを選択してコピーしてください。');}});
RoomRestorePanel.bind('outcome',()=>store,render,msg);
window.addEventListener('storage',render);
})();

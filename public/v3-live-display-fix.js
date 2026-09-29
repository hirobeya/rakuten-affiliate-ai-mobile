'use strict';
(()=>{
  const status=document.getElementById('batchStatus');
  const summary=document.getElementById('batchSummary');
  if(!status||!summary)return;
  const normalize=()=>{
    const done=/^高速30件完了/.test(status.textContent||'');
    if(done){
      status.textContent=(status.textContent||'').replace(/v3フル\s*(\d+)\/6/,'v3フル合格 $1/6');
      summary.textContent=(summary.textContent||'')
        .replace(/進捗\s*\d+\s*\/\s*30/,'進捗 30 / 30')
        .replace(/v3フル\s*(\d+)\/6/,'v3フル実行 $1/6');
    }
  };
  new MutationObserver(normalize).observe(status,{childList:true,subtree:true,characterData:true});
  normalize();
})();

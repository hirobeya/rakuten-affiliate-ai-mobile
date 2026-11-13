'use strict';
(()=>{
 const $=id=>document.getElementById(id),endpoint='/api/room-ai?action=gemini-comparison-lab';
 let scope=null,completed=false,resultText='',trace=[];
 const key=hash=>'urenavi-gemini-attempt:'+hash;
 function remember(stage){if(!scope)return;try{localStorage.setItem(key(scope.requestHash),JSON.stringify({stage,at:new Date().toISOString(),requestHash:scope.requestHash,executionSha:scope.executionSha}));}catch{observe('browser_receipt_storage_unavailable');}}
 function observe(stage,details={}){trace.push({stage,...details});$('diagnostics').textContent=JSON.stringify(trace,null,2);}
 function show(result){resultText=JSON.stringify(result,null,2);$('result').textContent=(result.generatedCopy||result.copy||'本文なし／保留')+'\n\n品質：'+(result.quality||'未評価')+'\n根拠検証：'+(result.mechanical?.ok?'機械判定通過・意味評価は未実施':'未確認または不合格')+'\nトークン：'+JSON.stringify(result.tokens??null);$('copy').disabled=false;}
 async function request(options={}){
  observe('browser_fetch_started',{method:options.method||'GET'});
  let r;try{r=await fetch(endpoint+(options.method?'':'&id='+encodeURIComponent($('item').value)),{credentials:'same-origin',cache:'no-store',...options});}
  catch(e){observe('browser_fetch_failed',{name:e.name,patternError:/string did not match the expected pattern/i.test(e.message||'')});throw Error('ブラウザの通信処理で停止。送信結果は未確定です');}
  observe('browser_response_received',{httpStatus:r.status,contentType:r.headers.get('content-type')});
  let text;try{text=await r.text();}catch{observe('browser_response_read_failed');throw Error('応答の読取りで停止。再送せず結果取得を使ってください');}
  let data;try{data=JSON.parse(text);}catch{observe('browser_json_parse_failed');throw Error('応答がJSONではありません。認証画面や配備保護を確認してください');}
  observe('server_response',{serverStage:data.stage,executionSha:data.executionSha,error:data.error||null,timings:data.timings||[],storageDiagnostic:data.storageDiagnostic||null});
  if(!r.ok){const error=Error(data.error||'server_error');error.data=data;throw error;}return data;
 }
 async function check(){
  $('run').disabled=true;$('preflight').textContent='確認中';
  try{
   const data=await request();scope=data;if(data.storageProof)observe('saved_storage_proof_recovered',{proof:data.storageProof});
   let localAttempt=false;try{localAttempt=!!localStorage.getItem(key(data.requestHash));}catch{}
   completed=localAttempt||data.attempt?.claim||data.attempt?.approvalClaim||data.attempt?.legacyClaim||!!data.receipt;
   $('preflight').textContent=data.name+'｜'+(data.holds?.length?data.holds.join(' / '):'準備OK');
   $('run').disabled=!!data.executionHold||data.held||completed;
   if(data.receipt){show(data.receipt.result||data.receipt);observe('saved_result_recovered');}
   else if(completed)$('result').textContent='実行記録がありますが結果は未取得です。再送せず保存済み結果の取得を使ってください。';
  }catch(e){$('preflight').textContent='準備不可：'+e.message;}
 }
 $('check').addEventListener('click',check);
 $('item').addEventListener('change',()=>{scope=null;$('run').disabled=true;$('preflight').textContent='未確認';});
 $('storage').addEventListener('click',async()=>{
  $('storage').disabled=true;
  try{const r=await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:$('item').value,operation:'storage-probe'})});observe('storage_proof',{proof:r.storageProof});await check();}
  catch(e){$('preflight').textContent='保存検証停止：'+e.message;}finally{$('storage').disabled=false;}
 });
 $('run').addEventListener('click',async()=>{
  if(completed||!scope||$('run').disabled)return;
  completed=true;$('run').disabled=true;$('item').disabled=true;remember('browser_before_fetch');
  $('result').textContent='送信中（再送しません）';
  try{const data=await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:$('item').value,confirm:'single-free-tier-call'})});show(data);remember('browser_result_received');}
  catch(e){remember('browser_result_unknown');$('result').textContent='再送停止：'+e.message+'。保存済み結果の取得は利用できます。';}
 });
 $('copy').addEventListener('click',()=>{if(resultText)navigator.clipboard.writeText(resultText).catch(()=>observe('browser_clipboard_failed'));});
 $('preflight').textContent='準備確認から開始してください（Gemini通信なし）';
})();

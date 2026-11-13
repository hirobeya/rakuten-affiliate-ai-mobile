'use strict';
(()=>{
 const $=id=>document.getElementById(id),endpoint='/api/room-ai?action=gemini-comparison-lab';
 let scope=null,completed=false,resultText='',trace=[];
 const selected=typeof location==='object'?new URLSearchParams(location.search):null;
 const intent=selected&&(selected.has('approvalId')||selected.has('executionId'))?{approvalId:selected.get('approvalId')||'',executionId:selected.get('executionId')||''}:null;
 const key=(hash,approvalId=null,executionId=null)=>'urenavi-gemini-attempt:'+[approvalId||'legacy',executionId||'legacy',hash].join(':');
 function remember(stage){if(!scope)return;try{localStorage.setItem(key(scope.requestHash,scope.approvalId,scope.executionId),JSON.stringify({stage,at:new Date().toISOString(),requestHash:scope.requestHash,executionSha:scope.executionSha}));}catch{observe('browser_receipt_storage_unavailable');}}
 function observe(stage,details={}){trace.push({stage,...details});$('diagnostics').textContent=JSON.stringify(trace,null,2);}
 function show(result){resultText=JSON.stringify(result,null,2);$('result').textContent=(result.error?'生成失敗：'+result.error+'（再送禁止）':(result.generatedCopy||result.copy||'本文なし／保留'))+'\n\n品質：'+(result.quality||'未評価')+'\n根拠検証：'+(result.mechanical?.ok?'機械判定通過・意味評価は未実施':'未確認または不合格')+'\nトークン：'+JSON.stringify(result.tokens??null);$('copy').disabled=false;}
 async function request(options={}){
  const {localEvaluation=false,...requestOptions}=options;
  observe('browser_fetch_started',{method:options.method||'GET'});
  let r;try{r=await fetch(endpoint+(options.method?'':'&id='+encodeURIComponent($('item').value)+(intent?'&approvalId='+encodeURIComponent(intent.approvalId)+'&executionId='+encodeURIComponent(intent.executionId):'')+(localEvaluation?'&mode=local-evaluation':'')),{credentials:'same-origin',cache:'no-store',...requestOptions});}
  catch(e){observe('browser_fetch_failed',{name:e.name,patternError:/string did not match the expected pattern/i.test(e.message||'')});throw Error('ブラウザの通信処理で停止。送信結果は未確定です');}
  observe('browser_response_received',{httpStatus:r.status,contentType:r.headers.get('content-type')});
  let text;try{text=await r.text();}catch{observe('browser_response_read_failed');throw Error('応答の読取りで停止。再送せず結果取得を使ってください');}
  let data;try{data=JSON.parse(text);}catch{observe('browser_json_parse_failed');throw Error('応答がJSONではありません。認証画面や配備保護を確認してください');}
  observe('server_response',{serverStage:data.stage,executionSha:data.executionSha,error:data.error||null,timings:data.timings||[],storageDiagnostic:data.storageDiagnostic||null,storageObservations:data.storageObservations||[]});
  if(!r.ok){const error=Error(data.error||'server_error');error.data=data;throw error;}return data;
 }
 async function check(){
  $('run').disabled=true;$('preflight').textContent='確認中';
  try{
   const data=await request();scope=data;if(data.nextExecution){$('nextStatus').textContent=data.nextExecution.allow?'別途承認済みの独立枠（過去Dは維持）':data.nextExecution.status==='approved_waiting_prerequisites'?'独立枠は承認済み。無料枠などの実行条件を再確認してください。':'次回枠：未承認。新しい承認ID・実行IDは未設定、通信不可。';$('nextLink').hidden=!(data.nextExecution.allow||data.nextExecution.readOnlyAvailable);if(data.nextExecution.allow||data.nextExecution.readOnlyAvailable)$('nextLink').href='/gemini-lab.html?approvalId='+encodeURIComponent(data.nextExecution.approvalId)+'&executionId='+encodeURIComponent(data.nextExecution.executionId);}if(data.recovery)observe('existing_result_read',data.recovery);if(data.nextExecution)observe('next_execution_preparation',data.nextExecution);if(data.acceptedStorageProof)observe('accepted_storage_baseline_read_only',{proof:data.acceptedStorageProof});if(data.storageProof)observe('saved_storage_proof_recovered',{proof:data.storageProof});
   let localAttempt=false;try{localAttempt=!!localStorage.getItem(key(data.requestHash,data.approvalId,data.executionId))||(!data.approvalId&&!!localStorage.getItem('urenavi-gemini-attempt:'+data.requestHash));}catch{}
   completed=localAttempt||data.attempt?.claim||data.attempt?.approvalClaim||data.attempt?.legacyClaim||!!data.receipt;
   $('preflight').textContent=data.name+'｜'+(data.holds?.length?data.holds.join(' / '):'準備OK');
   $('run').disabled=!!data.executionHold||data.held||completed;
   if(data.recovery?.status==='no_saved_result'&&!completed)$('result').textContent='保存済みの実生成結果はありません。過去の未送信を意味しません。';
   if(data.receipt){show(data.receipt.result||data.receipt);observe('saved_result_recovered');}
   else if(completed)$('result').textContent='実行記録がありますが結果は未取得です。再送せず保存済み結果の取得を使ってください。';
  }catch(e){$('preflight').textContent='準備不可：'+e.message;}
 }
 $('check').addEventListener('click',check);
 $('item').addEventListener('change',()=>{scope=null;$('run').disabled=true;$('preflight').textContent='未確認';});
 $('localReview').addEventListener('click',async()=>{
  $('localReview').disabled=true;
  $('localResult').textContent='原文に基づく候補を確認中（Gemini通信なし）';
  try{
   const data=await request({localEvaluation:true});
   const lines=['状態：'+(data.proposalStatus||'不明'),'品質：未評価／本番採用不可'];
   if(data.baselineText)lines.push('既存生成本文：\n'+data.baselineText);
   if(data.proposedText)lines.push('独自エンジンの改善候補：\n'+data.proposedText);
   else lines.push('改善候補は保留（根拠不足または未検証）');
   if(Array.isArray(data.evidence)&&data.evidence.length)lines.push('根拠：\n'+data.evidence.map(e=>(e.source||'不明')+'：'+e.quote).join('\n'));
   if(data.diagnostic)lines.push('既存生成の停止理由：'+(data.diagnostic.reason||'不明'));
   lines.push('Gemini追加通信：0回');
   $('localResult').textContent=lines.join('\n\n');
  }catch(err){$('localResult').textContent='独自エンジンの通信なし確認に失敗：'+err.message;}
  finally{$('localReview').disabled=false;}
 });
 $('storage').addEventListener('click',async()=>{
  $('storage').disabled=true;
  try{const r=await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:$('item').value,operation:'storage-probe'})});observe('storage_proof',{proof:r.storageProof});await check();}
  catch(e){$('preflight').textContent='保存検証停止：'+e.message;}finally{$('storage').disabled=false;}
 });
 $('run').addEventListener('click',async()=>{
  if(completed||!scope||$('run').disabled)return;
  completed=true;$('run').disabled=true;$('item').disabled=true;remember('browser_before_fetch');
  $('result').textContent='送信中（再送しません）';
  try{const data=await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:$('item').value,confirm:'single-free-tier-call',...(scope.approvalId&&scope.executionId?{approvalId:scope.approvalId,executionId:scope.executionId}:{})})});show(data);remember('browser_result_received');}
  catch(e){remember('browser_result_unknown');$('result').textContent='再送停止：'+e.message+'。保存済み結果の取得は利用できます。';}
 });
 $('copy').addEventListener('click',()=>{if(resultText)navigator.clipboard.writeText(resultText).catch(()=>observe('browser_clipboard_failed'));});
 $('preflight').textContent='準備確認から開始してください（Gemini通信なし）';
})();

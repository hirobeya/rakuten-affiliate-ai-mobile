'use strict';
const button=document.getElementById('probe'),result=document.getElementById('result');
button.addEventListener('click',async()=>{
 button.disabled=true;
 try{
  const supplied=new URL(location.href).searchParams.get('probeId');
  if(supplied!==null&&!/^[a-f0-9]{32}$/.test(supplied))throw Error('invalid_probe_id');
  const probeId=supplied||Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
  const call=async()=>{const r=await fetch('/api/calibration',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'storage-probe',probeId})});return {httpStatus:r.status,body:await r.json()};};
  const concurrent=await Promise.all([call(),call()]);
  const repeated=await call();
  result.textContent=JSON.stringify({probeId,concurrent,repeated,inferenceCalls:0},null,2);
 }catch{result.textContent='保存検証を完了できませんでした。推論は実行していません。';}
});

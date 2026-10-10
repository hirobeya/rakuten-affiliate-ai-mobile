'use strict';
(async function(){
 const rows=await fetch('/structured-copy-samples.json').then(r=>r.json());
 const el=id=>document.getElementById(id);let selected=0;
 rows.forEach((row,i)=>{const option=document.createElement('option');option.value=i;option.textContent=row.input.category;el('category').appendChild(option);});
 function render(){
  const item={itemName:el('title').value,itemCaption:el('caption').value,itemPrice:rows[selected].input.itemPrice};
  const r=window.UrenaviStructuredCopy.compose(item),api=window.UrenaviPainCopy;
  const text=api.makeRoomCopy(item,'');
  const consistent=[api.buildGroundedBenefitPost(item,[]),api.makeThreadsCopy(item,''),api.makeInstagramCopy(item,'')].every(x=>x===text);
  el('before').textContent=rows[selected].before||'（旧ルートでは生成停止）';
  el('after').textContent=text||'（根拠不足または種別の矛盾により生成停止）';
  el('status').textContent='分類 '+(selected+1)+' / '+rows.length+'｜'+(text?'生成あり':'生成停止')+'｜ルート一致：'+(consistent?'OK':'NG');
  el('evidence').textContent=JSON.stringify({consistent,...r},null,2);
  window.__structuredPreview={item,result:r,text,consistent};
 }
 function choose(){selected=Number(el('category').value);el('title').value=rows[selected].input.itemName;el('caption').value=rows[selected].input.itemCaption||'';render();}
 el('category').addEventListener('change',choose);el('generate').addEventListener('click',render);choose();
})();

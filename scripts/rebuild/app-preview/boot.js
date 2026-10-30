// Only inserted into the isolated deployment; normal app source keeps its auth/search behavior.
if(window.AppIsolation){
 authGate.style.display='none';appRoot.style.display='block';
 currentAccessPlan='owner';aiGatesFullOutput=true;usePurchasePlan=true;
 const banner=document.createElement('section');banner.className='box';banner.id='fixtureNotice';
 banner.innerHTML='<b>隔離本体Preview｜架空商品・模擬アカウント</b><p>失敗注入：'+(window.AppIsolation.fault||'なし')+'。実検索・実ログイン・実Groq生成ではありません。既存本体UIと完成cache読取りの操作検証です。</p><label>検証アカウント <select id="fixtureOwner"><option>fixture-a</option><option>fixture-b</option></select></label>';
 appRoot.prepend(banner);
 const reset=()=>{aiRunGeneration++;aiRoomResults.clear();aiRoomReviews.clear();lastSearchItems=[];document.getElementById('res').replaceChildren();userMail.textContent=window.AppIsolation.owner+'（模擬）';window.initRoomOutcomes(window.AppIsolation.owner);document.getElementById('outcomeMsg').textContent='';for(const id of ['outcomeBackup','accountBackupText']){const node=document.getElementById(id);if(node)node.value='';}};
 document.getElementById('fixtureOwner').onchange=e=>{window.AppIsolation.owner=e.target.value;reset();};reset();
 $('#go').onclick=()=>{lastSearchKeyword=k.value.trim()||'架空ケトル';render(window.AppFixtureItems.map(x=>({...x})),{autoAi:false});$('#st').textContent='架空の2候補です。実検索通信なし。';document.querySelector('[data-urenavi-tab="copy"]').click();};
 window.addEventListener('room-outcomes-change',()=>{const expected=window.AppFixtureItems.filter(i=>!window.roomOutcomePosted(i));if(lastSearchItems.length&&expected.map(i=>i.itemCode).join('|')!==lastSearchItems.map(i=>i.itemCode).join('|'))render(window.AppFixtureItems.map(x=>({...x})),{autoAi:false});});
}

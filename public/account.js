const client=supabase.createClient('https://upooxcugrplfmjnqpuxs.supabase.co','sb_publishable_OBQUoiuGzy_YagoMeAnHYg_BTNfn8j5');
const message=document.getElementById('message'),list=document.getElementById('contracts');
async function request(body){
  const {data}=await client.auth.getSession();
  if(!data.session)throw new Error('購入時のメールアドレスで、ウレナビにログインしてから開いてください。');
  const response=await fetch('/api/account',{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+data.session.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw new Error(response.status===401?'ログインの有効期限が切れました。ウレナビで再認証してください。':'契約状態を確認できませんでした。再読み込みして確認してください。');
  return response.json();
}
async function load(){
  list.replaceChildren();
  try{
    const {subscriptions}=await request();
    message.textContent=subscriptions.length?'現在の契約情報です。複数の契約がある場合は、それぞれの更新停止が必要です。':'このメールアドレスの契約は見つかりませんでした。購入時のメールアドレスをご確認ください。';
    for(const sub of subscriptions){
      const article=document.createElement('article'),title=document.createElement('h2'),detail=document.createElement('p');
      title.textContent=sub.status==='canceled'?'解約済み':sub.cancel_at_period_end?'次回更新を停止済み':'月額契約';
      const date=sub.current_period_end?new Date(sub.current_period_end).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'確認できません';
      detail.textContent=(sub.active?'利用期限（日本時間）：':'契約期間末（現在は利用停止中・日本時間）：')+date;
      article.append(title,detail);
      if(sub.status!=='canceled'&&!sub.cancel_at_period_end){
        const button=document.createElement('button');button.textContent='次回更新を停止する';
        button.onclick=async()=>{if(!confirm('次回更新を停止しますか？支払済みの利用期限まで使えます。日割り返金はありません。'))return;button.disabled=true;try{await request({action:'cancel',subscription_id:sub.id});await load();message.textContent='次回更新の停止を確認しました。';}catch(e){message.textContent=e.message;button.disabled=false;}};
        article.append(button);
      }
      list.append(article);
    }
  }catch(e){message.textContent=e.message;}
}
void load();

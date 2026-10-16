(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RoomTodayPlan=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function next({generation=[],outcomes=null,operations=null,metrics={}}={}){
 if(generation.some(r=>r.status===429||r.upstreamStatus===429))return {href:'#res',label:'生成の停止状況を確認',reason:'AIの利用上限で停止しています。未完成文は投稿せず、完成済みの商品を確認してください。'};
 if(generation.some(r=>r.state==='loading'))return {href:'#res',label:'作成中の投稿文を確認',reason:'商品の確認・文章生成を進めています。途中結果を保持しているため、完了を待つか停止してください。'};
 if(generation.some(r=>['pending','paused','restored'].includes(r.state)))return {href:'#res',label:'投稿文の確認・再開へ',reason:'未確認・未処理の商品があります。内容を確認して、本人操作で再開してください。'};
 if(outcomes?.prepared>0)return {href:'#outcomeHistory',label:'投稿完了を確認',reason:'コピー済みで投稿未確認の商品が '+outcomes.prepared+'件あります。ROOMで実際に投稿した商品だけ完了を記録しましょう。'};
 if(operations?.pending>0)return {href:'#roomOpsQueue',label:'待っている交流に進む',reason:'交流候補が '+operations.pending+'件あります。返しの候補を先に確認し、ROOMで実施してから記録しましょう。'};
 if(generation.some(r=>r.state==='error'))return {href:'#res',label:'生成できなかった商品を確認',reason:'投稿文が完成しなかった商品があります。確認できない内容は投稿せず、別の商品を選ぶ判断に使ってください。'};
 if(outcomes?.posted>0&&(metrics.sales==null||metrics.commission==null))return {href:'#proDailyDashboard',label:'確認できた売上・報酬を記録',reason:'今日の売上・報酬に未入力があります。楽天の実績画面で確認できた値だけ記録しましょう。'};
 return {href:'#normalScreen',label:'次の商品を選ぶ',reason:'ジャンル・予算・用途から候補を比較し、購入者に合う商品を選びましょう。売上の予測ではありません。'};
}
return {next};
});

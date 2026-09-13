(function(root){
  'use strict';

  const fmt=n=>new Intl.NumberFormat('ja-JP').format(+n||0);

  function painContext(itemName,keyword){
    const text=(String(keyword||'')+' '+String(itemName||'')).toLowerCase();
    const rules=[
      [/レンジフード|換気扇|フィルター/,['換気扇のベタベタ掃除、できれば回数を減らしたい…','汚れをためる前にガードして、面倒な掃除の負担を減らしたい人にぴったり。']],
      [/水筒|ボトル|タンブラー/,['水筒の底や細かい部分、毎日洗うのって地味に面倒…','毎日の洗い物を少しでもラクにしたい人に使いやすいアイテム。']],
      [/排水口|ゴミ受け|ヘアキャッチ|髪の毛/,['排水口のヌメヌメや髪の毛、できれば触りたくない…','面倒なゴミ処理や掃除を、もっと手軽に済ませたい人向け。']],
      [/カビ|防カビ/,['お風呂のカビ掃除、ゴシゴシする前に何とかしたい…','掃除の回数や手間を減らしたい人にうれしい予防系アイテム。']],
      [/グリル|魚焼き/,['魚は食べたい。でも使った後のグリル掃除が面倒…','後片付けの負担を減らして、料理をもっと気軽にしたい人に。']],
      [/レンジ調理|電子レンジ|レンジクッカー/,['料理はしたい。でも時間も洗い物も増やしたくない…','火を使わず、手間を減らしてサッと作りたい日に便利。']],
      [/お名前|名前スタンプ|ネームスタンプ/,['入園・入学準備の名前書き、数が多いと本当に大変…','手書きの回数を減らして、準備をラクに進めたい人に。']],
      [/おむつ|防臭|臭わない|消臭袋/,['ゴミ箱を開けたときのニオイ、気になる…','ニオイ対策を手軽にしたい人に使いやすい定番アイテム。']],
      [/段ボール|ダンボール|カッター/,['ネット通販の段ボール、開けるたびにハサミを探すの面倒…','開封作業をサッと済ませたい人にあると便利。']],
      [/収納|ハンガー|クローゼット|整理/,['片付けてもすぐ散らかる。収納スペースも足りない…','毎日の片付けをラクにして、限られたスペースを使いやすくしたい人に。']],
      [/洗濯|物干し|ランドリー/,['洗濯って、干す・たたむ・片付けるまでが長い…','毎日の洗濯動線を少しでもラクにしたい人に。']],
      [/掃除|クリーナー|ブラシ|ワイパー/,['毎日の掃除、できればもっと短時間で終わらせたい…','気づいたときにサッと使えて、掃除の負担を減らしたい人に。']]
    ];
    for(const [re,value] of rules){
      if(re.test(text)) return {hook:value[0],solution:value[1]};
    }
    return {
      hook:'毎日の「ちょっと面倒」、少しでもラクにしたい…',
      solution:'手間を減らしながら、使いやすさも妥協したくない人にチェックしてほしいアイテム。'
    };
  }

  function benefits(item){
    const out=[];
    const reviews=+item.reviewCount||0;
    const rating=+item.reviewAverage||0;
    const price=+item.itemPrice||0;
    if((+item.relevance||0)>=90) out.push('探している悩み・用途に近い');
    if(reviews>=300) out.push(`レビュー${fmt(reviews)}件で選ぶ材料が多い`);
    else if(reviews>=50) out.push(`レビュー${fmt(reviews)}件で実績を確認しやすい`);
    if(rating>=4.5 && reviews>=20) out.push(`★${rating.toFixed(1)}の高評価`);
    if(price>0 && price<=3000) out.push(`${fmt(price)}円で試しやすい価格帯`);
    else if(price>0 && price<=10000) out.push(`${fmt(price)}円で比較しやすい価格帯`);
    return out.slice(0,3);
  }

  function makeRoomCopy(item,keyword){
    const ctx=painContext(item.itemName,keyword);
    const pr=fmt(item.itemPrice);
    const av=(+item.reviewAverage||0).toFixed(1);
    const rv=fmt(item.reviewCount);
    const list=benefits(item);
    const bullets=(list.length?list:['毎日の手間を減らしやすい','使い方がシンプルで取り入れやすい']).map(v=>'✔ '+v).join('\n');
    return `※アフィリエイト広告を利用しています\n\n${ctx.hook}\n\n${ctx.solution}\n\n${item.itemName}\n価格：${pr}円\nレビュー：★${av}（${rv}件）\n\n${bullets}\n\nこんな人におすすめ👇\n・面倒な作業を減らしたい\n・できるだけ簡単に使いたい\n・価格とレビューも見て失敗しにくく選びたい`;
  }

  root.UrenaviPainCopy={painContext,benefits,makeRoomCopy};
})(typeof window==='undefined'?{}:window);

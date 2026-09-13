(function(root){
  'use strict';

  const fmt=n=>new Intl.NumberFormat('ja-JP').format(+n||0);

  function painContext(itemName,keyword){
    const text=(String(keyword||'')+' '+String(itemName||'')).toLowerCase();
    const rules=[
      [/レンジフード|換気扇|フィルター/,{
        hook:'換気扇のベタベタ掃除、できれば何度もやりたくない…',
        bridge:'そんな「掃除の手間を少しでも減らしたい」に合うのが、このアイテム。',
        points:['汚れ対策を先回りしたい','大がかりな掃除の回数を減らしたい','手軽に取り入れられる対策を探している']
      }],
      [/水筒|ボトル|タンブラー/,{
        hook:'水筒の底や細かい部分、毎日きれいにするのって地味に面倒…',
        bridge:'毎日の洗い物を少しでもラクにしたい人向けの便利アイテム。',
        points:['水筒洗いの手間を減らしたい','細かい部分まで洗いやすくしたい','毎日続けやすい方法を探している']
      }],
      [/排水口|ゴミ受け|ヘアキャッチ|髪の毛/,{
        hook:'排水口のヌメヌメや髪の毛、できれば触りたくない…',
        bridge:'イヤなゴミ処理や掃除を、もっとサッと終わらせたい人に。',
        points:['排水口掃除のストレスを減らしたい','髪の毛やゴミに触れる回数を減らしたい','捨てるまでを簡単にしたい']
      }],
      [/カビ|防カビ/,{
        hook:'お風呂のカビ、出てからゴシゴシ掃除するのがしんどい…',
        bridge:'できるだけ「落とす掃除」より「増やさない対策」に寄せたい人に。',
        points:['カビ掃除の負担を減らしたい','日々の予防を簡単に続けたい','掃除時間を短くしたい']
      }],
      [/グリル|魚焼き/,{
        hook:'魚は食べたい。でも使った後のグリル掃除が面倒…',
        bridge:'後片付けがラクになれば、魚料理ももっと気軽に選びやすくなる。',
        points:['グリル掃除の手間を減らしたい','洗い物を増やしたくない','手軽に魚料理を楽しみたい']
      }],
      [/レンジ調理|電子レンジ|レンジクッカー/,{
        hook:'料理はしたい。でも時間も洗い物も増やしたくない…',
        bridge:'忙しい日に「できるだけ手をかけずに作りたい」を助けてくれるアイテム。',
        points:['調理時間を短くしたい','火を使う手間を減らしたい','洗い物を少なくしたい']
      }],
      [/お名前|名前スタンプ|ネームスタンプ/,{
        hook:'入園・入学準備の名前書き、数が多いと本当に大変…',
        bridge:'ひとつずつ手書きする作業を減らしたい人に便利。',
        points:['名前付けを時短したい','同じ作業を何度も繰り返したくない','準備をまとめて終わらせたい']
      }],
      [/おむつ|防臭|臭わない|消臭袋/,{
        hook:'ゴミ箱を開けた瞬間のニオイ、毎日のことやから気になる…',
        bridge:'おむつや生ゴミのニオイ対策を、できるだけ簡単に済ませたい人に。',
        points:['ゴミ箱まわりのニオイが気になる','手軽な防臭対策を探している','毎日使いやすいものを選びたい']
      }],
      [/段ボール|ダンボール|カッター/,{
        hook:'ネット通販の段ボール、開けるたびにハサミを探すの面倒…',
        bridge:'届いた荷物をサッと開けたい人に、あると地味に助かるアイテム。',
        points:['開封作業を早く済ませたい','ハサミを探す手間をなくしたい','毎日使える小さな便利グッズが好き']
      }],
      [/収納|ハンガー|クローゼット|整理/,{
        hook:'片付けてもすぐ散らかる。しかも収納スペースが足りない…',
        bridge:'限られた場所を使いやすくして、片付けのハードルを下げたい人に。',
        points:['収納スペースを有効に使いたい','片付けやすい仕組みに変えたい','出し入れをラクにしたい']
      }],
      [/洗濯|物干し|ランドリー/,{
        hook:'洗濯って、洗うより「干す・たたむ・片付ける」が長い…',
        bridge:'毎日の洗濯動線を少しでも短く、ラクにしたい人に。',
        points:['洗濯の家事時間を減らしたい','干す・しまうをラクにしたい','毎日使いやすいものを選びたい']
      }],
      [/掃除|クリーナー|ブラシ|ワイパー/,{
        hook:'毎日の掃除、できればもっと短時間で終わらせたい…',
        bridge:'気づいたときにサッと使えて、掃除を後回しにしにくいアイテム。',
        points:['掃除時間を短くしたい','準備や片付けが少ないものがいい','こまめに使いやすいものを探している']
      }]
    ];
    for(const [re,value] of rules){
      if(re.test(text)) return value;
    }
    return {
      hook:'毎日の「これ、ちょっと面倒…」を少しでもラクにしたい。',
      bridge:'そんな日々の小さなストレスを減らしたい人にチェックしてほしいアイテム。',
      points:['面倒な作業を減らしたい','できるだけ簡単に使いたい','価格とレビューも見て選びたい']
    };
  }

  function benefits(item){
    const out=[];
    const reviews=+item.reviewCount||0;
    const rating=+item.reviewAverage||0;
    const price=+item.itemPrice||0;
    if((+item.relevance||0)>=90) out.push('探している用途に近い');
    if(reviews>=300) out.push(`レビュー${fmt(reviews)}件で比較材料が多い`);
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
    const bullets=(list.length?list:['手間を減らしやすい','取り入れやすい']).map(v=>'✔ '+v).join('\n');
    const recommend=ctx.points.map(v=>'・'+v).join('\n');

    return `※アフィリエイト広告を利用しています\n\n${ctx.hook}\n\n${ctx.bridge}\n\n${item.itemName}\n価格：${pr}円\nレビュー：★${av}（${rv}件）\n\n${bullets}\n\nこんな人におすすめ👇\n${recommend}`;
  }

  root.UrenaviPainCopy={painContext,benefits,makeRoomCopy};
})(typeof window==='undefined'?{}:window);

(function(root){
  'use strict';
  const fmt=n=>new Intl.NumberFormat('ja-JP').format(+n||0);
  const rules=[
    [/レンジフード|換気扇|フィルター/,'換気扇のベタベタ掃除、できれば何度もやりたくない…','そんな「掃除の手間を少しでも減らしたい」に合うのが、このアイテム。',['汚れ対策を先回りしたい','大がかりな掃除の回数を減らしたい','手軽に取り入れられる対策を探している']],
    [/水筒|ボトル|タンブラー/,'水筒の底や細かい部分、毎日きれいにするのって地味に面倒…','毎日の洗い物を少しでもラクにしたい人向けの便利アイテム。',['水筒洗いの手間を減らしたい','細かい部分まで洗いやすくしたい','毎日続けやすい方法を探している']],
    [/排水口|ゴミ受け|ヘアキャッチ|髪の毛/,'排水口のヌメヌメや髪の毛、できれば触りたくない…','イヤなゴミ処理や掃除を、もっとサッと終わらせたい人に。',['排水口掃除のストレスを減らしたい','髪の毛やゴミに触れる回数を減らしたい','捨てるまでを簡単にしたい']],
    [/カビ|防カビ/,'お風呂のカビ、出てからゴシゴシ掃除するのがしんどい…','できるだけ「落とす掃除」より「増やさない対策」に寄せたい人に。',['カビ掃除の負担を減らしたい','日々の予防を簡単に続けたい','掃除時間を短くしたい']],
    [/グリル|魚焼き/,'魚は食べたい。でも使った後のグリル掃除が面倒…','後片付けがラクになれば、魚料理ももっと気軽に選びやすくなる。',['グリル掃除の手間を減らしたい','洗い物を増やしたくない','手軽に魚料理を楽しみたい']],
    [/レンジ調理|電子レンジ|レンジクッカー/,'料理はしたい。でも時間も洗い物も増やしたくない…','忙しい日に「できるだけ手をかけずに作りたい」を助けてくれるアイテム。',['調理時間を短くしたい','火を使う手間を減らしたい','洗い物を少なくしたい']],
    [/お名前|名前スタンプ|ネームスタンプ/,'入園・入学準備の名前書き、数が多いと本当に大変…','ひとつずつ手書きする作業を減らしたい人に便利。',['名前付けを時短したい','同じ作業を何度も繰り返したくない','準備をまとめて終わらせたい']],
    [/おむつ|防臭|臭わない|消臭袋/,'ゴミ箱を開けた瞬間のニオイ、毎日のことやから気になる…','おむつや生ゴミのニオイ対策を、できるだけ簡単に済ませたい人に。',['ゴミ箱まわりのニオイが気になる','手軽な防臭対策を探している','毎日使いやすいものを選びたい']],
    [/段ボール|ダンボール|カッター/,'ネット通販の段ボール、開けるたびにハサミを探すの面倒…','届いた荷物をサッと開けたい人に、あると地味に助かるアイテム。',['開封作業を早く済ませたい','ハサミを探す手間をなくしたい','毎日使える小さな便利グッズが好き']],
    [/収納|ハンガー|クローゼット|整理/,'片付けてもすぐ散らかる。しかも収納スペースが足りない…','限られた場所を使いやすくして、片付けのハードルを下げたい人に。',['収納スペースを有効に使いたい','片付けやすい仕組みに変えたい','出し入れをラクにしたい']],
    [/洗濯|物干し|ランドリー/,'洗濯って、洗うより「干す・たたむ・片付ける」が長い…','毎日の洗濯動線を少しでも短く、ラクにしたい人に。',['洗濯の家事時間を減らしたい','干す・しまうをラクにしたい','毎日使いやすいものを選びたい']],
    [/掃除|クリーナー|ブラシ|ワイパー/,'毎日の掃除、できればもっと短時間で終わらせたい…','気づいたときにサッと使えて、掃除を後回しにしにくいアイテム。',['掃除時間を短くしたい','準備や片付けが少ないものがいい','こまめに使いやすいものを探している']]
  ];

  function painContext(name,keyword){
    const text=String(keyword||'')+' '+String(name||'');
    for(const r of rules) if(r[0].test(text)) return {hook:r[1],bridge:r[2],points:r[3]};
    return {hook:'毎日の「これ、ちょっと面倒…」を少しでもラクにしたい。',bridge:'そんな日々の小さなストレスを減らしたい人にチェックしてほしいアイテム。',points:['面倒な作業を減らしたい','できるだけ簡単に使いたい','価格とレビューも見て選びたい']};
  }

  function promoTerms(title){
    const s=String(title||'');
    const pats=[
      /(?:最大\s*)?\d{1,2}[％%]\s*(?:OFF|オフ)/i,
      /半額/,
      /送料無料/,
      /(?:\d{2,5}円(?:OFF|オフ)\s*)?クーポン/i,
      /ポイント\s*\d{1,2}倍/,
      /期間限定/,
      /数量限定/,
      /公式/,
      /正規品/,
      /楽天(?:市場)?(?:総合)?(?:ランキング)?\s*1位/,
      /(?:総合|ランキング)\s*1位/
    ];
    const out=[];
    for(const re of pats){
      const m=s.match(re);
      if(m&&!out.some(v=>v===m[0])) out.push(m[0].replace(/\s+/g,''));
    }
    return out.slice(0,4);
  }

  function shortTitle(title){
    const original=String(title||'').replace(/\s+/g,' ').trim();
    const promos=promoTerms(original);
    let base=original
      .replace(/【[^】]{0,50}】/g,' ')
      .replace(/\[[^\]]{0,50}\]/g,' ')
      .replace(/\s+/g,' ')
      .trim();
    if(base.length>42) base=base.slice(0,42).trim()+'…';
    return (promos.length?'【'+promos.join('・')+'】 ':'')+base;
  }

  function benefits(item){
    const out=[],r=+item.reviewCount||0,v=+item.reviewAverage||0,p=+item.itemPrice||0;
    if(r>=300) out.push(`レビュー${fmt(r)}件で比較材料が多い`); else if(r>=50) out.push(`レビュー${fmt(r)}件で実績を確認しやすい`);
    if(v>=4.5&&r>=20) out.push(`★${v.toFixed(1)}の高評価`);
    if(p>0&&p<=3000) out.push(`${fmt(p)}円で試しやすい価格帯`); else if(p<=10000&&p>0) out.push(`${fmt(p)}円で比較しやすい価格帯`);
    return out.slice(0,3);
  }

  function makeRoomCopy(item,keyword){
    const ctx=painContext(item.itemName,keyword),pr=fmt(item.itemPrice),av=(+item.reviewAverage||0).toFixed(1),rv=fmt(item.reviewCount),list=benefits(item),title=shortTitle(item.itemName);
    const bullets=(list.length?list:['手間を減らしやすい','取り入れやすい']).map(v=>'✔ '+v).join('\n');
    const recommend=ctx.points.map(v=>'・'+v).join('\n');
    return `${ctx.hook}\n\n${ctx.bridge}\n\n${title}\n価格：${pr}円\nレビュー：★${av}（${rv}件）\n\n${bullets}\n\nこんな人におすすめ👇\n${recommend}`;
  }

  root.UrenaviPainCopy={painContext,benefits,promoTerms,shortTitle,makeRoomCopy};
})(typeof window==='undefined'?{}:window);

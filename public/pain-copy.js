(function(root){
  'use strict';
  const fmt=n=>new Intl.NumberFormat('ja-JP').format(+n||0);

  const rules=[
    [/レンジフード|換気扇|フィルター/,{hook:'換気扇のベタベタ掃除、できれば何度もやりたくない…',bridge:'そんな「掃除の手間を少しでも減らしたい」に合うのが、このアイテム。',points:['汚れ対策を先回りしたい','大がかりな掃除の回数を減らしたい','手軽に取り入れられる対策を探している'],benefit:'汚れ対策を先回りしたい人にぴったり'}],
    [/水筒|ボトル|タンブラー/,{hook:'水筒の底や細かい部分、毎日きれいにするのって地味に面倒…',bridge:'毎日の洗い物を少しでもラクにしたい人向けの便利アイテム。',points:['水筒洗いの手間を減らしたい','細かい部分まで洗いやすくしたい','毎日続けやすい方法を探している'],benefit:'毎日の水筒洗いをラクにしたい人にぴったり'}],
    [/排水口|ゴミ受け|ヘアキャッチ|髪の毛/,{hook:'排水口のヌメヌメや髪の毛、できれば触りたくない…',bridge:'イヤなゴミ処理や掃除を、もっとサッと終わらせたい人に。',points:['排水口掃除のストレスを減らしたい','髪の毛やゴミに触れる回数を減らしたい','捨てるまでを簡単にしたい'],benefit:'排水口掃除のストレスを減らしたい人にぴったり'}],
    [/カビ|防カビ/,{hook:'お風呂のカビ、出てからゴシゴシ掃除するのがしんどい…',bridge:'できるだけ「落とす掃除」より「増やさない対策」に寄せたい人に。',points:['カビ掃除の負担を減らしたい','日々の予防を簡単に続けたい','掃除時間を短くしたい'],benefit:'カビ掃除の負担を減らしたい人にぴったり'}],
    [/グリル|魚焼き/,{hook:'魚は食べたい。でも使った後のグリル掃除が面倒…',bridge:'後片付けがラクになれば、魚料理ももっと気軽に選びやすくなる。',points:['グリル掃除の手間を減らしたい','洗い物を増やしたくない','手軽に魚料理を楽しみたい'],benefit:'魚料理の後片付けをラクにしたい人にぴったり'}],
    [/レンジ調理|電子レンジ|レンジクッカー/,{hook:'料理はしたい。でも時間も洗い物も増やしたくない…',bridge:'忙しい日に「できるだけ手をかけずに作りたい」を助けてくれるアイテム。',points:['調理時間を短くしたい','火を使う手間を減らしたい','洗い物を少なくしたい'],benefit:'調理の手間と時間を減らしたい人にぴったり'}],
    [/お名前|名前スタンプ|ネームスタンプ/,{hook:'入園・入学準備の名前書き、数が多いと本当に大変…',bridge:'ひとつずつ手書きする作業を減らしたい人に便利。',points:['名前付けを時短したい','同じ作業を何度も繰り返したくない','準備をまとめて終わらせたい'],benefit:'名前付けを時短したい人にぴったり'}],
    [/おむつ|防臭|臭わない|消臭袋/,{hook:'ゴミ箱を開けた瞬間のニオイ、毎日のことやから気になる…',bridge:'おむつや生ゴミのニオイ対策を、できるだけ簡単に済ませたい人に。',points:['ゴミ箱まわりのニオイが気になる','手軽な防臭対策を探している','毎日使いやすいものを選びたい'],benefit:'ニオイ対策を手軽に続けたい人にぴったり'}],
    [/段ボール|ダンボール|カッター/,{hook:'ネット通販の段ボール、開けるたびにハサミを探すの面倒…',bridge:'届いた荷物をサッと開けたい人に、あると地味に助かるアイテム。',points:['開封作業を早く済ませたい','ハサミを探す手間をなくしたい','毎日使える小さな便利グッズが好き'],benefit:'荷物の開封をサッと済ませたい人にぴったり'}],
    [/収納|ハンガー|クローゼット|整理/,{hook:'片付けてもすぐ散らかる。しかも収納スペースが足りない…',bridge:'限られた場所を使いやすくして、片付けのハードルを下げたい人に。',points:['収納スペースを有効に使いたい','片付けやすい仕組みに変えたい','出し入れをラクにしたい'],benefit:'限られた収納スペースを有効に使いたい人にぴったり'}],
    [/洗濯|物干し|ランドリー/,{hook:'洗濯って、洗うより「干す・たたむ・片付ける」が長い…',bridge:'毎日の洗濯動線を少しでも短く、ラクにしたい人に。',points:['洗濯の家事時間を減らしたい','干す・しまうをラクにしたい','毎日使いやすいものを選びたい'],benefit:'毎日の洗濯を少しでもラクにしたい人にぴったり'}],
    [/掃除|クリーナー|ブラシ|ワイパー/,{hook:'毎日の掃除、できればもっと短時間で終わらせたい…',bridge:'気づいたときにサッと使えて、掃除を後回しにしにくいアイテム。',points:['掃除時間を短くしたい','準備や片付けが少ないものがいい','こまめに使いやすいものを探している'],benefit:'掃除時間を短くしたい人にぴったり'}],
    [/フライパン|鍋|包丁|キッチン|調理器/,{hook:'毎日の料理、少しでも手間を減らしたい…',bridge:'調理や後片付けをラクにして、キッチン時間を短くしたい人に。',points:['料理の手間を減らしたい','後片付けをラクにしたい','毎日使いやすいものを選びたい'],benefit:'毎日の料理をラクにしたい人にぴったり'}],
    [/布団|枕|寝具|マットレス/,{hook:'寝ても疲れが残ると、毎日つらい…',bridge:'毎日の休息時間を少しでも快適にしたい人にチェックしてほしいアイテム。',points:['寝心地を見直したい','毎日の休息を快適にしたい','使いやすい寝具を探している'],benefit:'毎日の寝心地を整えたい人にぴったり'}],
    [/子供|キッズ|ベビー|赤ちゃん/,{hook:'子どもまわりの準備や片付け、毎日だと地味に大変…',bridge:'育児の小さな手間を少しでも減らしたい人に便利なアイテム。',points:['育児の手間を減らしたい','準備や片付けをラクにしたい','毎日使いやすいものを選びたい'],benefit:'毎日の育児を少しでもラクにしたい人にぴったり'}]
  ];

  function painContext(name,keyword){
    const text=String(keyword||'')+' '+String(name||'');
    for(const [re,value] of rules) if(re.test(text)) return value;
    return {
      hook:'毎日の「これ、ちょっと面倒…」を少しでもラクにしたい。',
      bridge:'そんな日々の小さなストレスを減らしたい人にチェックしてほしいアイテム。',
      points:['面倒な作業を減らしたい','できるだけ簡単に使いたい','価格とレビューも見て選びたい'],
      benefit:'毎日の小さな手間を減らしたい人にぴったり'
    };
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
    if(base.length>38) base=base.slice(0,38).trim()+'…';
    return (promos.length?'【'+promos.join('・')+'】 ':'')+base;
  }

  function reviewBenefit(item){
    const r=+item.reviewCount||0;
    const v=+item.reviewAverage||0;
    if(r>=1000) return `レビュー${fmt(r)}件、多くの人に選ばれている人気商品`;
    if(r>=300) return `レビュー${fmt(r)}件の人気商品`;
    if(r>=100) return `レビュー${fmt(r)}件で使用感を確認しやすい`;
    if(r>=30) return `レビュー${fmt(r)}件で選ぶ材料がある`;
    if(r>=10 && v>=4.5) return `★${v.toFixed(1)}の高評価`;
    return '';
  }

  function benefits(item,ctx){
    const out=[];
    const r=+item.reviewCount||0;
    const v=+item.reviewAverage||0;
    const p=+item.itemPrice||0;
    const social=reviewBenefit(item);
    if(social) out.push(social);
    if(v>=4.5 && r>=30 && !social.includes('高評価')) out.push(`★${v.toFixed(1)}の高評価`);
    if(ctx&&ctx.benefit) out.push(ctx.benefit);
    if(out.length<3 && p>0 && p<=3000) out.push(`${fmt(p)}円で試しやすい価格帯`);
    if(out.length<3 && p>3000 && p<=10000 && r<30) out.push(`${fmt(p)}円で比較しやすい価格帯`);
    return out.slice(0,3);
  }

  function makeRoomCopy(item,keyword){
    const ctx=painContext(item.itemName,keyword);
    const pr=fmt(item.itemPrice);
    const r=+item.reviewCount||0;
    const v=+item.reviewAverage||0;
    const title=shortTitle(item.itemName);
    const list=benefits(item,ctx);
    const bullets=(list.length?list:[ctx.benefit,'取り入れやすい便利アイテム']).map(v=>'✔ '+v).join('\n');
    const recommend=ctx.points.map(v=>'・'+v).join('\n');
    const reviewLine=r>=10?`\nレビュー：★${v.toFixed(1)}（${fmt(r)}件）`:'';
    return `※アフィリエイト広告を利用しています\n\n${ctx.hook}\n\n${ctx.bridge}\n\n${title}\n価格：${pr}円${reviewLine}\n\n${bullets}\n\nこんな人におすすめ👇\n${recommend}`;
  }

  root.UrenaviPainCopy={painContext,benefits,promoTerms,shortTitle,reviewBenefit,makeRoomCopy};
})(typeof window==='undefined'?{}:window);

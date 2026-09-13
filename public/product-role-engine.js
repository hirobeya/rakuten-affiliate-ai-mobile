(function(root){
  'use strict';
  if(!root) return;

  const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
  const has=(re,t)=>re.test(t);

  const mainRules=[
    {id:'clean',score:6,re:/掃除|クリーナー|モップ|ワイパー|ダスター|ほこり|ホコリ|ブラシ|ほうき|箒|雑巾|クロス|スポンジ|スクイージー|フロアワイパー|床ブラシ|ハンディモップ/},
    {id:'cook',score:6,re:/電子レンジ|レンジ調理|レンジクッカー|レンジパン|レンジポット|蒸し器|フライパン|鍋|調理器|焼き魚|グリル|包丁|キッチンツール/},
    {id:'odor',score:6,re:/防臭|消臭|臭わない|におい|ニオイ|生ゴミ|おむつ袋|ゴミ袋/},
    {id:'drain',score:6,re:/排水口|ゴミ受け|ヘアキャッチ|水切りネット|排水溝/},
    {id:'wash',score:6,re:/洗浄|洗う|ボトルブラシ|水筒ブラシ|漂白|つけ置き|洗剤|食器洗い/},
    {id:'storage',score:5,re:/収納棚|収納庫|収納ケース|収納ボックス|キャビネット|チェスト|ラック|シェルフ|クローゼット|収納ワゴン|引き出し収納/},
    {id:'open',score:5,re:/段ボールカッター|ダンボールカッター|開封カッター|カッター/},
    {id:'label',score:5,re:/お名前スタンプ|名前スタンプ|ネームスタンプ|ラベルライター|名前シール/},
    {id:'sleep',score:5,re:/枕|マットレス|敷布団|掛布団|寝具/},
    {id:'carry',score:5,re:/水筒|タンブラー|ボトル|マグボトル/},
    {id:'laundry',score:5,re:/物干し|ランドリー|洗濯ハンガー|ピンチハンガー|洗濯かご|ランドリーバスケット/},
    {id:'baby',score:4,re:/ベビー|赤ちゃん|キッズ|おむつ|離乳食/},
    {id:'sign',score:7,re:/室名プレート|ネームプレート|ピクトサイン|サインプレート|看板|標識/}
  ];

  const secondaryRules=[
    {id:'storage',re:/スタンド|ホルダー|収納|用具入れ|置き場|ケース付|ケース付き|ケース|オーガナイザー|ラック付|ラック付き/},
    {id:'compact',re:/省スペース|スリム|コンパクト|折りたたみ/},
    {id:'easy-clean',re:/食洗機対応|丸洗い|水洗い/},
    {id:'portable',re:/持ち運び|携帯|軽量/},
    {id:'heat',re:/保温|保冷|真空断熱|炭酸対応/},
    {id:'official',re:/公式|正規品/},
    {id:'discount',re:/\d{1,2}[％%]\s*(?:OFF|オフ)|半額|クーポン|ポイント\s*\d+倍|送料無料|特典(?:付|付き)?/i}
  ];

  const contextMap={
    clean:{
      hook:'毎日の掃除、できればもっと短時間で終わらせたい…',
      bridge:'気づいたときにサッと使えて、掃除を後回しにしにくいアイテム。',
      points:['掃除時間を短くしたい','準備や片付けが少ないものがいい','こまめに使いやすいものを探している'],
      benefit:'掃除時間を短くしたい人にぴったり',
      audience:'掃除を短時間で済ませたい人'
    },
    cook:{
      hook:'料理はしたい。でも時間も洗い物も増やしたくない…',
      bridge:'調理の手間を減らして、忙しい日のごはん作りをラクにしたい人に。',
      points:['調理時間を短くしたい','後片付けをラクにしたい','毎日使いやすい調理アイテムを探している'],
      benefit:'調理の手間と時間を減らしたい人にぴったり',
      audience:'忙しい日の調理をラクにしたい人'
    },
    odor:{
      hook:'ゴミ箱を開けた瞬間のニオイ、毎日のことやから気になる…',
      bridge:'おむつや生ゴミのニオイ対策を、できるだけ簡単に続けたい人に。',
      points:['ゴミ箱まわりのニオイが気になる','手軽な防臭対策を探している','毎日使いやすいものを選びたい'],
      benefit:'ニオイ対策を手軽に続けたい人にぴったり',
      audience:'ゴミ箱まわりのニオイを手軽に抑えたい人'
    },
    drain:{
      hook:'排水口のヌメヌメや髪の毛、できれば触りたくない…',
      bridge:'イヤなゴミ処理や掃除を、もっとサッと終わらせたい人に。',
      points:['排水口掃除のストレスを減らしたい','髪の毛やゴミに触れる回数を減らしたい','捨てるまでを簡単にしたい'],
      benefit:'排水口掃除のストレスを減らしたい人にぴったり',
      audience:'排水口の掃除やゴミ処理をラクにしたい人'
    },
    wash:{
      hook:'細かいところまで毎回きれいに洗うのって、地味に面倒…',
      bridge:'毎日の洗い物を少しでもラクにしたい人向けのアイテム。',
      points:['洗う手間を減らしたい','細かい部分まで洗いやすくしたい','毎日続けやすい方法を探している'],
      benefit:'毎日の洗い物をラクにしたい人にぴったり',
      audience:'洗い物の手間を減らしたい人'
    },
    storage:{
      hook:'片付けてもすぐ散らかる。しかも収納スペースが足りない…',
      bridge:'限られた場所を使いやすくして、片付けのハードルを下げたい人に。',
      points:['収納スペースを有効に使いたい','片付けやすい仕組みに変えたい','出し入れをラクにしたい'],
      benefit:'限られた収納スペースを有効に使いたい人にぴったり',
      audience:'限られた収納スペースを使いやすくしたい人'
    },
    open:{
      hook:'届いた段ボール、開けるたびにハサミを探すの面倒…',
      bridge:'開封作業をサッと済ませたい人に、あると地味に助かるアイテム。',
      points:['開封作業を早く済ませたい','ハサミを探す手間をなくしたい','手軽に使えるものを探している'],
      benefit:'荷物の開封をサッと済ませたい人にぴったり',
      audience:'通販の荷物をサッと開封したい人'
    },
    label:{
      hook:'名前書きやラベル付け、数が多いと本当に大変…',
      bridge:'同じ作業を何度も手書きする手間を減らしたい人に。',
      points:['名前付けを時短したい','同じ作業を何度も繰り返したくない','準備をまとめて終わらせたい'],
      benefit:'名前付けやラベル作業を時短したい人にぴったり',
      audience:'名前付けやラベル作業を時短したい人'
    },
    sleep:{
      hook:'寝ても疲れが残ると、毎日つらい…',
      bridge:'毎日の休息時間を少しでも快適にしたい人に。',
      points:['寝心地を見直したい','毎日の休息を快適にしたい','使いやすい寝具を探している'],
      benefit:'毎日の寝心地を整えたい人にぴったり',
      audience:'寝心地や休息時間を見直したい人'
    },
    carry:{
      hook:'外出先でも、飲みたい温度の飲み物を気軽に持ち歩きたい。',
      bridge:'毎日持ち歩きやすく、使いやすさも妥協したくない人に。',
      points:['飲み物を持ち歩きたい','通勤・通学や外出で使いやすいものがほしい','容量や使いやすさも比較して選びたい'],
      benefit:'毎日使えるボトルを探している人にぴったり',
      audience:'通勤・通学や外出用のボトルを探している人'
    },
    laundry:{
      hook:'洗濯って、洗うより「干す・たたむ・片付ける」が長い…',
      bridge:'毎日の洗濯動線を少しでも短く、ラクにしたい人に。',
      points:['洗濯の家事時間を減らしたい','干す・しまうをラクにしたい','毎日使いやすいものを選びたい'],
      benefit:'毎日の洗濯を少しでもラクにしたい人にぴったり',
      audience:'毎日の洗濯を少しでもラクにしたい人'
    },
    baby:{
      hook:'子どもまわりの準備や片付け、毎日だと地味に大変…',
      bridge:'育児の小さな手間を少しでも減らしたい人に。',
      points:['育児の手間を減らしたい','準備や片付けをラクにしたい','毎日使いやすいものを選びたい'],
      benefit:'毎日の育児を少しでもラクにしたい人にぴったり',
      audience:'育児の小さな手間を減らしたい人'
    },
    sign:{
      hook:'必要な場所や用途を、ひと目で分かるようにしておきたい。',
      bridge:'共用スペースや職場で、場所や用途を分かりやすく表示したい人向け。',
      points:['場所や用途を分かりやすくしたい','表示をすっきり整えたい','見やすく示したい'],
      benefit:'場所や用途を分かりやすく表示したい人にぴったり',
      audience:'場所や用途を分かりやすく表示したい人'
    }
  };

  function classify(name,keyword){
    const item=norm(name);
    const q=norm(keyword);
    const scores={};
    for(const rule of mainRules){
      if(has(rule.re,item)) scores[rule.id]=(scores[rule.id]||0)+rule.score;
      else if(has(rule.re,q)) scores[rule.id]=(scores[rule.id]||0)+1;
    }

    const secondary=[];
    for(const rule of secondaryRules) if(has(rule.re,item)) secondary.push(rule.id);

    const hasActiveCleaning=/モップ|ワイパー|ダスター|ほこり|ホコリ|ブラシ|ほうき|箒|雑巾|クロス|スポンジ|スクイージー|クリーナー/.test(item);
    const explicitCleaningStorage=/ワイパースタンド|掃除用具入れ|掃除道具入れ|クリーナースタンド|ツールオーガナイザー/.test(item);
    if(hasActiveCleaning && !explicitCleaningStorage) scores.clean=(scores.clean||0)+5;
    if(explicitCleaningStorage) scores.storage=(scores.storage||0)+5;

    const ranked=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
    const primary=ranked[0]?.[0]||'';
    let secondaryMain=ranked[1]?.[0]||'';
    if(secondaryMain===primary) secondaryMain='';

    if(primary==='clean' && secondary.includes('storage') && !secondaryMain) secondaryMain='storage';
    if(primary==='storage' && hasActiveCleaning && secondaryMain!=='clean') secondaryMain='clean';

    return {primary,secondaryMain,features:[...new Set(secondary)],confidence:ranked[0]?.[1]||0,item,query:q};
  }

  function cloneContext(id){
    const c=contextMap[id];
    return c?{hook:c.hook,bridge:c.bridge,points:[...c.points],benefit:c.benefit,audience:c.audience}:null;
  }

  function contextFor(name,keyword){
    const c=classify(name,keyword);
    if(!c.primary || c.confidence<4) return null;
    const ctx=cloneContext(c.primary);
    if(!ctx) return null;

    if(c.primary==='clean' && c.secondaryMain==='storage'){
      ctx.bridge='床や身の回りをサッと掃除できて、使わない時もすっきり置きたい人に。';
      ctx.points=['掃除時間を短くしたい','使った後もすっきり収納したい','出し入れしやすいものを選びたい'];
      ctx.benefit='掃除のしやすさと収納のしやすさを両立したい人にぴったり';
      ctx.audience='掃除をサッと済ませて、使わない時もすっきり収納したい人';
    }else if(c.primary==='storage' && c.secondaryMain==='clean'){
      ctx.bridge='掃除道具をまとめて、必要な時にサッと取り出せるようにしたい人に。';
      ctx.points=['掃除道具をすっきりまとめたい','必要な時にサッと取り出したい','限られたスペースを有効に使いたい'];
      ctx.benefit='掃除道具を使いやすく収納したい人にぴったり';
      ctx.audience='掃除道具をすっきりまとめて収納したい人';
    }

    if(c.features.includes('compact') && !ctx.points.includes('省スペースで使いたい')) ctx.points[2]='省スペースで使いたい';
    if(c.features.includes('easy-clean') && c.primary==='cook') ctx.points[2]='後片付けまでラクにしたい';
    if(c.features.includes('heat') && c.primary==='carry'){
      ctx.bridge='毎日持ち歩きやすく、保冷・保温の使いやすさも重視したい人に。';
      ctx.points[1]='保冷・保温も重視したい';
    }
    return ctx;
  }

  root.UrenaviProductRole={classify,contextFor};
})(typeof window==='undefined'?null:window);

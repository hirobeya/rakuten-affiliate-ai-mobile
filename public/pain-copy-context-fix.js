(function(root){
  'use strict';
  if(!root || !root.UrenaviPainCopy) return;
  const api=root.UrenaviPainCopy;
  const originalPainContext=api.painContext;


  function eggContext(name){
    const t=String(name||'');
    const quail=/うずら|ウズラ|鶉/.test(t);
    const cracker=/卵割り|たまご割り|玉子割り|卵カッター|エッグカッター|エッグシェル/.test(t);
    if(!quail && !cracker) return null;
    return {
      hook:quail?'うずら卵、小さいから殻をきれいに割るのが意外と手間…':'卵をできるだけ手早く、きれいに割りたい。',
      bridge:quail?'うずら卵の殻をサッと割って、調理の手間を減らしたい人向けのアイテム。':'卵を割る作業を手早く済ませたい人向けの調理アイテム。',
      points:[
        quail?'うずら卵をきれいに割りたい':'卵をきれいに割りたい',
        '調理の下ごしらえを手早く済ませたい',
        '小さな調理の手間を減らしたい'
      ],
      benefit:quail?'うずら卵を手早くきれいに割りたい人にぴったり':'卵を手早くきれいに割りたい人にぴったり',
      audience:quail?'うずら卵を手早くきれいに割りたい人':'卵を手早くきれいに割りたい人'
    };
  }

  function microwaveContext(name){
    const t=String(name||'');
    const steam=/蒸し|蒸す|蒸し器/.test(t);
    const grill=/焼き目|焼く|焼き魚/.test(t);
    return {
      hook:'料理はしたい。でも時間も洗い物も増やしたくない…',
      bridge:'電子レンジで手軽に調理して、忙しい日のごはん作りをラクにしたい人に。',
      points:[
        '調理時間を短くしたい',
        '火を使う手間を減らしたい',
        steam?'蒸し料理も手軽に作りたい':grill?'焼き料理もレンジで手軽に作りたい':'洗い物を少なくしたい'
      ],
      benefit:steam?'レンジで蒸し料理まで手軽に作りたい人にぴったり':grill?'焼き料理をレンジで手軽に作りたい人にぴったり':'調理の手間と時間を減らしたい人にぴったり',
      audience:'忙しい日に電子レンジ調理で時短したい人'
    };
  }

  function cleaningContext(name){
    const t=String(name||'');
    const sign=/室名プレート|ネームプレート|ピクトサイン|サインプレート|看板|標識/.test(t);
    const storage=/スタンド|用具入れ|収納|ホルダー|置き場/.test(t);

    if(sign){
      return {
        hook:'掃除道具の置き場所、ひと目で分かるようにしておきたい。',
        bridge:'共用スペースや職場で、掃除用具の場所を分かりやすく表示したい人向け。',
        points:['掃除用具の場所を分かりやすくしたい','表示をすっきり整えたい','室名や用途を見やすく示したい'],
        benefit:'掃除用具の置き場所を分かりやすく表示したい人にぴったり',
        audience:'掃除用具の置き場所を分かりやすくしたい人'
      };
    }

    if(storage){
      return {
        hook:'掃除道具が出しっぱなしだと、生活感も出るし片付けも面倒…',
        bridge:'ワイパーや掃除道具をひとまとめにして、必要なときにサッと使えるようにしたい人に。',
        points:['掃除道具をすっきりまとめたい','出し入れしやすくしたい','限られたスペースを有効に使いたい'],
        benefit:'掃除道具をまとめて使いやすく収納したい人にぴったり',
        audience:'掃除道具をすっきりまとめて収納したい人'
      };
    }

    return {
      hook:'毎日の掃除、できればもっと短時間で終わらせたい…',
      bridge:'気づいたときにサッと使えて、掃除を後回しにしにくいアイテム。',
      points:['掃除時間を短くしたい','準備や片付けが少ないものがいい','こまめに使いやすいものを探している'],
      benefit:'掃除時間を短くしたい人にぴったり',
      audience:'掃除を短時間で済ませたい人'
    };
  }

  api.painContext=function(name,keyword){
    const item=String(name||'');
    const q=String(keyword||'');

    if(/攻略本|書籍|絵本|図鑑|コミック|文庫|お金の大学/.test(item)) return {
      hook:'次に読みたい一冊、内容やレビューを見比べて選びたい。',
      bridge:'テーマや目次、版の違いを確認して、自分に合う一冊を探している人に。',
      points:['読みたいテーマに合うか確認したい','内容やレビューを比べて選びたい','版や付属特典も確認したい'],
      benefit:'内容を確かめて本を選びたい人の候補に',
      audience:'内容やレビューを確認して本を選びたい人'
    };
    if(/ゼルダ|ポケットモンスター|ゲームソフト|Nintendo|ニンテンドー|PlayStation|PS5|Switch/i.test(item)) return {
      hook:'次に遊ぶゲーム、作品や対応機種を確かめて選びたい。',
      bridge:'気になる作品の内容や対応機種、通常版と特典版の違いを確認したい人に。',
      points:['遊びたい作品を探している','対応機種を確かめたい','通常版と特典版を比較したい'],
      benefit:'作品・対応機種・特典を比べて選びたい人の候補に',
      audience:'作品や対応機種を確認してゲームを選びたい人'
    };

    const microwaveStorage=/レンジ台|レンジラック|レンジボード|収納棚|キッチン棚|キッチンラック/.test(item);
    const microwaveItem=!microwaveStorage && /電子レンジ調理|レンジ調理器|レンジクッカー|レンジパン|レンジポット|レンジメート|ムテキレンジ|レンジで(?:調理|蒸|焼)|蒸し器/.test(item);
    const microwaveQuery=/レンジ調理|電子レンジ|レンジクッカー/.test(q);
    const egg=eggContext(item);
    if(egg) return egg;
    if(microwaveItem || (microwaveQuery && !microwaveStorage && /レンジ(?:調理|クッカー|パン|ポット|メート)|電子レンジ調理/.test(item))) return microwaveContext(item);

    const cleaningQuery=/掃除|掃除用品|掃除用具|クリーナー|モップ|ワイパー|ホコリ|ほこり|ダスター/.test(q);
    const cleaningItem=/掃除|掃除用品|掃除用具|クリーナー|モップ|ワイパー|ホコリ|ほこり|ダスター/.test(item);
    if(cleaningItem || (cleaningQuery && cleaningItem)) return cleaningContext(item);

    // Use the product title as the source of truth. Search terms are hints only and
    // must not assign a use that is absent from the actual product name.
    return originalPainContext(name,'');
  };

  // Direct ROOM search is redundant. Keep the verified posting route:
  // Urenavi -> Rakuten Market product page -> ROOM icon -> ROOM posting screen.
  const style=root.document.createElement('style');
  style.textContent='.roomLink{display:none!important}';
  root.document.head.appendChild(style);
})(typeof window==='undefined'?null:window);

// stable-production-redeploy

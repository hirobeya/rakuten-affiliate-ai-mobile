(function(root){
  'use strict';
  if(!root || !root.UrenaviPainCopy) return;
  const api=root.UrenaviPainCopy;
  const originalPainContext=api.painContext;

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

    const microwaveItem=/電子レンジ|レンジ調理器|レンジクッカー|レンジパン|レンジポット|レンジメート|ムテキレンジ|レンジで|蒸し器/.test(item);
    const microwaveQuery=/レンジ調理|電子レンジ|レンジクッカー/.test(q);
    if(microwaveItem || (microwaveQuery && /レンジ|電子レンジ/.test(item))) return microwaveContext(item);

    const cleaningQuery=/掃除|掃除用品|掃除用具|クリーナー|モップ|ワイパー|ホコリ|ほこり|ダスター/.test(q);
    const cleaningItem=/掃除|掃除用品|掃除用具|クリーナー|モップ|ワイパー|ホコリ|ほこり|ダスター/.test(item);
    if(cleaningItem || (cleaningQuery && cleaningItem)) return cleaningContext(item);

    return originalPainContext(name,keyword);
  };
})(typeof window==='undefined'?null:window);

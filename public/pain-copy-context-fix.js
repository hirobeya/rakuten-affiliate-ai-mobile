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

  api.painContext=function(name,keyword){
    const item=String(name||'');
    const q=String(keyword||'');
    const microwaveItem=/電子レンジ|レンジ調理器|レンジクッカー|レンジパン|レンジポット|レンジメート|ムテキレンジ|レンジで|蒸し器/.test(item);
    const microwaveQuery=/レンジ調理|電子レンジ|レンジクッカー/.test(q);
    if(microwaveItem || (microwaveQuery && /レンジ|電子レンジ/.test(item))) return microwaveContext(item);
    return originalPainContext(name,keyword);
  };
})(typeof window==='undefined'?null:window);

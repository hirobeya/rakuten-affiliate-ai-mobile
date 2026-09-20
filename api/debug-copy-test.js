'use strict';
const fixture=require('../tests/fixtures/regression-products.json');

module.exports=async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({message:'Method not allowed'});
  global.window={};
  delete require.cache[require.resolve('../public/pain-copy.js')];
  delete require.cache[require.resolve('../public/room-copy-quality.js')];
  require('../public/pain-copy.js');
  require('../public/room-copy-quality.js');
  const api=global.window.UrenaviPainCopy;
  const results=[];
  const failures=[];
  for(const tc of fixture.cases){
    const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0,catchcopy:'',itemCaption:'',genrePath:'',genreName:''};
    const a=api.analyzeRoomProduct(item,'');
    const copy=api.makeRoomCopy(item,'',{variant:0});
    const features=a.facts||[];
    const e=tc.expect||{};
    const errs=[];
    if(a.category!==e.category) errs.push('category expected '+e.category+', got '+a.category);
    if(a.usage!==e.usage) errs.push('usage expected '+e.usage+', got '+a.usage);
    if(Boolean(a.ambiguous)!==Boolean(e.ambiguous)) errs.push('ambiguous expected '+e.ambiguous+', got '+a.ambiguous);
    if(a.outputMode!==e.outputMode) errs.push('outputMode expected '+e.outputMode+', got '+a.outputMode);
    for(const word of e.forbiddenWords||[]) if(copy.includes(word)) errs.push('forbidden word: '+word);
    for(const word of e.expectedFeatures||[]) if(!features.includes(word)) errs.push('missing feature: '+word);
    for(const word of e.forbiddenFeatures||[]) if(features.includes(word)) errs.push('forbidden feature: '+word);
    if(copy.length>500) errs.push('copy over 500 chars');
    if(!copy.includes('※アフィリエイト広告を利用しています')) errs.push('ROOM disclosure missing');
    if(errs.length) failures.push({id:tc.id,errors:errs});
    results.push({id:tc.id,itemName:tc.itemName,category:a.category,usage:a.usage,ambiguous:a.ambiguous,outputMode:a.outputMode,reason:a.ambiguityReason,features,conflicts:a.conflicts,copy,errors:errs});
  }
  return res.status(200).json({ok:failures.length===0,failures,results});
};

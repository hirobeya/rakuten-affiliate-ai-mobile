(function(root){
  'use strict';
  if(!root || !root.UrenaviPainCopy) return;
  const api=root.UrenaviPainCopy;
  const originalPainContext=api.painContext;

  api.painContext=function(name,keyword){
    const engine=root.UrenaviProductRole;
    if(engine && typeof engine.contextFor==='function'){
      const ctx=engine.contextFor(name,keyword);
      if(ctx) return ctx;
    }
    return originalPainContext(name,keyword);
  };
})(typeof window==='undefined'?null:window);

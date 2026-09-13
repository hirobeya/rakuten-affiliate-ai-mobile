(function(root){
  'use strict';
  if(!root || !root.UrenaviPainCopy) return;
  const api=root.UrenaviPainCopy;
  const originalPainContext=api.painContext;

  function install(){
    api.painContext=function(name,keyword){
      const engine=root.UrenaviProductRole;
      if(engine && typeof engine.contextFor==='function'){
        const ctx=engine.contextFor(name,keyword);
        if(ctx) return ctx;
      }
      return originalPainContext(name,keyword);
    };
  }

  if(root.UrenaviProductRole){
    install();
    return;
  }

  const script=root.document.createElement('script');
  script.src='/product-role-engine.js?v=20260913-1';
  script.defer=true;
  script.onload=install;
  root.document.head.appendChild(script);
})(typeof window==='undefined'?null:window);

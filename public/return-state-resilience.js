(function(root){
  'use strict';
  if(!root || !root.UrenaviReturnState) return;

  const KEY='urenavi_search_return_v1';
  const api=root.UrenaviReturnState;
  const baseSave=api.save.bind(api);
  const baseLoad=api.load.bind(api);
  const baseClear=api.clear.bind(api);

  function backupWrite(state,now){
    try{
      const value=JSON.stringify({...state,at:now});
      if(value.length<=500000) root.localStorage.setItem(KEY,value);
    }catch{}
  }

  function backupRead(email,now){
    try{
      const value=JSON.parse(root.localStorage.getItem(KEY)||'null');
      if(!value) return null;
      const valid=!!email && value.email===email && Number.isFinite(value.at) && now-value.at>=0 && now-value.at<=30*60*1000 && Array.isArray(value.items) && value.items.length<=10 && !value.items.some(i=>!i || typeof i!=='object' || typeof i.itemName!=='string');
      if(!valid){root.localStorage.removeItem(KEY);return null;}
      return value;
    }catch{return null;}
  }

  api.save=function(storage,state,now=Date.now()){
    const ok=baseSave(storage,state,now);
    backupWrite(state,now);
    return ok;
  };

  api.load=function(storage,email,now=Date.now()){
    const primary=baseLoad(storage,email,now);
    if(primary) return primary;
    const backup=backupRead(email,now);
    if(backup){
      try{storage?.setItem(KEY,JSON.stringify(backup));}catch{}
      return backup;
    }
    return null;
  };

  api.clear=function(storage){
    baseClear(storage);
    try{root.localStorage.removeItem(KEY);}catch{}
  };
})(typeof window==='undefined'?null:window);

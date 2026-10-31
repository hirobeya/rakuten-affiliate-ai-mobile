(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.UrenaviAuthObservation=api;
})(typeof window==='undefined'?null:window,function(){
 'use strict';
 function create(publish=()=>{}){
  const state={storageRead:'not-observed',storageWrite:'not-observed',verification:'not-observed',session:'not-observed',event:'not-observed',access:'not-observed'};
  function set(key,value){state[key]=value;try{publish({...state});}catch{} }
  const present=result=>result?.error?'rejected':result?.data?.session?'present':'absent';
  function storage(delegate){return {
   getItem(key){try{const value=delegate.getItem(key);set('storageRead',value===null?'absent':'present');return value;}catch(e){set('storageRead','failed');throw e;}},
   setItem(key,value){try{const result=delegate.setItem(key,value);set('storageWrite','saved');return result;}catch(e){set('storageWrite','failed');throw e;}},
   removeItem(key){try{const result=delegate.removeItem(key);set('storageWrite','removed');return result;}catch(e){set('storageWrite','failed');throw e;}}
  };}
  function watch(auth){
   for(const name of ['verifyOtp','signInWithPassword','getSession']){
    if(typeof auth[name]!=='function')continue;
    const original=auth[name].bind(auth),key=name==='getSession'?'session':'verification';
    auth[name]=async(...args)=>{set(key,'pending');try{const result=await original(...args);set(key,present(result));return result;}catch(e){set(key,'failed');throw e;}};
   }
   auth.onAuthStateChange((event,session)=>{
    const allowed=['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT','TOKEN_REFRESHED'];
    if(allowed.includes(event)){set('event',event);set('session',session?'present':'absent');}
   });
  }
  function access(status){set('access',status===200?'accepted':status===401?'unauthenticated':status===403?'forbidden':'unavailable');}
  return {storage,watch,access,snapshot:()=>({...state})};
 }
 const live=create(state=>{if(typeof document==='undefined')return;const el=document.getElementById('authObservation');if(el)el.textContent=Object.entries(state).map(([k,v])=>k+': '+v).join('\n');});
 return {...live,create};
});

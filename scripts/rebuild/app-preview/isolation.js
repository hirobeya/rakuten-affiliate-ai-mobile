'use strict';
window.AppIsolation={owner:'fixture-a',fault:new URLSearchParams(location.search).get('fault')||''};
window.AppOutcomeStorage={getItem:key=>localStorage.getItem('app_fixture:'+key),setItem:(key,value)=>{if(window.AppIsolation.fault==='save')throw Error('fixture_storage_failure');localStorage.setItem('app_fixture:'+key,value);},removeItem:key=>localStorage.removeItem('app_fixture:'+key)};
if(window.AppIsolation.fault==='copy')Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new DOMException('fixture denial','NotAllowedError');}}});
window.supabase={createClient:()=>({auth:{onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};},async getSession(){return {data:{session:null}};},async signOut(){return {};}}})};
const nativeFetch=window.fetch.bind(window);
window.fetch=(url,options)=>{
 const u=new URL(url,location.href);
 if(u.origin!==location.origin||u.pathname!=='/api/room-copy')return Promise.reject(new Error('isolated_preview_network_blocked'));
 if(window.AppIsolation.fault==='offline')return Promise.reject(new TypeError('fixture_network_failure'));
 const headers=new Headers(options?.headers);headers.set('X-Fixture-State',window.AppIsolation.fault);return nativeFetch(url,{...options,headers});
};

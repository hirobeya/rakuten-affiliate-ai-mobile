'use strict';
window.AppIsolation={owner:'fixture-a'};
window.supabase={createClient:()=>({auth:{onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};},async getSession(){return {data:{session:null}};},async signOut(){return {};}}})};
const nativeFetch=window.fetch.bind(window);
window.fetch=(url,options)=>{
 const u=new URL(url,location.href);
 if(u.origin!==location.origin||u.pathname!=='/api/room-copy')return Promise.reject(new Error('isolated_preview_network_blocked'));
 return nativeFetch(url,options);
};

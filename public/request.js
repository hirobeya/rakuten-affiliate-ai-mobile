(function(root){
  async function json(url,options={},timeout=30000){
    const controller=new AbortController();
    let timer;
    try{
      return await Promise.race([
        (async()=>{
          const response=await fetch(url,{...options,signal:controller.signal});
          let data;
          try{data=await response.json();}catch(error){
            if(controller.signal.aborted) throw error;
            throw new Error('検索結果を読み取れませんでした。もう一度お試しください。');
          }
          return {response,data};
        })(),
        new Promise((_,reject)=>{timer=setTimeout(()=>{
          reject(new Error('検索が時間内に完了しませんでした。もう一度お試しください。'));
          controller.abort();
        },timeout);})
      ]);
    }finally{clearTimeout(timer);}
  }
  if(typeof module!=='undefined' && module.exports) module.exports={json};
  else root.UrenaviRequest={json};
})(typeof window==='undefined'?{}:window);

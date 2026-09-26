'use strict';

const {db}=require('./billing');
const router=require('./super-urenavi-router');
const {createCacheStore}=require('./super-urenavi-cache');
const {resolveTypeKnowledge,defaultCallKnowledgeGroq}=require('./product-type-knowledge');

const DEFAULT_MODEL='qwen/qwen3.8-27b';

function concreteType(payload){
  const v=payload?.validation?.productType;
  return v?.valid===true?String(v.value||'').trim():'';
}

function shouldGenerate(payload){
  const route=String(payload?.route?.route||'');
  return route==='text'||route==='image';
}

function createHandler(deps={}){
  const baseHandler=deps.baseHandler||router.createHandler(deps.routerDeps||{});
  const store=deps.store||createCacheStore(db);
  const callKnowledge=deps.callKnowledge||defaultCallKnowledgeGroq;

  return async function handler(req,res){
    let statusCode=200;
    const proxy={
      setHeader:(...args)=>res.setHeader(...args),
      status(code){statusCode=code;return proxy;},
      async json(payload){
        if(statusCode===200 && payload?.ok){
          const productType=concreteType(payload);
          if(productType){
            try{
              const result=await resolveTypeKnowledge({
                productType,
                store,
                apiKey:String(process.env.GROQ_API_KEY||''),
                model:String(process.env.GROQ_ROOM_MODEL||DEFAULT_MODEL).trim()||DEFAULT_MODEL,
                generateOnMiss:shouldGenerate(payload),
                callKnowledge
              });
              payload.typeKnowledge={
                status:result.status,
                groqCalls:result.groqCalls||0,
                knowledge:result.knowledge||null
              };
              console.log('urenavi type knowledge',JSON.stringify({
                productType,status:result.status,groqCalls:result.groqCalls||0,
                route:String(payload?.route?.route||'')
              }));
            }catch(error){
              payload.typeKnowledge={status:'error',groqCalls:0,knowledge:null};
              console.warn('urenavi type knowledge skipped',error?.message||'unknown');
            }
          }
        }
        return res.status(statusCode).json(payload);
      }
    };
    return baseHandler(req,proxy);
  };
}

module.exports={createHandler,concreteType,shouldGenerate};

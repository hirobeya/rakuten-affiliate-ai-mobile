'use strict';
const {createHandler}=require('../room-copy-handler');
const billing=require('../billing'),Registry=require('./completed-store'),C=require('./contracts');
const PREFIX='urenavi-core-completed-v1';
function pathname(query){
 if(!query||typeof query.owner!=='string'||!query.owner||typeof query.key!=='string'||!query.key||typeof query.version!=='string'||!query.version)throw Error('completed_lookup_invalid');
 return PREFIX+'/'+C.hash({owner:query.owner})+'/'+C.hash({version:query.version,key:query.key})+'.json';
}
function privateReader(blob){
 if(typeof blob?.get!=='function')throw Error('private_completed_reader_required');
 return async query=>{
  const row=await blob.get(pathname(query),{access:'private',useCache:false});
  if(!row||row.statusCode===404)return null;
  if(row.statusCode!==200||!row.stream)throw Error('completed_storage_unavailable');
  const envelope=JSON.parse(await new Response(row.stream).text());
  return Registry.create([envelope])(query);
 };
}
function create({loadCompleted,loadSource,authorize=billing.authorize}={}){
 if(typeof loadCompleted!=='function'||typeof authorize!=='function')throw Error('trusted_completed_dependencies_required');
 const resolveCompletedSource=loadSource===undefined?null:require('./trusted-product-source').create({loadSource});
 const deny=()=>{throw Error('completed_read_cannot_generate_or_write');};
 const handler=createHandler({authorize,loadCompletedCore:loadCompleted,resolveCompletedSource,store:{},provider:{call:deny},consumeQuota:deny,logCost:()=>{}});
 return (req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='preview')return res.status(404).json({ok:false,pending:false,message:'not_found'});
  if(req.method!=='POST')return res.status(405).json({ok:false,pending:false,message:'method_not_allowed'});
  if(req.body?.completedCoreOnly!==true)return res.status(403).json({ok:false,pending:false,message:'completed_read_only'});
  return handler(req,res);
 };
}
function createOperational({blob,authorize=billing.authorize}={}){
 const source=require('./trusted-product-source');
 return create({authorize,loadSource:source.privateReader(blob),loadCompleted:privateReader(blob)});
}
module.exports={create,createOperational,privateReader,pathname,PREFIX};

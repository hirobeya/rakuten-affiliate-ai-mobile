'use strict';
// This route exposes synthetic completed records only. No provider, quota or DB dependency is used.
const {createHandler}=require('../../../../lib/room-copy-handler');
const read=require('../../../../lib/urenavi-core/completed-store').create(require('../artifacts.json'));
const deny=()=>{throw Error('isolated_preview_write_or_generation_forbidden');};
const handler=createHandler({authorize:async req=>{const owner=req.headers['x-fixture-owner'];return ['fixture-a','fixture-b'].includes(owner)?{ok:true,plan:'owner',user:{id:owner}}:{ok:false};},loadCompletedCore:read,store:{},provider:{call:deny},consumeQuota:deny,logCost:()=>{}});
module.exports=(req,res)=>{
 if(process.env.VERCEL_ENV!=='preview'||req.body?.completedCoreOnly!==true)return res.status(403).json({ok:false,message:'isolated_completed_reads_only'});
 return handler(req,res);
};

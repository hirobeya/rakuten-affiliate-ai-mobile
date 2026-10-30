'use strict';
// This route exposes synthetic completed records only. No provider, quota or DB dependency is used.
const {createHandler}=require('../../../../lib/room-copy-handler');
const read=require('../../../../lib/urenavi-core/completed-store').create(require('../artifacts.json'));
const deny=()=>{throw Error('isolated_preview_write_or_generation_forbidden');};
const handler=createHandler({authorize:async req=>{const owner=req.headers['x-fixture-owner'];return ['fixture-a','fixture-b'].includes(owner)?{ok:true,plan:'owner',user:{id:owner}}:{ok:false};},loadCompletedCore:read,store:{},provider:{call:deny},consumeQuota:deny,logCost:()=>{}});
module.exports=(req,res)=>{
 if(process.env.VERCEL_ENV!=='preview'||req.body?.completedCoreOnly!==true)return res.status(403).json({ok:false,message:'isolated_completed_reads_only'});
 const fault=req.headers['x-fixture-state'];
 if(fault==='pending')return res.status(202).json({ok:false,pending:true,quality:{status:'pending'},variants:[]});
 if(['blocked','error','429'].includes(fault))return res.status(fault==='429'?429:fault==='error'?503:200).json({ok:false,pending:false,quality:{status:fault},variants:[]});
 return handler(req,res);
};

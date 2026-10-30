'use strict';
const R=require('../runtime');
module.exports=async(req,res)=>{res.setHeader('Cache-Control','no-store');if(req.method!=='GET'||req.query?.action!=='app-status')return res.status(403).json({ok:false});try{const auth=await R.authorize(req);if(!auth.ok)return res.status(auth.status||403).json({ok:false});return res.status(200).json({plan:auth.plan,pro:false,preview:true});}catch{return res.status(503).json({ok:false});}};

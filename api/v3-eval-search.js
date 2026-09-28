'use strict';
const handler=require('./search');
module.exports=async function(req,res){
 if(String(process.env.VERCEL_ENV||'')!=='preview')return res.status(404).json({message:'Not found'});
 return handler(req,res);
};

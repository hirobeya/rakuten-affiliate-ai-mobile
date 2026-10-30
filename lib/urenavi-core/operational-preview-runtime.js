'use strict';
// Server composition for an approved Preview. No public generation endpoint is created.
const Search=require('../../api/search'),Billing=require('../billing');
const Reads=require('./authenticated-completed-read'),Writers=require('./preview-artifact-writer');
function create({blob,approvedUserId,writesApproved=false,authorizeSearch=Billing.authenticateSearchUser,authorizeCopy=Billing.authorize,claimSearch}={}){
 if(typeof approvedUserId!=='string'||!approvedUserId.trim())throw Error('approved_search_user_required');
 if(typeof writesApproved!=='boolean')throw Error('explicit_write_mode_required');
 const bind=authorize=>async req=>{
  const auth=await authorize(req);
  if(auth?.ok!==true||auth.user?.id!==approvedUserId)return {ok:false,status:403};
  return auth;
 };
 const writer=Writers.create({blob,assertWriteAllowed:async auth=>writesApproved===true&&auth.user.id===approvedUserId});
 const search=Search.createHandler({authorize:bind(authorizeSearch),...(claimSearch?{claimSearch}:{}),...(writesApproved?{captureSources:writer.captureSources}:{})});
 const copy=Reads.createOperational({blob,authorize:bind(authorizeCopy)});
 function preview(handler){return (req,res)=>{
  if(process.env.VERCEL_ENV!=='preview')return res.status(404).json({ok:false,message:'not_found'});
  return handler(req,res);
 };}
 return {search:preview(search),copy:preview(copy),saveCompleted:writer.saveCompleted,sourceCaptureEnabled:writesApproved};
}
module.exports={create};

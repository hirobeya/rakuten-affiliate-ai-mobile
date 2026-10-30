'use strict';
const Runtime=require('../../../lib/urenavi-core/operational-preview-runtime');
const Billing=require('../../../lib/billing');
const crypto=require('node:crypto');
const STORE='store_sGSByr5MbYbxbENt';
function config(){
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='recovery/urenavi-core-20261030')throw Error('isolated_preview_required');
 const approvedUserId=process.env.URENAVI_SEARCH_VERIFICATION_USER_ID;
 if(typeof approvedUserId!=='string'||!approvedUserId)throw Error('approved_user_not_configured');
 return {approvedUserId};
}
async function authorize(req){
 const {approvedUserId}=config(),auth=await Billing.authorize(req);
 if(auth?.ok!==true||auth.plan!=='owner'||auth.user?.id!==approvedUserId)return {ok:false,status:403};
 return auth;
}
function create(){
 const {approvedUserId}=config();
 const writesApproved=process.env.URENAVI_SEARCH_SOURCE_WRITES==='approved-own-source';
 if(writesApproved&&process.env.BLOB_STORE_ID!==STORE)throw Error('approved_private_store_mismatch');
 return Runtime.create({blob:require('@vercel/blob'),approvedUserId,writesApproved,authorizeSearch:authorize,authorizeCopy:authorize});
}
function endpoint(name){return async(req,res)=>{res.setHeader('Cache-Control','no-store');try{return await create()[name](req,res);}catch{return res.status(503).json({ok:false,pending:false,message:'verification_connection_unavailable'});}};}
module.exports={config,authorize,create,endpoint,ownerHash:id=>crypto.createHash('sha256').update(id).digest('hex')};

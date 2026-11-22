'use strict';

const {createHash}=require('node:crypto');

const branch='experiment/urenavi-groq-room-copy-20261122';
const primary={keyword:'収納ケース 衣類 フタ付き',minPrice:1500,maxPrice:5000};
const alternate={keyword:'電気ケトル 0.8L',minPrice:3000,maxPrice:8000};

function isModeAPreview(env=process.env){
  return env.VERCEL_ENV==='preview' && env.VERCEL_GIT_COMMIT_REF===branch &&
    env.URENAVI_MODE_A_PREVIEW==='enabled';
}

function approvedSlot(body){
  if(![1,2,3,4].includes(body?.slot)) return null;
  return {...(body.slot<=2?primary:alternate),slot:body.slot,sort:'standard'};
}

function isApprovedDeployment(affiliateId,env=process.env){
  const sha=env.VERCEL_GIT_COMMIT_SHA;
  return /^[\da-f]{40}$/.test(sha||'') && sha===env.URENAVI_MODE_A_APPROVED_SHA &&
    Boolean(affiliateId) && createHash('sha256').update(affiliateId).digest('hex')===env.URENAVI_MODE_A_AFFILIATE_HASH;
}

function hasThreeCandidates(items){
  const codes=new Set(),titles=new Set();
  for(const item of items){
    const title=String(item.itemName||'').normalize('NFKC').replace(/\s+/g,' ').trim();
    if(!title||!item.itemCode||codes.has(item.itemCode)||titles.has(title)||
       item.reviewCount<100||item.reviewAverage<4.3||item.itemPrice<=0||!item.itemCaption)continue;
    codes.add(item.itemCode);
    titles.add(title);
  }
  return codes.size>=3;
}

module.exports={isModeAPreview,approvedSlot,isApprovedDeployment,hasThreeCandidates};

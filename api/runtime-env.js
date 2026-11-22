'use strict';
const {isModeAPreview}=require('../lib/mode-a-preview');

module.exports=function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    preview:process.env.VERCEL_ENV === 'preview',
    ...(isModeAPreview()?{modeA:true}:{})
  });
};

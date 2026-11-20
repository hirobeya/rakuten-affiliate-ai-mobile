'use strict';

module.exports=function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    preview:process.env.VERCEL_ENV === 'preview',
    manualOnly:process.env.URENAVI_PRODUCT_INPUT_MODE==='manual'
  });
};

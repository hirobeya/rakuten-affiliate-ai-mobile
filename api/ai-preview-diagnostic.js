'use strict';
module.exports=function(req,res){
  res.setHeader('Cache-Control','no-store');
  return res.status(404).json({message:'Not found'});
};

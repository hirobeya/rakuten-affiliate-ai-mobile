'use strict';
function corpusGenres(input){
  if(input&&Array.isArray(input.genres))return input.genres;
  if(input&&Array.isArray(input.items))return [{name:'corpus',items:input.items.map(row=>row.item||row)}];
  if(Array.isArray(input)){
    const groups=new Map();
    for(const row of input){
      const item=row?.item||row;
      if(!item||typeof item.itemName!=='string')throw new Error('Invalid evaluation product');
      const category=String(row.category||'corpus');
      if(!groups.has(category))groups.set(category,{name:category,items:[]});
      groups.get(category).items.push(item);
    }
    return [...groups.values()];
  }
  throw new Error('Unsupported evaluation corpus shape');
}
module.exports={corpusGenres};

'use strict';

function canonicalWithMap(value=''){
  const source=String(value??'');
  let text='';const map=[];let offset=0,lastSpace=false;
  for(const ch of source){
    const start=offset,end=offset+ch.length;offset=end;
    let normalized=ch.normalize('NFKC').replace(/[〜～~−–—]/g,'-');
    for(const n of normalized){
      if(/\s/.test(n)){
        if(lastSpace)continue;
        text+=' ';map.push({start,end});lastSpace=true;continue;
      }
      lastSpace=false;text+=n;map.push({start,end});
    }
  }
  return{text:text.trim(),map,source};
}
function canonical(value=''){
  return String(value??'').normalize('NFKC').replace(/[〜～~−–—]/g,'-').replace(/\s+/g,' ').trim();
}
function recoverExactSubstring(source,candidate){
  const wanted=canonical(candidate);if(!wanted)return'';
  const row=canonicalWithMap(source);const at=row.text.indexOf(wanted);if(at<0)return'';
  const second=row.text.indexOf(wanted,at+1);if(second>=0)return'';
  const firstMap=row.map[at],lastMap=row.map[at+wanted.length-1];
  if(!firstMap||!lastMap)return'';
  return row.source.slice(firstMap.start,lastMap.end).trim();
}
function repairAttribute(attribute,item){
  if(!attribute||typeof attribute!=='object')return attribute;
  const parts=[String(item?.itemName||''),String(item?.itemCaption||'')];
  let quote=String(attribute.quote||'');
  for(const source of parts){const hit=recoverExactSubstring(source,quote);if(hit){quote=hit;break;}}
  let value=String(attribute.value||'');
  const exactValue=recoverExactSubstring(quote,value);if(exactValue)value=exactValue;
  return{...attribute,quote,value};
}
function distinguishTextFeatureNames(attributes=[]){
  const rows=attributes.map(x=>x&&typeof x==='object'?{...x}:x);
  const groups=new Map();
  rows.forEach((row,index)=>{
    if(!row||String(row.valueType||'')!=='text')return;
    const name=canonical(row.name).toLowerCase();if(!name)return;
    if(!groups.has(name))groups.set(name,[]);groups.get(name).push(index);
  });
  for(const indexes of groups.values()){
    if(indexes.length<2)continue;
    const values=new Set(indexes.map(i=>canonical(rows[i]?.value).toLowerCase()).filter(Boolean));
    if(values.size<2)continue;
    for(const i of indexes){
      const value=String(rows[i]?.value||'').trim();
      if(value)rows[i].name=value;
    }
  }
  return rows;
}
function repairPass1SourceText(raw,item={}){
  if(!raw||typeof raw!=='object')return raw;
  const out={...raw};
  if(raw.productType&&typeof raw.productType==='object'){
    let quote=String(raw.productType.quote||'');
    for(const source of [String(item.itemName||''),String(item.itemCaption||'')]){const hit=recoverExactSubstring(source,quote);if(hit){quote=hit;break;}}
    out.productType={...raw.productType,quote};
  }
  const repaired=Array.isArray(raw.attributes)?raw.attributes.map(a=>repairAttribute(a,item)):raw.attributes;
  out.attributes=Array.isArray(repaired)?distinguishTextFeatureNames(repaired):repaired;
  return out;
}
module.exports={canonical,recoverExactSubstring,repairAttribute,distinguishTextFeatureNames,repairPass1SourceText};

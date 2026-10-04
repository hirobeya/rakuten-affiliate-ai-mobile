'use strict';

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

const BLOCKED=new Set([
  '商品','用品','グッズ','セット','タイプ','モデル','シリーズ','ケース','カバー','バッグ','ベッド','ミラー','ハンガー','スタンド','スケール','ボード','ノート','フィルター','ケーブル','アーム','ライト'
]);

function tokens(value=''){
  return normalize(value)
    .split(/[\s【】〖〗（）()「」『』\[\]{}・／/\\|｜,:：;；!！?？★☆※。&＆]+/)
    .map(normalize)
    .filter(Boolean);
}

function genericToken(value=''){
  const v=normalize(value);
  if(BLOCKED.has(v)) return true;
  if(v.length<4||v.length>28) return true;
  if(/^\d+(?:\.\d+)?(?:[A-Za-z]+)?$/.test(v)) return true;
  if(/^[A-Z0-9_.+\-]{3,}$/i.test(v)) return true;
  if(/^(?:公式|送料無料|人気|おすすめ|新作|限定|軽量|小型|大型|コンパクト|自動|電動|充電式|乾電池式|折りたたみ|折り畳み|防水|撥水|日本製)$/.test(v)) return true;
  return false;
}

function accessoryScoped(title,value){
  const t=normalize(title),v=normalize(value);
  const at=t.indexOf(v);
  if(at<0) return true;
  const before=t.slice(Math.max(0,at-10),at);
  const after=t.slice(at+v.length,Math.min(t.length,at+v.length+14));
  return /(?:交換用|替え)\s*$/.test(before)
    || /^\s*(?:用|専用)\s*(?:ケース|カバー|ポーチ|ホルダー|フィルター|アダプター|ケーブル|交換|替え)/.test(after);
}

function sourceAgreementIdentity(item={}){
  const title=normalize(item.itemName),caption=normalize(item.itemCaption);
  if(!title||!caption) return null;
  const captionLower=caption.toLocaleLowerCase('ja-JP');
  const seen=new Set(),candidates=[];
  for(const token of tokens(title)){
    const key=token.toLocaleLowerCase('ja-JP');
    if(seen.has(key)||genericToken(token)||accessoryScoped(title,token)) continue;
    seen.add(key);
    const atCaption=captionLower.indexOf(key);
    if(atCaption<0) continue;
    const atTitle=title.toLocaleLowerCase('ja-JP').indexOf(key);
    let score=10;
    if(token.length>=6) score+=2;
    if(atTitle<=12) score+=2;
    if(atCaption<=120) score+=1;
    candidates.push({value:token,quote:token,titleIndex:atTitle,captionIndex:atCaption,score,confidence:'high',method:'source_agreement'});
  }
  candidates.sort((a,b)=>b.score-a.score||b.value.length-a.value.length||a.titleIndex-b.titleIndex);
  const best=candidates[0]||null;
  const second=candidates[1]||null;
  if(!best) return null;
  if(second&&best.score-second.score<2&&best.value!==second.value) return null;
  return {...best,runnerUp:second?{value:second.value,score:second.score}:null};
}

module.exports={normalize,genericToken,sourceAgreementIdentity};

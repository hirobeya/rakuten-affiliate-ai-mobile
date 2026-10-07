'use strict';

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

function longestCommonSubstringLength(a,b){
  const x=[...normalize(a)],y=[...normalize(b)];
  if(!x.length||!y.length) return 0;
  let best=0;
  const row=new Array(y.length+1).fill(0);
  for(let i=1;i<=x.length;i++){
    for(let j=y.length;j>=1;j--){
      row[j]=x[i-1]===y[j-1]?row[j-1]+1:0;
      if(row[j]>best) best=row[j];
    }
  }
  return best;
}

function hasCompetingCompoundIdentity(titleRaw,identityRaw){
  const title=normalize(titleRaw),identity=normalize(identityRaw);
  if(!title||identity.length<3) return false;
  const tokens=title.split(/[\s,，、。!！?？()（）【】\[\]・\/／]+/).map(normalize).filter(Boolean);
  const identityAt=title.indexOf(identity);
  for(const token of tokens){
    if(token===identity||token.length<4||token.length>24) continue;
    // If a longer compound explicitly contains the selected generic identity,
    // choosing the shorter form would normally drop source context
    // (e.g. ヘアドライヤー -> ドライヤー).
    if(token.includes(identity)&&token.length>identity.length){
      const tokenAt=title.indexOf(token);
      // When the exact identity is already the leading standalone product name,
      // a later token may repeat that same product with a descriptive prefix or
      // a size/model suffix. Keep it as supporting repetition, but never allow
      // an accessory/component suffix to hide a genuinely different product.
      const standaloneIndex=tokens.findIndex(x=>x===identity);
      const tokenIndex=tokens.indexOf(token);
      if(standaloneIndex>=0&&tokenIndex>standaloneIndex){
        const at=token.indexOf(identity);
        const prefix=token.slice(0,at);
        const suffix=token.slice(at+identity.length);
        const accessorySuffix=/^(?:用|専用)?(?:ケース|カバー|バッグ|ポーチ|ホルダー|フィルター|アダプター|ケーブル|バッテリー|充電器|替え|交換|パーツ|部品)/;
        const safeDescriptorPrefix=!prefix
          || /^[ぁ-んー]{2,10}$/.test(prefix)
          || /^(?:魔法|定番|新型|薄型|厚手|大型|特大|大きめ|小さめ)の$/.test(prefix);
        const safeDescriptorSuffix=!suffix
          || /^(?:(?:特大|大型|大|中|小|ミニ|ワイド|ロング|ショート|スリム|コンパクト|サイズ)?[A-Za-z0-9._+\-]*)$/.test(suffix);
        if(!accessorySuffix.test(suffix)&&safeDescriptorPrefix&&safeDescriptorSuffix) continue;
      }
      return true;
    }
    // If the chosen identity is already the longer compound, a shorter contained noun is harmless.
    if(identity.includes(token)) continue;
    // Two different compounds sharing a substantial noun core are semantically ambiguous.
    // When the competing compound appears first, do not guess which target the post is about.
    if(longestCommonSubstringLength(token,identity)>=4){
      const tokenAt=title.indexOf(token);
      if(tokenAt>=0&&(identityAt<0||tokenAt<identityAt)) return true;
    }
  }
  return false;
}

module.exports={hasCompetingCompoundIdentity,longestCommonSubstringLength};

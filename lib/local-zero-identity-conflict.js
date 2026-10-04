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
      // Exception: when the exact identity is already the leading product name,
      // and a later token only adds a descriptive prefix while ending with the
      // same identity, it is supporting repetition rather than a competing item
      // (e.g. キッチンペーパーホルダー ... 片手で切れるキッチンペーパーホルダー).
      if(identityAt===0&&tokenAt>identityAt&&token.endsWith(identity)) continue;
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

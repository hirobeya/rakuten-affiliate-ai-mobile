'use strict';
// Product genre can guide identity resolution, never certify a claim.
// Must independently appear in the exact product title and pass role guards.
const {isNonWholeProductIdentity,isDescriptorIdentity}=require('../local-identity-role-guard');
const normalize=x=>String(x||'').normalize('NFKC').replace(/\s+/g,' ').trim();
const UNSAFE=/(?:その他|セット|商品|用品|関連|アクセサリ|パーツ|パーツ類|オプション|交換|替え|まとめ|各種|福袋|ギフト|特集|特価|アウトレット|ノーブランド|総合)/;
const TAIL=/(?:用|専用)?(?:ケース|カバー|ホルダー|ポーチ|フィルター|替刃|交換部品)/;
function genreIdentity({itemName='',genreName='',genrePath=''}={}){
 const title=normalize(itemName),genre=normalize(genreName),path=normalize(genrePath);
 if(!title||!genre||genre.length<2||genre.length>35||UNSAFE.test(genre)||isDescriptorIdentity(genre))return null;
 if(/\d/.test(genre)||/[|<>]/.test(genre))return null;
 const i=title.indexOf(genre);
 if(i<0||title.indexOf(genre,i+genre.length)>=0&&title.indexOf(genre)===-1)return null;
 if(isNonWholeProductIdentity(genre,title))return null;
 const left=title.slice(Math.max(0,i-7),i),right=title.slice(i+genre.length,i+genre.length+16);
 if(/(?:専用|交換用|替え|互換|用)\s*$/.test(left)&&TAIL.test(genre+right))return null;
 if(/^(?:用|専用|向け|対応)?(?:ケース|カバー|ホルダー|ポーチ|フィルター|交換用|替え)/.test(right))return null;
 // The category path only checks consistency; never becomes source evidence.
 if(path&&!path.includes(genre))return null;
 return {identity:genre,source:'genre_title_overlap',titleQuote:genre,genreName:genre,proof:'exact_title_and_genre_overlap',publishable:false};
}
module.exports={genreIdentity};

'use strict';

const END=/(?:[。！？!?]|\r?\n|[●■◆♪]|(?<=\s)[0-9０-９]{1,2}[)）](?=\S)|(?:^|\s)・|(?<!\S)(?:商品説明|商品詳細|商品仕様|ご注意|関連キーワード|関連商品)(?=\s|$))/gu;
const FOREIGN=/(?:別売|別モデル|別商品|別の|他社|他の商品|関連商品|別タイプ|旧(?:型|モデル)|後継|専用パーツ|別ページ|別途購入)/u;
const SECTION=/(?:メーカー希望|商品情報|商品仕様|注意事項|ご注意|備考|関連キーワード|検索用|カテゴリー|カテゴリ[：:]|(?:^|\s)(?:商品名|品番|材質|カラー)[：:])/u;

function sourcePassages(source){
 const result=[];
 let start=0,group=0;
 function add(end,kind='sentence'){
  const raw=source.slice(start,end),quote=raw.trim();
  if(quote){
   const from=start+raw.indexOf(quote);
   result.push({quote,start:from,end:from+quote.length,group,kind});
  }
 }
 for(const match of source.matchAll(END)){
  const mark=match[0].trim();
  const punctuation=/^[。！？!?]$/u.test(mark);
  add(match.index+(punctuation?match[0].length:0));
  start=match.index+match[0].length;
  if(/^(?:商品説明|商品詳細|商品仕様|ご注意|関連キーワード|関連商品)$/u.test(mark)){
   const from=match.index+match[0].indexOf(mark);
   result.push({quote:mark,start:from,end:from+mark.length,group:++group,kind:'section'});
  }else if(!punctuation)group++;
 }
 add(source.length);
 return result;
}

module.exports={sourcePassages,FOREIGN,SECTION};

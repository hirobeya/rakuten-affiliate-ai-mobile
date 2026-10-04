'use strict';

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

const MATERIALS=new Set([
  'シリコン','ステンレス','スチール','アルミ','アルミニウム','木製','ガラス','セラミック',
  '本革','レザー','ナイロン','ポリエステル','コットン','綿','メッシュ','プラスチック','樹脂','ゴム'
]);
const COLORS=new Set([
  'ブラック','黒','ホワイト','白','グレー','灰','シルバー','銀','ゴールド','金','レッド','赤',
  'ブルー','青','グリーン','緑','ピンク','ベージュ','ブラウン','茶','ネイビー','紺','パープル','紫','イエロー','黄'
]);
const FEATURE_ONLY=new Set([
  '充電式','電池式','防水','撥水','軽量','小型','大型','コンパクト','自動','電動','折りたたみ','折り畳み',
  '収納','伸縮','角度調整','高さ調整','スマホ対応','スマホ連携','Bluetooth対応','Bluetooth','USB','Type-C','USB-C'
]);
const FEATURE_SUFFIX=/(?:連携|対応|仕様|調整|調節|回転|保温|収納|軽量|小型|大型|コンパクト)$/;
const COMPONENT_HEAD=/(?:フード|プレート|フィルター|バッテリー|ケーブル|アダプター|替刃|刃|ノズル|ブラシ|ケース|カバー)$/;

function isDescriptorIdentity(value=''){
  const v=normalize(value);
  if(!v) return true;
  return MATERIALS.has(v)||COLORS.has(v)||FEATURE_ONLY.has(v)||FEATURE_SUFFIX.test(v);
}

function isLikelyComponentIdentity(value='',title=''){
  const v=normalize(value),t=normalize(title);
  if(!v||!COMPONENT_HEAD.test(v)) return false;
  if(v===t) return false;
  const tokens=t.split(/[\s,，、。!！?？()（）【】\[\]・\/／]+/).map(normalize).filter(Boolean);
  const index=tokens.indexOf(v);
  if(index<0) return false;
  // A component-like phrase is suspicious when a different nearby noun-shaped token exists.
  return tokens.slice(0,5).some((token,i)=>i!==index&&token.length>=4&&!isDescriptorIdentity(token)&&!COMPONENT_HEAD.test(token));
}

function isNonWholeProductIdentity(value='',title=''){
  return isDescriptorIdentity(value)||isLikelyComponentIdentity(value,title);
}

module.exports={MATERIALS,COLORS,FEATURE_ONLY,isDescriptorIdentity,isLikelyComponentIdentity,isNonWholeProductIdentity};

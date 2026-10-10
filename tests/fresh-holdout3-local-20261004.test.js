'use strict';

const test=require('node:test');
const {localZeroCall}=require('../api/room-ai-v3');

// Third untouched holdout. Selected after holdout2 was recorded and before
// reading any result from localZeroCall. Do not tune the implementation to
// these products before recording this first run.
const items=[
  {
    id:'holdout3-thermos-kfc-026',
    itemCode:'holdout3:thermos:KFC-026',
    itemName:'サーモス フライパン 26cm デュラブルシリーズ KFC-026 ブラック IH対応 ガス火対応',
    itemCaption:'フライパン 26cm。IH・ガス火対応。内径26cm。',
    itemPrice:0,
    imageUrl:''
  },
  {
    id:'holdout3-ohm-ds-ls16mug',
    itemCode:'holdout3:ohm:DS-LS16MUG',
    itemName:'オーム電機 LEDデスクライト 調光機能付き USB給電 デスクライト DS-LS16MUG-W',
    itemCaption:'LEDデスクライト。USB給電。調光機能付き。',
    itemPrice:0,
    imageUrl:''
  },
  {
    id:'holdout3-shupatto-m',
    itemCode:'holdout3:marna:Shupatto-M',
    itemName:'マーナ Shupatto シュパット コンパクトバッグ M エコバッグ 折りたたみ',
    itemCaption:'エコバッグ。折りたたみタイプ。容量約15L。',
    itemPrice:0,
    imageUrl:''
  }
];

test('third untouched fresh holdout - record first generalized zero-call result as-is',()=>{
  const results=items.map(item=>({id:item.id,result:localZeroCall(item)}));
  console.log('FRESH_HOLDOUT3_LOCAL_20261004 '+JSON.stringify(results));
});

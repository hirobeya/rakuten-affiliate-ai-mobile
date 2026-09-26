'use strict';

const assert=require('node:assert/strict');
const {
  validateUnderstanding,readerLayerSafe,appealNeedsVerification
}=require('../lib/super-urenavi-v3-understanding');

const kettleItem={
  itemName:'電気ケトル 温度調節 0.8L 1200W 50-100度 保温機能 1℃単位',
  itemCaption:'容量0.8L。50-100度を1℃単位で温度設定できます。'
};
const kettleRaw={
  productType:{specific:'電気ケトル',general:'ケトル',quote:'電気ケトル'},
  attributes:[
    {name:'容量',value:'0.8L',unit:'L',qualifier:'',valueType:'single',quote:'0.8L'},
    {name:'消費電力',value:'1200W',unit:'W',qualifier:'',valueType:'single',quote:'1200W'},
    {name:'温度設定範囲',value:'50-100度',unit:'度',qualifier:'',valueType:'range',quote:'50-100度'},
    {name:'温度設定単位',value:'1℃',unit:'℃',qualifier:'単位',valueType:'single',quote:'1℃単位'}
  ],
  decisionAxes:[{text:'温度設定の細かさ',attributeRefs:[2,3]},{text:'容量',attributeRefs:[0]}],
  appeals:[
    {text:'飲み物に合わせて温度を細かく選べる',noHassle:'沸かしてから冷めるのを待たなくていい',scene:'コーヒーや白湯の温度を変えたいとき',attributeRefs:[2,3],strength:3},
    {text:'0.8L',noHassle:'',scene:'',attributeRefs:[0],strength:2}
  ],
  hooks:[
    {type:'question',text:'飲み物ごとに、お湯の温度を気にすることありませんか？'},
    {type:'scene',text:'朝の一杯を自分好みにしたいとき。'}
  ]
};
const kettle=validateUnderstanding(kettleRaw,kettleItem);
assert.equal(kettle.valid,true);
assert.equal(kettle.productType.specific,'電気ケトル');
assert.equal(kettle.attributes.length,4);
assert.equal(kettle.attributes[2].name,'温度設定範囲');
assert.equal(kettle.attributes[2].valueType,'range');
assert.equal(kettle.hooks.length,2);
assert.equal(kettle.appeals.length,1);
assert.equal(kettle.appeals[0].needsVerification,true);

const socksItem={itemName:'靴下 メンズ 24-28cm 10足セット',itemCaption:'対応サイズ24-28cm'};
const socks=validateUnderstanding({
  productType:{specific:'靴下',general:'衣類',quote:'靴下'},
  attributes:[{name:'対応サイズ',value:'24-28cm',unit:'cm',qualifier:'',valueType:'range',quote:'24-28cm'}],
  decisionAxes:[{text:'サイズ',attributeRefs:[0]}],
  appeals:[{text:'対応サイズは24-28cm',noHassle:'',scene:'',attributeRefs:[0],strength:3}],
  hooks:[{type:'failure_avoidance',text:'サイズ選びで迷いたくない人へ。'}]
},socksItem);
assert.equal(socks.attributes[0].name,'対応サイズ');
assert.equal(socks.attributes[0].value,'24-28cm');
assert.notEqual(socks.attributes[0].name,'収納サイズ');

const scaleItem={itemName:'キッチンスケール 0.01g単位 0.05g~500g 本体重量約178g',itemCaption:''};
const scale=validateUnderstanding({
  productType:{specific:'キッチンスケール',general:'はかり',quote:'キッチンスケール'},
  attributes:[
    {name:'計量範囲',value:'0.05g~500g',unit:'g',qualifier:'',valueType:'range',quote:'0.05g~500g'},
    {name:'本体重量',value:'約178g',unit:'g',qualifier:'約',valueType:'single',quote:'本体重量約178g'}
  ],
  decisionAxes:[{text:'計量範囲',attributeRefs:[0]}],
  appeals:[{text:'細かな量を測りたいときの判断材料になる',noHassle:'',scene:'少量を計量するとき',attributeRefs:[0],strength:3}],
  hooks:[{type:'question',text:'少量を量るとき、目分量で迷うことありませんか？'}]
},scaleItem);
assert.equal(scale.attributes[0].name,'計量範囲');
assert.equal(scale.attributes[1].name,'本体重量');
assert.equal(scale.appeals[0].needsVerification,true);

const watchItem={itemName:'シチズン レディース 腕時計 EC1165-51W チタン',itemCaption:''};
const watch=validateUnderstanding({
  productType:{specific:'腕時計',general:'時計',quote:'腕時計'},
  attributes:[{name:'型番',value:'EC1165-51W',unit:'',qualifier:'',valueType:'identifier',quote:'EC1165-51W'}],
  decisionAxes:[{text:'モデル確認',attributeRefs:[0]}],
  appeals:[{text:'型番はEC1165-51W',noHassle:'',scene:'',attributeRefs:[0],strength:1}],
  hooks:[{type:'scene',text:'毎日使うものほど、選ぶ基準ははっきりさせたい。'}]
},watchItem);
assert.equal(watch.attributes[0].valueType,'identifier');
assert.equal(watch.appeals[0].needsVerification,true);

const gloveItem={itemName:'バイクグローブ 本革 スマホ対応',itemCaption:'バイク用グローブです'};
const glove=validateUnderstanding({
  productType:{specific:'バイクグローブ',general:'グローブ',quote:'バイクグローブ'},
  attributes:[{name:'素材',value:'本革',unit:'',qualifier:'',valueType:'text',quote:'本革'}],
  decisionAxes:[{text:'素材',attributeRefs:[0]}],
  appeals:[{text:'素材は本革',noHassle:'',scene:'',attributeRefs:[0],strength:2}],
  hooks:[{type:'scene',text:'ツーリングの装備を選ぶとき。'}]
},gloveItem);
assert.equal(glove.productType.specific,'バイクグローブ');
assert.equal(glove.productType.general,'グローブ');

assert.equal(readerLayerSafe('sudden rain対策'),false);
assert.equal(readerLayerSafe('通勤路上的聴取'),false);
assert.equal(readerLayerSafe('朝の支度で、あと少し余裕が欲しいとき。'),true);
assert.equal(readerLayerSafe('5000mAhで長時間使える'),false);
assert.equal(readerLayerSafe('電気ケトルで朝がラク',{specific:'電気ケトル',general:'ケトル'}),false);

const conflict=validateUnderstanding({
  productType:{specific:'商品',general:'用品',quote:'商品'},
  attributes:[
    {name:'容量',value:'500ml',unit:'ml',qualifier:'',valueType:'single',quote:'容量500ml'},
    {name:'容量',value:'750ml',unit:'ml',qualifier:'',valueType:'single',quote:'容量750ml'}
  ],decisionAxes:[],appeals:[],hooks:[]
},{itemName:'商品 容量500ml 容量750ml',itemCaption:''});
assert.equal(conflict.attributes.length,0);
assert.ok(conflict.reasons.includes('conflicting_attribute_values'));

assert.equal(appealNeedsVerification({text:'0.8L',noHassle:'',scene:'',attributeRefs:[0]},[{quote:'容量0.8L'}]),false);
assert.equal(appealNeedsVerification({text:'約3杯分',noHassle:'',scene:'',attributeRefs:[0]},[{quote:'容量0.8L'}]),true);

console.log('super-urenavi-v3-understanding.test.js: PASS');

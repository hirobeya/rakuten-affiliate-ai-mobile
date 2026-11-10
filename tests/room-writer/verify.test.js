'use strict';
// S2 verifier-only unit tests. Synthetic cases are not the independent 40-item benchmark.
const test=require('node:test'),assert=require('node:assert/strict');
const {verify}=require('../../lib/room-writer/verify');
const types=['収納ボックス','書類ケース','衣類ケース','引き出しケース','整理ケース','収納チェスト','ファイルケース','小物入れ','道具箱','衣類ボックス'];
const clone=x=>structuredClone(x);
function sample(i){
 const type=types[i%types.length];
 const facts=[
  {id:'f01',field:'itemName',text:type+'は高さの異なる二つの引き出しを備え、上側と下側に分けて衣類を収められます。',numbers:[],keep:[]},
  {id:'f02',field:'itemCaption',text:'引き出しには文具と衣類などを別々に入れられる仕組みがあります。',numbers:[],keep:[]},
  {id:'f03',field:'itemCaption',text:'引き出しは上下に分かれ、収納する場所を分類できます。',numbers:[],keep:[]}
 ];
 const c=(text,kind,basis)=>({text,kind,basis});
 const draft={
  product:{type,unit:'一個',basis:['f01'],confident:true},hold:{active:false,reason:''},
  post:{
   hook:c(type+'を日用品の分類に使いたい方なら、引き出しの構造も気になるところ。','S',['f01']),
   body:[
    c('上側と下側の引き出しを別々に使えるので、収納する場所を分けられる作りです。','F',['f01','f03']),
    c('衣類と文房具のしまう場所を分けたい場面なら、区画の違いを確かめたい方に。','S',['f02']),
    c('引き出しは二つに分かれ、入れるものに合わせて使う側を決められます。','F',['f01','f03'])
   ],note:''
  },tags:[]
 };
 return {pack:{version:'room-writer-source-pack-v1',itemCode:'unit:'+i,facts},draft};
}
const mutators=[
 d=>{delete d.product.type;},
 d=>{d.post.body[0].basis=['nonexistent'];},
 d=>{d.post.body[0].text='700Wで動作する装置です。';},
 (d,p)=>{p.facts[0].text+=' この仕様は別売モデルのみです。';},
 d=>{d.post.body[0].text+=' 安心して使えます。';},
 d=>{d.post.body[1].text='3回使う場面に適しています。';},
 d=>{d.post.body[0].text+=' 耐火性能があります。';},
 (d,p)=>{d.post.body[0].text=p.facts[0].text;},
 d=>{d.post.hook.text='日用品の分類に使いたい方なら、引き出しの構造も気になるところ。';},
 d=>{d.post.body[1].text='服を分類したい方なら。';d.post.body[2].text='引き出しを使えます。';d.post.body[0].text='上下で収納できます。';d.post.hook.text=d.product.type+'を選びたい方なら。';}
];
test('S2: 30 source-grounded paraphrases have <=3 false vetoes',()=>{
 let falseVeto=0;
 for(let i=0;i<30;i++){
  const {pack,draft}=sample(i);
  const v=verify(pack,draft);
  if(!v.ok)falseVeto++;
  assert.equal(v.publication,false);
  assert.equal(v.copyable,false);
 }
 assert.ok(falseVeto<=3,'source-grounded false rejection '+falseVeto+'/30');
});
test('S2: zero of 30 deliberately unsafe/invalid variants may pass',()=>{
 let missed=0;
 for(let i=0;i<30;i++){
  const {pack,draft}=sample(i),d=clone(draft),p=clone(pack);
  mutators[i%mutators.length](d,p);
  const v=verify(p,d);
  if(v.ok)missed++;
  assert.equal(v.publication,false);
 }
 assert.equal(missed,0,'unsafe mechanical false acceptance '+missed+'/30');
});

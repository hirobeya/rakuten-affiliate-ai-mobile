'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {inspect}=require('../../lib/room-semantic-contract');
const rows=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json'),'utf8')).rows;
function get(id){const x=rows.find(r=>r.item.itemCode===id);assert.ok(x,id);return x.item;}
const samples=[
 {id:'e-kurashi:10019512',draft:{
  product:{what:'収納ベンチ',acts_on:'収納する物',acts_on_quote:'座部を上げると、内部に物を収納可能'},
  sentences:[
   {text:'座る場所と収納を一緒に考えたいときに。',quotes:['ベンチ、オットマン、オットマン、1台で3つの機能の便利な椅子','座部を上げると、内部に物を収納可能'],kinds:['scene']},
   {text:'座部を上げると内部に物を収納できる収納ベンチです。',quotes:['収納ベンチ','座部を上げると、内部に物を収納可能'],kinds:['spec','benefit']}
  ]
 }},
 {id:'myhomeshop:10000326',draft:{
  product:{what:'電気ケトル',acts_on:'お湯の温度',acts_on_quote:'7段階（45℃/55℃/65℃/75℃/85℃/95℃/100℃）の温度調節機能付き'},
  sentences:[
   {text:'飲み物に合わせて温度を調節したいときに。',quotes:['飲み物に合わせた美味しい温度で楽しむことができる7段階'],kinds:['scene']},
   {text:'7段階の温度調節ができ、4時間の保温機能も付いた電気ケトルです。',quotes:['電気ケトル','7段階温度調節','4時間保温'],kinds:['spec','benefit']}
  ]
 }}
];
test('diagnostic: manually authored source-backed copy and machine boundary are independent',()=>{
 const results=[];
 for(const x of samples){const r=inspect(get(x.id),x.draft);results.push({id:x.id,ok:r.ok,failures:r.failures});assert.equal(r.ok,true,JSON.stringify({id:x.id,failures:r.failures}));}
 console.log('HUMAN_COPY_BOUNDARY_DIAGNOSTIC '+JSON.stringify(results));
 assert.equal(results.length,2);
});

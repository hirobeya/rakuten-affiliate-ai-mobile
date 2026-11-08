'use strict';
// Product/source-backed EDITORIAL TARGETS. These are human-authored examples,
// NOT model output or a local generator's production-ready success rate.
// They must pass exact-source machine checks and later independent semantic review.
const rows=[
 {itemCode:'e-kurashi:10019512',product:{what:'収納ベンチ',acts_on:'内部にしまう物',acts_on_quote:'座部を上げると、内部に物を収納可能'},sentences:[
  {text:'座る場所も、物をしまう場所も欲しいときに。',quotes:['ベンチ、オットマン、オットマン、1台で3つの機能の便利な椅子','座部を上げると、内部に物を収納可能'],kinds:['scene']},
  {text:'座部を上げると内部に物を収納できる、2人掛けの収納ベンチです。',quotes:['収納ベンチ 2人掛け','座部を上げると、内部に物を収納可能'],kinds:['spec','benefit']}
 ]},
 {itemCode:'myhomeshop:10000326',product:{what:'電気ケトル',acts_on:'お湯の温度',acts_on_quote:'7段階（45℃/55℃/65℃/75℃/85℃/95℃/100℃）の温度調節機能付き'},sentences:[
  {text:'飲み物に合わせてお湯の温度を選びたいときに。',quotes:['飲み物に合わせた美味しい温度で楽しむことができる7段階'],kinds:['scene']},
  {text:'7段階の温度調節と4時間の保温機能を備えた電気ケトルです。',quotes:['電気ケトル','7段階温度調節','4時間保温機能付き'],kinds:['spec','benefit']}
 ]},
 {itemCode:'daiya:10001447',product:{what:'洗濯ネット',acts_on:'ブラジャーの左右のカップ',acts_on_quote:'ブラジャー専用洗濯ネットです'},sentences:[
  {text:'ブラジャーを畳まずに洗濯ネットへ入れたいときに。',quotes:['ブラジャーのカップを裏返したり、畳んだりせずに入れられる'],kinds:['scene']},
  {text:'ハート型のポケットが左右のカップを包み込むことで、洗濯中の擦れやねじれをおさえる洗濯ネットです。',quotes:['ハート型のポケットが左右のカップを包み込み','洗濯時の擦れやねじれをおさえます','洗濯ネット'],kinds:['spec','benefit']}
 ]},
 {itemCode:'risu-onlineshop:10002384',product:{what:'収納ケース',acts_on:'衣類など収納する物',acts_on_quote:'可愛いくすみカラーが特徴の収納ケース'},sentences:[
  {text:'リビングなど、人目につく場所で使う収納を選びたいときに。',quotes:['中が透けないので、リビングなど人目につく場所においても生活感が出づらく'],kinds:['scene']},
  {text:'中が透けない、2段セットの収納ケースです。',quotes:['中が透けない','2段セット','収納ケース'],kinds:['spec','benefit']}
 ]}
];
module.exports={rows};

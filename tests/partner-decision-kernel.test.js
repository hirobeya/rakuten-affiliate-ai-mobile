'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {selectBestCandidate,shouldPublish,scoreCandidate,clichePenalty,axisFamily,purchaseImpactBonus}=require('../lib/partner-decision-kernel');

test('concrete grounded purchase axis outranks weak generic numeric angle',()=>{
  const source='包丁スタンド ステンレス 食洗機対応 日本製 20cm';
  const candidates=[
    {quote:'20cm',axis:'数値仕様',hook:'数値仕様も確認して選びたいとき',body:'20cm表記の包丁スタンドです。',score:4,kind:'numeric'},
    {quote:'食洗機対応',axis:'お手入れ',hook:'お手入れ方法も確認して選びたいとき',body:'食洗機対応の包丁スタンドです。',score:10,kind:'signal'},
    {quote:'日本製',axis:'生産情報',hook:'生産情報も確認して選びたいとき',body:'日本製の包丁スタンドです。',score:3,kind:'signal'}
  ];
  const best=selectBestCandidate(candidates,{source,identity:'包丁スタンド',decisionAxes:['お手入れ','素材']});
  assert.ok(best);
  assert.equal(best.quote,'食洗機対応');
  assert.equal(best.decision.confidence,'high');
  assert.equal(shouldPublish(best),true);
  assert.ok(best.decision.principles.includes('compare_multiple_candidates'));
});

test('candidate absent from source is never publishable',()=>{
  const candidate={quote:'防水',axis:'仕様',hook:'使う環境に関わる仕様も確認して選びたいとき',body:'防水仕様の商品です。',score:8,kind:'signal'};
  assert.equal(scoreCandidate(candidate,{source:'撥水 バッグ',identity:'バッグ'}),-Infinity);
  assert.equal(selectBestCandidate([candidate],{source:'撥水 バッグ',identity:'バッグ'}),null);
});

test('negated candidate is vetoed even when the word exists in source',()=>{
  const candidate={quote:'防水',axis:'仕様',hook:'使う環境に関わる仕様も確認して選びたいとき',body:'防水仕様の商品です。',score:8,kind:'signal'};
  assert.equal(scoreCandidate(candidate,{source:'非防水 バッグ',identity:'バッグ'}),-Infinity);
});

test('weak numeric-only angle is withheld when confidence is low',()=>{
  const source='キッチンスケール 0.1g';
  const best=selectBestCandidate([
    {quote:'0.1g',axis:'数値仕様',hook:'数値仕様も確認して選びたいとき',body:'0.1g表記のキッチンスケールです。',score:4,kind:'numeric'}
  ],{source,identity:'キッチンスケール'});
  assert.ok(best);
  assert.equal(best.decision.confidence,'low');
  assert.equal(shouldPublish(best),false);
});

test('product decision axis boosts the feature that matters for this product type',()=>{
  const source='電気ケトル 1.0L 温度調節 1200W';
  const candidates=[
    {quote:'1200W',axis:'電力仕様',hook:'電力仕様も確認して選びたいとき',body:'1200W表記の電気ケトルです。',score:8,kind:'numeric'},
    {quote:'温度調節',axis:'温度設定',hook:'温度を選んで使いたいとき',body:'温度調節に対応した電気ケトルです。',score:8,kind:'signal'}
  ];
  const best=selectBestCandidate(candidates,{source,identity:'電気ケトル',decisionAxes:['容量','温度設定','保温']});
  assert.equal(best.quote,'温度調節');
  assert.equal(best.decision.confidence,'high');
});

test('blocked inference wording is vetoed even when the underlying source feature exists',()=>{
  const candidate={quote:'1200W',axis:'電力仕様',hook:'すぐ沸かしたい朝に',body:'1200Wだから素早く沸く電気ケトルです。',score:12,kind:'signal'};
  const score=scoreCandidate(candidate,{
    source:'電気ケトル 1200W',identity:'電気ケトル',blockedInferences:['1200Wだから素早く沸く電気ケトルです。']
  });
  assert.equal(score,-Infinity);
});

test('cliche wording is penalized instead of winning on marketing tone alone',()=>{
  const cliche={quote:'食洗機対応',axis:'お手入れ',hook:'毎日をもっと快適に',body:'食洗機対応の包丁スタンドです。',score:10,kind:'signal'};
  const natural={quote:'食洗機対応',axis:'お手入れ',hook:'お手入れ方法も確認して選びたいとき',body:'食洗機対応の包丁スタンドです。',score:10,kind:'signal'};
  assert.ok(clichePenalty(cliche)>0);
  const context={source:'包丁スタンド 食洗機対応',identity:'包丁スタンド',decisionAxes:['お手入れ']};
  assert.ok(scoreCandidate(natural,context)>scoreCandidate(cliche,context));
});

test('adjustability is treated as a high-impact purchase family',()=>{
  const candidate={quote:'伸縮',axis:'可変構造',hook:'長さを変えて使いたいとき',body:'伸縮仕様の自撮り棒です。',score:11,kind:'signal'};
  assert.equal(axisFamily(candidate),'adjustability');
  assert.ok(purchaseImpactBonus(candidate)>purchaseImpactBonus({axis:'素材・構造'}));
});

test('independent range evidence reinforces extendable structure when ranking selfie stick reasons',()=>{
  const source='自撮り棒 伸縮 三脚一体型 Bluetooth 最大130cm';
  const candidates=[
    {quote:'伸縮',axis:'可変構造',hook:'長さを変えて使いたいとき',body:'伸縮仕様の自撮り棒です。',score:11,kind:'signal'},
    {quote:'三脚一体型',axis:'設置・構造',hook:'置いて使える構造も確認して選びたいとき',body:'三脚一体型の自撮り棒です。',score:10,kind:'signal'},
    {quote:'Bluetooth',axis:'接続方式',hook:'接続方式も確認して選びたいとき',body:'Bluetooth表記の自撮り棒です。',score:9,kind:'signal'},
    {quote:'最大130cm',axis:'可変範囲',hook:'長さの上限も確認して選びたいとき',body:'最大130cm表記の自撮り棒です。',score:8,kind:'numeric'}
  ];
  const best=selectBestCandidate(candidates,{source,identity:'自撮り棒'});
  assert.ok(best);
  assert.equal(best.quote,'伸縮');
  assert.equal(best.decision.family,'adjustability');
  assert.equal(best.decision.corroborationBonus,2);
  assert.equal(best.decision.confidence,'high');
});

test('direct adjustment beats connector detail for an unknown adjustable light',()=>{
  const source='LEDライト 角度調整 リモコン付き USB-C';
  const candidates=[
    {quote:'角度調整',axis:'角度調整',hook:'角度を変えて使いたいとき',body:'角度調整に対応したLEDライトです。',score:11,kind:'signal'},
    {quote:'リモコン付き',axis:'操作方法',hook:'リモコンの有無も確認して選びたいとき',body:'リモコン付きのLEDライトです。',score:10,kind:'signal'},
    {quote:'USB-C',axis:'端子',hook:'接続端子も確認して選びたいとき',body:'USB-C表記のLEDライトです。',score:9,kind:'signal'}
  ];
  const best=selectBestCandidate(candidates,{source,identity:'LEDライト'});
  assert.ok(best);
  assert.equal(best.quote,'角度調整');
  assert.equal(best.decision.family,'adjustability');
  assert.ok(best.decision.score>best.decision.runnerUpScore);
});

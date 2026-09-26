'use strict';
const fs=require('fs');

function replaceOnce(file,from,to){
  let s=fs.readFileSync(file,'utf8');
  if(!s.includes(from)) throw new Error(file+': target not found');
  s=s.replace(from,to);
  fs.writeFileSync(file,s);
}

const oldApp="if(!q||q.length>32||/^(?:商品|グッズ|便利グッズ|生活雑貨|日用品|家電|掃除|収納|ペット|美容|おすすめ|人気)$/i.test(q)) return '';";
const newApp="if(!q||q.length>32||/^(?:商品|グッズ|便利グッズ|生活雑貨|日用品|家電|掃除|収納|ペット|美容|おすすめ|人気|バッグ|ケース|カバー|ブラシ|ローラー|手袋|グローブ|ホルダー|スタンド|シート|ボトル|ベッド|マット|ライト|ケーブル|フィルター|クリーナー|タオル)$/i.test(q)) return '';";
replaceOnce('public/app.html',oldApp,newApp);

const oldLive="if(!q||q.length>32||/^(?:商品|グッズ|便利グッズ|生活雑貨|日用品|家電|掃除|収納|ペット|美容|おすすめ|人気)$/i.test(q)||risk(q)) return '';";
const newLive="if(!q||q.length>32||/^(?:商品|グッズ|便利グッズ|生活雑貨|日用品|家電|掃除|収納|ペット|美容|おすすめ|人気|バッグ|ケース|カバー|ブラシ|ローラー|手袋|グローブ|ホルダー|スタンド|シート|ボトル|ベッド|マット|ライト|ケーブル|フィルター|クリーナー|タオル)$/i.test(q)||risk(q)) return '';";
replaceOnce('public/live-unknown-10.html',oldLive,newLive);

const oldTest=`  await run('client copy accepts simple_partial but rejects fallback and invalid product type',()=>{\n    const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/app.html'),'utf8');\n    assert.match(html,/if\\(!\\(v\\?\\.mode==='simple'\\|\\|v\\?\\.mode==='simple_partial'\\)\\) return ''/);\n    assert.match(html,/if\\(v\\.productType\\?\\.valid!==true\\) return ''/);\n    assert.match(html,/if\\(!String\\(insight\\.productType\\|\\|''\\)\\.trim\\(\\)\\) return ''/);\n  });`;
const newTest=`  await run('client copy permits only source-grounded fallback identity and keeps strict evidence path',()=>{\n    const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/app.html'),'utf8');\n    assert.match(html,/function safeSearchIdentity\\(item\\)/);\n    assert.match(html,/v\\.productType\\?\\.valid===true\\?String\\(insight\\.productType\\|\\|''\\)\\.trim\\(\\):safeSearchIdentity\\(item\\)/);\n    assert.match(html,/const universalPost=window\\.UrenaviPainCopy\\?\\.buildValidatedProductPost/);\n    assert.match(html,/if\\(universalPost\\) return universalPost/);\n    assert.match(html,/if\\(!\\(v\\?\\.mode==='simple'\\|\\|v\\?\\.mode==='simple_partial'\\)\\) return ''/);\n    assert.doesNotMatch(html,/if\\(v\\.productType\\?\\.valid!==true\\) return ''/);\n    assert.match(html,/バッグ\\|ケース\\|カバー\\|ブラシ\\|ローラー/);\n    assert.match(html,/source\\.includes\\(qc\\)\\?q:''/);\n  });`;
replaceOnce('tests/room-ai-phase1.test.js',oldTest,newTest);
console.log('fallback safety and AI regression updated');

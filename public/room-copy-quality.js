(function(root){
  'use strict';
  if(!root || !root.UrenaviPainCopy) return;

  const api=root.UrenaviPainCopy;
  const fmt=n=>new Intl.NumberFormat('ja-JP').format(+n||0);
  const norm=s=>String(s||'').normalize('NFKC').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();

  function titleOnly(item){
    return norm(item?.itemName||'');
  }

  function titleText(item){
    return titleOnly(item);
  }

  function detailText(item){
    return [item?.catchcopy,item?.itemCaption,item?.genrePath,item?.genreName].filter(Boolean).map(norm).join(' ');
  }

  function sourceText(item){
    return [titleOnly(item),detailText(item)].filter(Boolean).join(' ');
  }

  function stableVariant(text,mod=10){
    const s=String(text||'');
    let h=2166136261;
    for(let i=0;i<s.length;i++) h=Math.imul(h^s.charCodeAt(i),16777619)>>>0;
    return h%mod;
  }

  function uniquePush(out,value){
    const v=norm(value);
    if(v && !out.includes(v)) out.push(v);
  }

  function isSensitiveCategory(text){
    return /サプリ|健康食品|化粧品|美容|スキンケア|育毛|発毛|医薬|薬用|衛生|除菌|抗菌|ダイエット|痩身|美白|シミ|しわ|シワ|ニキビ|口臭|歯周|血圧|血糖|コレステロール|睡眠|疲労/.test(text);
  }

  const bannedOutput=[
    /絶対/g,/必ず/g,/確実に/g,/No\.?\s*1/gi,/ナンバーワン/g,/一番/g,/最高/g,/最強/g,
    /治る|治します|治療する/g,/若返る|若返り/g,/痩せる|痩身効果/g,/病気を防ぐ|予防する/g
  ];

  function sanitizeOutput(text){
    let s=String(text||'');
    s=s.replace(/治る|治します|治療する/g,'ケアをサポートする')
      .replace(/若返る|若返り/g,'年齢に応じたケアを意識しやすい')
      .replace(/痩せる|痩身効果/g,'健康的な生活を意識するきっかけになりそう')
      .replace(/病気を防ぐ|予防する/g,'日常のケアに取り入れやすそう')
      .replace(/改善する|改善します/g,'整える助けになりそう')
      .replace(/解消する|解消します/g,'負担を減らす助けになりそう')
      .replace(/絶対|必ず|確実に/g,'')
      .replace(/No\.?\s*1|ナンバーワン|一番|最高|最強/gi,'');
    return s.replace(/\s+/g,' ').replace(/。。+/g,'。').trim();
  }

  function titleSignals(item){
    const t=titleOnly(item);
    const signals=[];
    const rules=[
      [/網戸|あみ戸|アミ戸/,'網戸'],
      [/手袋|グローブ|ミトン/,'手袋'],
      [/抜け毛|毛取り|毛とり/,'抜け毛'],
      [/クロス/,'クロス'],
      [/モップ/,'モップ'],
      [/ブラシ/,'ブラシ'],
      [/マイクロファイバー/,'マイクロファイバー'],
      [/収納|ラック|ケース|ボックス|圧縮袋/,'収納'],
      [/充電|バッテリー|USB|Type-?C|Lightning/i,'充電'],
      [/水筒|タンブラー|ボトル|マグ/,'ボトル'],
      [/洗濯|ランドリー|ハンガー|洗濯ネット/,'洗濯'],
      [/ピーラー|スライサー|包丁|チョッパー|調理器|フライパン|鍋/,'調理'],
      [/ペット|猫|犬|グルーミング/,'ペット']
    ];
    for(const [re,label] of rules) if(re.test(t)) uniquePush(signals,label);
    return signals;
  }

  function classify(item){
    const title=titleOnly(item);
    const detail=detailText(item);
    const rules=[
      {re:/ペット|猫|犬|グルーミング|抜け毛|毛取り|毛とり/,kind:'pet',problem:'ペットの抜け毛を手早く集めたい',use:'抜け毛のお手入れに使う',impact:'日々の毛取りを手軽に続ける助けになりそう',audience:'犬や猫の抜け毛ケアを手軽にしたい人'},
      {re:/網戸|あみ戸|アミ戸|掃除|清掃|クリーナー|モップ|ワイパー|ブラシ|クロス|ダスター|ほこり|ホコリ/,kind:'cleaning',problem:'気になる汚れを手早く掃除したい',use:'掃除したい場所に合わせて使う',impact:'掃除のひと手間を減らす助けになりそう',audience:'掃除をこまめに済ませたい人'},
      {re:/収納|ラック|ケース|ボックス|クローゼット|ワゴン|整理|圧縮袋/,kind:'storage',problem:'物の置き場所を整えたい',use:'物をまとめたり定位置を作る',impact:'片づけの手間を減らす助けになりそう',audience:'収納場所を整えたい人'},
      {re:/洗濯|ランドリー|物干し|ハンガー|洗濯ネット/,kind:'laundry',problem:'洗濯まわりの手間を減らしたい',use:'洗濯や物干しに使う',impact:'毎日の洗濯作業を進めやすくなりそう',audience:'洗濯の手間を少しでも減らしたい人'},
      {re:/ピーラー|スライサー|包丁|チョッパー|みじん切り|調理器|フライパン|鍋|キッチン/,kind:'cooking',problem:'調理の細かな作業を手早く済ませたい',use:'下ごしらえや調理に使う',impact:'料理の準備を進めやすくする助けになりそう',audience:'毎日の調理を少しでも手早く進めたい人'},
      {re:/モバイルバッテリー|充電器|充電|USB|Type-?C|Lightning/i,kind:'charging',problem:'外出先で充電切れを避けたい',use:'スマホや機器の充電に使う',impact:'電池残量を気にする場面を減らす助けになりそう',audience:'外出中の充電切れが気になる人'},
      {re:/水筒|タンブラー|ボトル|マグ/,kind:'drinkware',problem:'飲み物を持ち歩きやすくしたい',use:'飲み物の持ち運びに使う',impact:'外出先でも飲み物を用意しやすくなりそう',audience:'通勤・通学や外出用に飲み物を持ち歩きたい人'},
      {re:/バッグ|ポーチ|サコッシュ|リュック|ショルダー|財布/,kind:'carry',problem:'出先で必要な物をまとめたい',use:'持ち物をまとめて持ち歩く',impact:'必要な物を探す手間を減らす助けになりそう',audience:'持ち物を整理して持ち歩きたい人'},
      {re:/寝具|布団|枕|マットレス|シーツ/,kind:'bedding',problem:'寝具まわりを扱いやすくしたい',use:'就寝まわりで使う',impact:'寝具まわりの小さな手間を減らす助けになりそう',audience:'寝具まわりの使い勝手を見直したい人'},
      {re:/ベビー|赤ちゃん|キッズ|子供|子ども/,kind:'kids',problem:'子どもまわりの準備をしやすくしたい',use:'育児や子どもの準備に使う',impact:'日々の準備を進めやすくする助けになりそう',audience:'育児や子どもの準備を少しでもラクにしたい人'}
    ];
    for(const r of rules) if(r.re.test(title)) return {...r,confidence:'title'};
    const detailHits=rules.filter(r=>r.re.test(detail));
    if(detailHits.length===1) return {...detailHits[0],confidence:'detail'};
    return {kind:'ambiguous',confidence:'ambiguous',problem:'',use:'',impact:'',audience:''};
  }

  function extractFacts(item,kind){
    // Features come from itemName only. No catchcopy/caption/genre keyword extraction.
    const t=titleOnly(item);
    const facts=[];
    const add=x=>uniquePush(facts,x);
    const byKind={
      cleaning:[
        [/網戸|あみ戸|アミ戸/,'網戸掃除向け'],
        [/手袋|グローブ|ミトン/,'手にはめて使うタイプ'],
        [/マイクロファイバー/,'マイクロファイバー'],
        [/吸水/,'吸水タイプ'],
        [/速乾/,'速乾タイプ'],
        [/モップ/,'モップタイプ'],
        [/ブラシ/,'ブラシタイプ'],
        [/クロス/,'クロスタイプ']
      ],
      pet:[
        [/両面/,'両面タイプ'],
        [/グローブ|手袋/,'手にはめて使うタイプ'],
        [/抜け毛|毛取り|毛とり/,'抜け毛・毛取り用途'],
        [/猫犬兼用|犬猫兼用|猫.*犬|犬.*猫/,'犬・猫向け表記あり']
      ],
      storage:[
        [/圧縮袋/,'圧縮袋タイプ'],
        [/折りたたみ|折畳/,'折りたたみ対応'],
        [/省スペース|スリム/,'省スペース設計']
      ],
      charging:[
        [/急速充電/,'急速充電対応'],
        [/Type-?C|USB-?C/i,'USB-C対応'],
        [/ワイヤレス充電/,'ワイヤレス充電対応']
      ],
      drinkware:[
        [/保温/,'保温表記あり'],
        [/保冷/,'保冷表記あり'],
        [/炭酸/,'炭酸対応表記あり']
      ],
      cooking:[
        [/食洗機対応|食器洗い乾燥機対応/,'食洗機対応表記あり'],
        [/電子レンジ対応|レンジ対応/,'電子レンジ対応表記あり'],
        [/冷凍対応/,'冷凍対応表記あり']
      ],
      laundry:[
        [/洗濯機(?:で)?洗える|洗濯機対応/,'洗濯機対応表記あり'],
        [/速乾/,'速乾タイプ']
      ]
    };
    for(const [re,label] of (byKind[kind]||[])) if(re.test(t)) add(label);
    const pack=t.match(/(?:^|[^\d,])(\d{1,3})\s*(枚|個|本|袋|組)\s*(?:セット|入り)?(?!\s*(?:突破|達成))/);
    if(pack && +pack[1]>1) add(pack[1]+pack[2]+'セット');
    const usage=primaryUsageWord(item);
    let filtered=facts.filter(x=>{
      if(usage==='網戸' && /網戸掃除向け/.test(x)) return false;
      if(usage==='抜け毛' && /抜け毛・毛取り用途/.test(x)) return false;
      if((/手袋|グローブ|ミトン/.test(t)) && /クロスタイプ/.test(x)) return false;
      return true;
    });
    return filtered.slice(0,4);
  }

  function primaryUsageWord(item){
    const t=titleOnly(item);
    if(/抜け毛|毛取り|毛とり/.test(t)) return '抜け毛';
    if(/網戸|あみ戸|アミ戸/.test(t)) return '網戸';
    if(/手袋|グローブ|ミトン/.test(t)) return '手袋';
    if(/クロス/.test(t)) return 'クロス';
    if(/モップ/.test(t)) return 'モップ';
    if(/ブラシ/.test(t)) return 'ブラシ';
    const s=titleSignals(item);
    return s.find(x=>!['マイクロファイバー','ペット'].includes(x)) || s[0] || '';
  }

  function usagePhrase(item,kind){
    const t=titleOnly(item);
    if(kind==='pet' && /抜け毛|毛取り|毛とり/.test(t)) return '抜け毛のお手入れ';
    if(kind==='cleaning' && /網戸|あみ戸|アミ戸/.test(t)) return '網戸掃除';
    if(kind==='cleaning' && /手袋|グローブ|ミトン/.test(t)) return '手袋タイプの掃除';
    if(kind==='cleaning' && /クロス/.test(t)) return 'クロスでの拭き掃除';
    if(kind==='cleaning' && /モップ/.test(t)) return 'モップでの掃除';
    if(kind==='cleaning' && /ブラシ/.test(t)) return 'ブラシでの掃除';
    const raw=primaryUsageWord(item);
    return raw||'この商品の使用';
  }

  function audienceFor(item,kind){
    const t=titleOnly(item);
    if(kind==='pet' && /抜け毛|毛取り|毛とり/.test(t)) return '犬や猫の抜け毛を手軽に取りたい人';
    if(kind==='cleaning' && /網戸|あみ戸|アミ戸/.test(t)) return '網戸の掃除を手早く済ませたい人';
    if(kind==='cleaning' && /手袋|グローブ|ミトン/.test(t)) return '手にはめて細かい場所を拭きたい人';
    if(kind==='cleaning' && /クロス/.test(t)) return 'クロスでホコリや水分を手早く拭き取りたい人';
    if(kind==='cleaning' && /モップ/.test(t)) return 'モップで気になる場所を手早く掃除したい人';
    if(kind==='cleaning' && /ブラシ/.test(t)) return 'ブラシで細かい汚れを落としたい人';
    if(kind==='storage') return '収納場所を整えて、出し入れの手間を減らしたい人';
    if(kind==='laundry') return '洗濯まわりの作業を手早く済ませたい人';
    if(kind==='cooking') return '調理の下ごしらえを手早く進めたい人';
    if(kind==='charging') return '外出中の充電切れを避けたい人';
    if(kind==='drinkware') return '飲み物を持ち歩きやすくしたい人';
    if(kind==='carry') return '持ち物をまとめて探す手間を減らしたい人';
    if(kind==='bedding') return '寝具まわりの扱いやすさを見直したい人';
    if(kind==='kids') return '子どもまわりの準備を手早く進めたい人';
    return '';
  }

  function openingFor(a,item,variant=0){
    const impact=a.impact.replace(/[。！!]+$/,'');
    const lead=usagePhrase(item,a.kind);
    const templates=[
      `${lead}を、できるだけ手早く済ませたいときに。`,
      `${lead}にかかる小さな手間を減らしたい人に。`,
      `${lead}の準備や作業を少しでも簡単にしたいときに。`,
      `${lead}を後回しにせず、こまめに済ませたい人向け。`,
      `${lead}にかかる手間が気になるなら、候補に入れやすい商品です。`,
      `${lead}をもっと手軽にしたいときにチェックしたい商品です。`,
      `${lead}を短く済ませたい場面に向いていそうです。`,
      `${lead}の動作を少し軽くしたい人に。`,
      `${lead}を手早く済ませたいときの選択肢になりそうです。`,
      `${lead}をシンプルにしたい人が検討しやすい商品です。`
    ];
    const tails=[
      `${lead}を普段の掃除や手入れに取り入れやすく、作業を始めるまでの手間を抑えやすそうです。`,
      `${lead}をこまめに行いやすく、後回しにしにくくなりそうです。`,
      `${lead}を必要な場所ですぐ始めやすく、短時間で済ませる助けになりそうです。`,
      `${lead}の動作を増やしすぎず、日々の負担を軽くする選択肢になりそうです。`,
      `${lead}を気づいたときに行いやすく、汚れや手間をため込みにくくなりそうです。`,
      `${lead}を普段の流れに組み込みやすく、作業のハードルを下げやすそうです。`,
      `${lead}の工程をシンプルにしやすく、取りかかるまでの時間を短くできそうです。`,
      `${lead}を必要なときに始めやすく、日常の小さな負担を減らす助けになりそうです。`,
      `${lead}を手早く進めやすく、別の家事に時間を回しやすくなりそうです。`,
      `${lead}を用途に合わせて進めやすく、日々の作業を軽くするきっかけになりそうです。`
    ];
    const idx=((variant%templates.length)+templates.length)%templates.length;
    return `${templates[idx]}\n${tails[idx]}`;
  }

  function shortFallback(item){
    const title=api.shortTitle ? api.shortTitle(item?.itemName||'') : titleOnly(item).slice(0,40);
    return `${title}\n価格：${fmt(item?.itemPrice||0)}円\n\n※アフィリエイト広告を利用しています`;
  }

  function hasCategoryConflict(kind,facts){
    const joined=facts.join(' ');
    if(['pet','cleaning'].includes(kind) && /急速充電|USB-C|ワイヤレス充電/.test(joined)) return true;
    if(kind==='charging' && /網戸|抜け毛|クロス|モップ/.test(joined)) return true;
    if(kind==='pet' && /収納|圧縮袋|食洗機|電子レンジ/.test(joined)) return true;
    return false;
  }

  function validateBody(item,a,text){
    if(a.confidence==='ambiguous') return false;
    if(hasCategoryConflict(a.kind,a.facts)) return false;
    const usage=primaryUsageWord(item);
    if(usage && !String(text).includes(usage)) return false;
    return true;
  }

  function finalScan(text){
    let s=String(text||'');
    for(const re of bannedOutput){
      re.lastIndex=0;
      s=s.replace(re,'');
    }
    s=s
      .replace(/治る|治します|治療する/g,'ケアをサポートする')
      .replace(/若返る|若返り/g,'年齢に応じたケアを意識しやすい')
      .replace(/痩せる|痩身効果/g,'健康的な生活を意識するきっかけになりそう')
      .replace(/病気を防ぐ|予防する/g,'日常のケアに取り入れやすそう')
      .replace(/改善する|改善します/g,'整える助けになりそう')
      .replace(/解消する|解消します/g,'負担を減らす助けになりそう');
    return s.split('\n').map(x=>x.replace(/[ \t]+/g,' ').trimEnd()).join('\n').trim();
  }

  function analyze(item){
    const cls=classify(item);
    const facts=extractFacts(item,cls.kind);
    const source=sourceText(item);
    const sensitive=isSensitiveCategory(source);
    return {
      source,
      kind:cls.kind,
      confidence:cls.confidence,
      problem:sanitizeOutput(cls.problem),
      use:sanitizeOutput(cls.use),
      impact:sanitizeOutput(cls.impact),
      audience:sanitizeOutput(audienceFor(item,cls.kind) || cls.audience),
      facts,
      sensitive
    };
  }

  function trimCopy(text,max=500){
    const s=String(text||'').trim();
    if(s.length<=max) return s;
    return s.slice(0,max-1).replace(/[、,\s]+$/,'')+'…';
  }

  function makeRoomCopy(item,keyword,options={}){
    const a=analyze(item);
    if(a.confidence==='ambiguous') return shortFallback(item);

    const title=api.shortTitle ? api.shortTitle(item?.itemName||'') : titleOnly(item).slice(0,40);
    const variant=Number.isFinite(+options.variant)?+options.variant:stableVariant(item?.itemName||'',10);
    const opening=openingFor(a,item,variant);
    const facts=a.facts.length ? '\n\n商品の特徴👇\n'+a.facts.map(x=>'✔ '+x).join('\n') : '';
    const audience='\n\nこんな人に向いていそう👇\n・'+a.audience;
    const ending='\n\n'+title+'\n価格：'+fmt(item?.itemPrice||0)+'円\n\n※アフィリエイト広告を利用しています';
    let out=trimCopy(opening+facts+audience+ending,500);
    out=finalScan(out);
    if(!validateBody(item,a,out)) return shortFallback(item);
    return out;
  }

  function makeThreadsCopy(item,keyword,options={}){
    const a=analyze(item);
    if(a.confidence==='ambiguous') return shortFallback(item);
    const title=api.shortTitle ? api.shortTitle(item?.itemName||'') : titleOnly(item).slice(0,40);
    const variant=Number.isFinite(+options.variant)?+options.variant:stableVariant(item?.itemName||'',10);
    let out=openingFor(a,item,variant);
    if(a.facts[0]) out+='\n✔ '+a.facts[0];
    out+='\n\n'+title+'\n'+fmt(item?.itemPrice||0)+'円';
    out=finalScan(trimCopy(out,360));
    return validateBody(item,a,out)?out:shortFallback(item);
  }

  function makeInstagramCopy(item,keyword,options={}){
    const a=analyze(item);
    if(a.confidence==='ambiguous') return shortFallback(item);
    const title=api.shortTitle ? api.shortTitle(item?.itemName||'') : titleOnly(item).slice(0,40);
    const variant=Number.isFinite(+options.variant)?+options.variant:stableVariant(item?.itemName||'',10);
    let out=openingFor(a,item,variant);
    if(a.facts.length) out+='\n\n'+a.facts.map(x=>'✔ '+x).join('\n');
    out+='\n\nこんな人に向いていそう👇\n'+a.audience+'\n\n'+title+'\n価格：'+fmt(item?.itemPrice||0)+'円';
    out=finalScan(trimCopy(out,500));
    return validateBody(item,a,out)?out:shortFallback(item);
  }


  api.analyzeRoomProduct=analyze;
  api.makeRoomCopy=makeRoomCopy;
  api.makeThreadsCopy=makeThreadsCopy;
  api.makeInstagramCopy=makeInstagramCopy;
})(typeof window==='undefined'?null:window);

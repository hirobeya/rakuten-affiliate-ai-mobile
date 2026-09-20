(function(root){
  'use strict';
  if(!root || !root.UrenaviPainCopy) return;

  const api=root.UrenaviPainCopy;
  const fmt=n=>new Intl.NumberFormat('ja-JP').format(+n||0);
  const norm=s=>String(s||'').normalize('NFKC').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();

  function titleText(item){
    return [item?.itemName,item?.catchcopy].filter(Boolean).map(norm).join(' ');
  }

  function detailText(item){
    return [item?.itemCaption,item?.genrePath,item?.genreName].filter(Boolean).map(norm).join(' ');
  }

  function sourceText(item){
    return [titleText(item),detailText(item)].filter(Boolean).join(' ');
  }

  function stableVariant(text,mod=5){
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

  function softenClaims(text){
    let s=String(text||'');
    const replacements=[
      [/治る|治します|治療する/g,'ケアをサポートする'],
      [/若返る|若返り/g,'年齢に応じたケアにつながる'],
      [/痩せる|痩身効果/g,'健康的な生活を意識するきっかけになる'],
      [/病気を防ぐ|予防する/g,'日常のケアに取り入れやすい'],
      [/改善する|改善します/g,'整える助けになりそう'],
      [/解消する|解消します/g,'負担を減らす助けになりそう'],
      [/絶対|必ず|確実に/g,''],
      [/No\.?s*1|ナンバーワン|一番|最高|最強/gi,'']
    ];
    for(const [re,to] of replacements) s=s.replace(re,to);
    return s.replace(/\s+/g,' ').trim();
  }

  function extractFacts(item,kind){
    // Product facts are intentionally grounded in title/catch copy first.
    // Rakuten captions can contain SEO text and related-product copy, so never
    // lift arbitrary materials/specs from the full caption.
    const primary=titleText(item);
    const facts=[];
    const add=x=>uniquePush(facts,x);

    const common=[
      [/日本製/, '日本製表記あり'],
      [/送料無料/, '送料無料表記あり'],
      [/公式/, '公式ショップ表記あり'],
      [/正規品/, '正規品表記あり']
    ];
    for(const [re,label] of common) if(re.test(primary)) add(label);

    const byKind={
      cleaning:[
        [/マイクロファイバー/, 'マイクロファイバー素材'],
        [/吸水/, '吸水タイプ'],
        [/速乾/, '速乾タイプ'],
        [/網戸/, '網戸掃除向け'],
        [/手袋|グローブ|ミトン/, '手にはめて使うタイプ']
      ],
      pet:[
        [/両面/, '両面タイプ'],
        [/グローブ|手袋/, '手にはめて使うタイプ'],
        [/抜け毛|毛取り|毛とり/, '抜け毛・毛取り用途'],
        [/猫犬兼用|犬猫兼用|猫.*犬|犬.*猫/, '犬・猫向け表記あり']
      ],
      storage:[
        [/折りたたみ|折畳/, '折りたたみ対応'],
        [/省スペース|スリム/, '省スペース設計'],
        [/ステンレス/, 'ステンレス素材']
      ],
      charging:[
        [/急速充電/, '急速充電対応'],
        [/Type-?C|USB-?C/i, 'USB-C対応'],
        [/ワイヤレス充電/, 'ワイヤレス充電対応']
      ],
      drinkware:[
        [/保温/, '保温用途に対応'],
        [/保冷/, '保冷用途に対応'],
        [/炭酸/, '炭酸対応表記あり'],
        [/ステンレス/, 'ステンレス素材']
      ],
      cooking:[
        [/食洗機対応|食器洗い乾燥機対応/, '食洗機対応表記あり'],
        [/電子レンジ対応|レンジ対応/, '電子レンジ対応表記あり'],
        [/冷凍対応/, '冷凍対応表記あり'],
        [/ステンレス/, 'ステンレス素材']
      ],
      laundry:[
        [/洗濯機(?:で)?洗える|洗濯機対応/, '洗濯機で洗える表記あり'],
        [/速乾/, '速乾タイプ']
      ]
    };
    for(const [re,label] of (byKind[kind]||[])) if(re.test(primary)) add(label);

    const pack=primary.match(/(?:^|[^\d,])(\d{1,3})\s*(枚|個|本|袋|組)\s*(?:セット|入り)?(?!\s*(?:突破|達成))/);
    if(pack && +pack[1] > 1) add(pack[1]+pack[2]+'セット');

    const capacity=primary.match(/(?:容量|内容量)?\s*(\d+(?:\.\d+)?)\s*(mL|ml|L|リットル)\b/i);
    if(capacity && ['drinkware','cooking'].includes(kind)) add((capacity[1]+capacity[2]).replace('ml','mL'));

    const battery=primary.match(/(\d{4,6})\s*mAh/i);
    if(battery && kind==='charging') add(battery[1]+'mAh容量');

    return facts.slice(0,4);
  }

  function classify(item,keyword){
    const title=titleText(item);
    const detail=detailText(item);
    const q=norm(keyword);

    // Title wins. A word buried in a merchant caption must never redefine the product.
    const rules=[
      {re:/ペット|猫|犬|グルーミング|抜け毛|毛取り|毛とり/,kind:'pet',problem:'服やソファに付くペットの抜け毛を、毎回細かく取るのは手間がかかる',use:'手にはめて毛を集めたり、お手入れしやすくする',impact:'抜け毛のお手入れを日常の流れで済ませやすくなりそう',audience:'犬や猫の抜け毛ケアを手軽にしたい人'},
      {re:/掃除|清掃|クリーナー|モップ|ワイパー|ブラシ|クロス|ダスター|ほこり|ホコリ|網戸/,kind:'cleaning',problem:'気になる汚れを見つけても、掃除道具を準備するのが面倒で後回しになりがち',use:'気になる場所をその場で手入れしやすくする',impact:'汚れをため込む前に対処しやすくなり、掃除の負担を軽くする助けになりそう',audience:'掃除を大仕事にせず、こまめに済ませたい人'},
      {re:/収納|ラック|ケース|ボックス|クローゼット|ワゴン|整理|圧縮袋/,kind:'storage',problem:'物の置き場所が決まらず、片づけてもまた散らかる',use:'物の定位置を作って、出し入れしやすくする',impact:'探す・片づけ直す手間を減らし、空間を整えやすくなりそう',audience:'収納場所を整えて、片づけの手間を減らしたい人'},
      {re:/洗濯|ランドリー|物干し|ハンガー|洗濯ネット/,kind:'laundry',problem:'洗う・干す・しまうまでの細かな作業が積み重なって時間を取られる',use:'洗濯まわりの作業を整理しやすくする',impact:'毎日の洗濯動線を短くし、家事時間を減らす助けになりそう',audience:'洗濯の手間を少しでも減らしたい人'},
      {re:/ピーラー|スライサー|包丁|チョッパー|みじん切り|調理器|フライパン|鍋|キッチン/,kind:'cooking',problem:'下ごしらえや調理の細かな作業に意外と時間がかかる',use:'調理工程の一部を手早く進めやすくする',impact:'料理の準備や後片づけにかかる手間を減らし、忙しい日でも取りかかりやすくなりそう',audience:'毎日の調理を少しでも手早く進めたい人'},
      {re:/モバイルバッテリー|充電器|充電|USB|Type-?C|Lightning/i,kind:'charging',problem:'使いたいときにスマホや機器の電池残量が足りないと困る',use:'必要な場所で充電しやすくする',impact:'充電切れを気にする場面を減らし、外出先でも機器を使いやすくする助けになりそう',audience:'外出中の充電切れが気になる人'},
      {re:/水筒|タンブラー|ボトル|マグ/,kind:'drinkware',problem:'外出先でも飲み物を持ち歩きたいが、温度や持ち運びやすさも気になる',use:'飲み物を持ち歩きやすくする',impact:'外出先で飲み物を用意する手間を減らし、好きなタイミングで飲みやすくなりそう',audience:'通勤・通学や外出用の飲み物を持ち歩きたい人'},
      {re:/バッグ|ポーチ|サコッシュ|リュック|ショルダー|財布/,kind:'carry',problem:'出先で必要な物がすぐ見つからないと、小さなストレスになる',use:'持ち物をまとめて持ち歩きやすくする',impact:'必要な小物を探す手間を減らし、移動を身軽にする助けになりそう',audience:'持ち物を整理して持ち歩きたい人'},
      {re:/寝具|布団|枕|マットレス|シーツ/,kind:'bedding',problem:'毎日使う寝具だからこそ、扱いやすさや寝る環境を整えたい',use:'寝室や就寝まわりの環境を整えやすくする',impact:'就寝前後の小さな手間を減らし、休む時間を整える助けになりそう',audience:'寝具まわりの使い勝手を見直したい人'},
      {re:/ベビー|赤ちゃん|キッズ|子供|子ども/,kind:'kids',problem:'子どもまわりの準備や片づけは、毎日のことだと負担になりやすい',use:'育児まわりの準備や管理をしやすくする',impact:'日々の細かな手間を減らし、準備を進めやすくする助けになりそう',audience:'育児や子どもの準備を少しでもラクにしたい人'}
    ];
    for(const r of rules) if(r.re.test(title)) return r;

    // Only if the title is truly ambiguous may genre/caption help.
    for(const r of rules) if(r.re.test(detail)) return r;

    const ctx=api.painContext?.(item?.itemName||'',q,item?.itemCaption||'',item?.genrePath||item?.genreName||'')||{};
    return {
      kind:'general',
      problem:norm(ctx.hook||'商品を選ぶとき、買ったあとに自分の生活で本当に使うか迷う'),
      use:norm(ctx.bridge||'商品説明にある特徴を、実際に使う場面と照らし合わせて選びやすくする'),
      impact:norm(ctx.benefit||'自分の使い方に合うか考える材料になりそう'),
      audience:norm(ctx.audience||'商品情報を確認して、自分に合うものを選びたい人')
    };
  }

  function makeOpening(analysis,item){
    const {problem,use,impact,audience}=analysis;
    switch(stableVariant(item?.itemName||'',5)){
      case 0: return problem+'。\n'+use+'商品なら、'+impact+'。';
      case 1: return '毎日の中で意外と気になるのが、'+problem.replace(/[。！!]+$/,'')+'こと。\n'+use+'ことで、'+impact+'。';
      case 2: return audience+'なら、気になるのは「買ったあと本当に使いやすいか」。\n'+use+'ので、'+impact+'。';
      case 3: return '少しの手間でも、毎日続くと負担になるもの。\nこの商品は'+use+'タイプで、'+impact+'。';
      default: return '「'+problem.replace(/[。！!]+$/,'')+'」と感じる場面に。\n'+use+'ので、'+impact+'。';
    }
  }

  function cleanSentence(text){
    return softenClaims(norm(text))
      .replace(/。。+/g,'。')
      .replace(/、、+/g,'、')
      .replace(/。\s*。/g,'。');
  }

  function analyze(item,keyword){
    const source=sourceText(item);
    const cls=classify(item,keyword);
    const facts=extractFacts(item,cls.kind);
    const sensitive=isSensitiveCategory(source);

    let problem=cleanSentence(cls.problem);
    let use=cleanSentence(cls.use);
    let impact=cleanSentence(cls.impact);
    let audience=cleanSentence(cls.audience);

    if(sensitive){
      impact=impact
        .replace(/効果|効能|治療|改善/g,'ケア')
        .replace(/なる。?$/,'なりそう。');
    }

    if(!/[〜~]?そう|助け|期待|つながり|しやす/.test(impact)){
      impact=impact.replace(/[。]+$/,'')+'助けになりそう';
    }

    return {source,kind:cls.kind,problem,use,impact,audience,facts,sensitive};
  }

  function trimCopy(text,max=500){
    const s=String(text||'').trim();
    if(s.length<=max) return s;
    return s.slice(0,max-1).replace(/[、,\s]+$/,'')+'…';
  }

  function makeRoomCopy(item,keyword){
    const a=analyze(item,keyword);
    const title=api.shortTitle ? api.shortTitle(item?.itemName||'') : norm(item?.itemName||'').slice(0,40);
    const price=+item?.itemPrice||0;
    const reviewCount=+item?.reviewCount||0;
    const reviewAverage=+item?.reviewAverage||0;

    const opening=makeOpening(a,item);
    const facts=a.facts.length
      ? '\n\n商品の特徴👇\n'+a.facts.slice(0,3).map(x=>'✔ '+x).join('\n')
      : '';
    const audience='\n\nこんな人に向いていそう👇\n・'+a.audience;
    const review=reviewCount>=10 ? '\nレビュー：★'+reviewAverage.toFixed(1)+'（'+fmt(reviewCount)+'件）' : '';
    const ending='\n\n'+title+'\n価格：'+fmt(price)+'円'+review;

    return trimCopy(opening+facts+audience+ending,500);
  }

  function makeThreadsCopy(item,keyword){
    const a=analyze(item,keyword);
    const title=api.shortTitle ? api.shortTitle(item?.itemName||'') : norm(item?.itemName||'').slice(0,40);
    const fact=a.facts[0] ? '\n✔ '+a.facts[0] : '';
    return trimCopy(makeOpening(a,item)+fact+'\n\n'+title+'\n'+fmt(item?.itemPrice||0)+'円',360);
  }

  function makeInstagramCopy(item,keyword){
    const a=analyze(item,keyword);
    const title=api.shortTitle ? api.shortTitle(item?.itemName||'') : norm(item?.itemName||'').slice(0,40);
    const facts=a.facts.slice(0,3).map(x=>'✔ '+x).join('\n');
    return trimCopy(makeOpening(a,item)+(facts?'\n\n'+facts:'')+'\n\nこんな人に向いていそう👇\n'+a.audience+'\n\n'+title+'\n価格：'+fmt(item?.itemPrice||0)+'円',500);
  }

  api.analyzeRoomProduct=analyze;
  api.makeRoomCopy=makeRoomCopy;
  api.makeThreadsCopy=makeThreadsCopy;
  api.makeInstagramCopy=makeInstagramCopy;
})(typeof window==='undefined'?null:window);

(function(root){
  'use strict';
  if(!root || !root.UrenaviPainCopy) return;
  const api=root.UrenaviPainCopy;
  const originalPainContext=api.painContext;


  function eggContext(name){
    const t=String(name||'');
    const quail=/うずら|ウズラ|鶉/.test(t);
    const cracker=/卵割り|たまご割り|玉子割り|卵カッター|エッグカッター|エッグシェル/.test(t);
    if(!quail && !cracker) return null;
    return {
      hook:quail?'うずら卵って、小さいぶん割りにくい。殻が欠けたり中身を崩したりするのが地味にストレス…':'卵を割るたびに殻が入ったり、手が汚れたり。毎日の小さな手間を減らしたい。',
      bridge:quail?'うずら卵を何個も使う料理やお弁当づくりで、毎回の「割りにくい」を減らしたい人向け。専用の卵割り器なら、下ごしらえをもっとスムーズに進めやすい。':'卵を割る作業そのものを手早く済ませたい人向けの調理アイテム。',
      points:[
        quail?'うずら卵を何個も割るときの手間を減らしたい':'卵を割る作業を手早く済ませたい',
        quail?'殻や中身を崩しにくく、見た目もきれいに仕上げたい':'殻が入りにくいよう丁寧に割りたい',
        '下ごしらえの小さなストレスを減らしたい'
      ],
      benefit:quail?'うずら卵の「割りにくい」を減らして下ごしらえをラクに':'卵を割る手間を減らして下ごしらえをラクに',
      audience:quail?'うずら卵をよく使う料理・お弁当づくりの人':'卵料理の下ごしらえをラクにしたい人'
    };
  }


  function sharpCategoryContext(name,description){
    const t=String(name||'');
    const d=String(description||'');
    const s=t+' '+d;

    if(/ピーラー|皮むき|千切り|スライサー|みじん切り|チョッパー|おろし器|おろし金/.test(t)) return {
      hook:'包丁で細かく切る、皮をむく、千切りにする。毎日の下ごしらえって地味に時間を取られる…',
      bridge:'「切る・むく・刻む」を少しでも早く終わらせて、料理そのものに時間を使いたい人向け。',
      points:['野菜の下ごしらえを時短したい','同じ切り方を何度も繰り返す手間を減らしたい','平日の料理を少しでもラクにしたい'],
      benefit:'面倒な下ごしらえを短時間で済ませやすい',
      audience:'毎日の料理で下ごしらえを時短したい人'
    };

    if(/モバイルバッテリー|充電器|USB充電|急速充電|ワイヤレス充電/.test(t)) return {
      hook:'外出先で「あと少しで充電切れ」。あの不安、できれば持ち歩きたくない…',
      bridge:/モバイルバッテリー/.test(t)?'スマホの電池残量を気にせず動きたい人のための持ち歩き充電アイテム。':'充電待ちの時間を減らして、必要なときにサッと使いたい人向け。',
      points:['外出先の充電切れを避けたい','充電の待ち時間を減らしたい','持ち歩きやすさと使いやすさを両立したい'],
      benefit:'「充電が足りない」を気にする時間を減らせる',
      audience:'外出先でもスマホの充電を切らしたくない人'
    };

    if(/収納ボックス|収納ケース|収納ラック|ワゴン|クローゼット|衣類収納|隙間収納|すき間収納/.test(t)) return {
      hook:'片付けてもすぐ散らかる。原因は「物が多い」より、戻す場所が決まってないことかも…',
      bridge:'出しっぱなしを減らして、「使う→戻す」がラクになる収納を作りたい人向け。',
      points:['散らかりやすい物の定位置を作りたい','出し入れしやすく片付けたい','限られたスペースを無駄なく使いたい'],
      benefit:'片付けを頑張るより、散らかりにくい仕組みに変えやすい',
      audience:'片付けてもすぐ散らかるのを何とかしたい人'
    };

    if(/水切りラック|水切りかご|食器乾燥|シンクラック/.test(t)) return {
      hook:'洗い物が終わっても、シンクまわりが食器でいっぱい。片付いた感じがしない…',
      bridge:'洗った食器の置き場を整えて、キッチンのごちゃつきを減らしたい人向け。',
      points:['洗い物後の置き場所をすっきりさせたい','シンクまわりを広く使いたい','乾かす→片付ける流れをラクにしたい'],
      benefit:'洗い物のあとまで含めて、キッチンをすっきり保ちやすい',
      audience:'洗い物後のシンクまわりをすっきりさせたい人'
    };

    if(/洗濯ネット|ランドリーネット/.test(t)) return {
      hook:'洗濯機にそのまま入れて、型崩れ・からまり・毛羽立ちが気になる…',
      bridge:'お気に入りの服をできるだけ傷めず、毎日の洗濯を気楽に続けたい人向け。',
      points:['衣類のからまりや型崩れを減らしたい','デリケートな服を分けて洗いたい','洗濯後の扱いを少しラクにしたい'],
      benefit:'洗濯ダメージを抑えながら仕分けもラクにしやすい',
      audience:'お気に入りの服をできるだけ傷めず洗いたい人'
    };

    if(/枕|まくら|マットレス|敷布団|掛け布団|抱き枕/.test(t)) return {
      hook:'寝たはずなのに、朝起きてもスッキリしない。寝具が合っているか気になる…',
      bridge:'毎日長く使うものだからこそ、寝心地を見直して休む時間の質を上げたい人向け。',
      points:['今の寝心地を見直したい','毎日の休息時間をもっと快適にしたい','自分に合う寝具を比較して選びたい'],
      benefit:'毎日使う寝具から、休む時間を見直せる',
      audience:'朝の寝起きや寝心地を見直したい人'
    };

    if(/バッグ|ショルダーバッグ|ボディバッグ|ウエストバッグ|ポーチ|サコッシュ/.test(t)) return {
      hook:'スマホ、財布、鍵。必要な物は少ないのに、ポケットだけだとゴチャつく…',
      bridge:'必要な小物だけをまとめて、身軽に出かけたい人向け。',
      points:['スマホや財布をひとまとめにしたい','両手を空けて動きたい','大きすぎないバッグを選びたい'],
      benefit:'必要な物だけ持って、身軽に動きやすい',
      audience:'スマホ・財布・鍵を身軽に持ち歩きたい人'
    };

    if(/ヘアアイロン|ドライヤー|ヘアブラシ|くし|コーム/.test(t)) return {
      hook:'朝の髪、できれば時間をかけたくない。でもボサボサのまま出るのも嫌…',
      bridge:'身支度の時間を短くしながら、髪を整えやすくしたい人向け。',
      points:['朝のヘアセットを時短したい','扱いやすい髪に整えたい','毎日使いやすいものを選びたい'],
      benefit:'朝の「髪が決まらない」時間を減らしやすい',
      audience:'朝のヘアセットを少しでも時短したい人'
    };

    if(/ペットシーツ|猫砂|犬用|猫用|ペット用|給水器|自動給餌/.test(t)) return {
      hook:'毎日のペットのお世話、好きだからこそ「ちょっとした手間」は減らしたい…',
      bridge:'ごはん・水・トイレまわりのルーティンを少しラクにしたい飼い主さん向け。',
      points:['毎日のお世話を少しラクにしたい','掃除や補充の手間を減らしたい','ペットも人も使いやすい物を選びたい'],
      benefit:'毎日繰り返すお世話の小さな負担を減らしやすい',
      audience:'ペットのお世話を少しでもラクにしたい人'
    };

    if(/弁当箱|ランチボックス|保存容器|タッパー|フードコンテナ/.test(t)) return {
      hook:'作ったあとの「詰める・保存する・持っていく」まで考えると、料理って意外と手間が多い…',
      bridge:'作り置きやお弁当を、保存から持ち運びまでスムーズにしたい人向け。',
      points:['作り置きを管理しやすくしたい','お弁当準備を手早く済ませたい','冷蔵庫の中もすっきり整理したい'],
      benefit:'作るだけで終わらない「保存・持ち運び」の手間を減らしやすい',
      audience:'作り置きやお弁当準備をラクにしたい人'
    };

    if(/傘|レインコート|レインウェア|撥水/.test(t)) return {
      hook:'急な雨で服や荷物が濡れると、そのあと一日ずっとテンションが下がる…',
      bridge:'雨の日でもできるだけ濡れずに、移動のストレスを減らしたい人向け。',
      points:['急な雨に備えたい','通勤・通学の濡れストレスを減らしたい','持ち歩きやすさも重視したい'],
      benefit:'雨の日の「濡れる・持て余す」を減らしやすい',
      audience:'雨の日の移動ストレスを減らしたい人'
    };

    if(d && /時短|簡単|便利|ラク|らく|手軽/.test(d)){
      return {
        hook:'毎日のちょっとした作業、「これ毎回やるの面倒やな」と感じる瞬間を減らしたい…',
        bridge:'商品説明でも時短・手軽さが打ち出されている、日常の小さな手間を減らしたい人向けのアイテム。',
        points:['毎日の作業を少しでもラクにしたい','面倒な手順を減らしたい','無理なく使い続けられる物を選びたい'],
        benefit:'毎日の小さな手間を減らすきっかけにしやすい',
        audience:'日常の小さな面倒を減らしたい人'
      };
    }
    return null;
  }

  function microwaveContext(name){
    const t=String(name||'');
    const steam=/蒸し|蒸す|蒸し器/.test(t);
    const grill=/焼き目|焼く|焼き魚/.test(t);
    return {
      hook:'料理はしたい。でも時間も洗い物も増やしたくない…',
      bridge:'電子レンジで手軽に調理して、忙しい日のごはん作りをラクにしたい人に。',
      points:[
        '調理時間を短くしたい',
        '火を使う手間を減らしたい',
        steam?'蒸し料理も手軽に作りたい':grill?'焼き料理もレンジで手軽に作りたい':'洗い物を少なくしたい'
      ],
      benefit:steam?'レンジで蒸し料理まで手軽に作りたい人にぴったり':grill?'焼き料理をレンジで手軽に作りたい人にぴったり':'調理の手間と時間を減らしたい人にぴったり',
      audience:'忙しい日に電子レンジ調理で時短したい人'
    };
  }

  function cleaningContext(name){
    const t=String(name||'');
    const sign=/室名プレート|ネームプレート|ピクトサイン|サインプレート|看板|標識/.test(t);
    const storage=/スタンド|用具入れ|収納|ホルダー|置き場/.test(t);

    if(sign){
      return {
        hook:'掃除道具の置き場所、ひと目で分かるようにしておきたい。',
        bridge:'共用スペースや職場で、掃除用具の場所を分かりやすく表示したい人向け。',
        points:['掃除用具の場所を分かりやすくしたい','表示をすっきり整えたい','室名や用途を見やすく示したい'],
        benefit:'掃除用具の置き場所を分かりやすく表示したい人にぴったり',
        audience:'掃除用具の置き場所を分かりやすくしたい人'
      };
    }

    if(storage){
      return {
        hook:'掃除道具が出しっぱなしだと、生活感も出るし片付けも面倒…',
        bridge:'ワイパーや掃除道具をひとまとめにして、必要なときにサッと使えるようにしたい人に。',
        points:['掃除道具をすっきりまとめたい','出し入れしやすくしたい','限られたスペースを有効に使いたい'],
        benefit:'掃除道具をまとめて使いやすく収納したい人にぴったり',
        audience:'掃除道具をすっきりまとめて収納したい人'
      };
    }

    return {
      hook:'毎日の掃除、できればもっと短時間で終わらせたい…',
      bridge:'気づいたときにサッと使えて、掃除を後回しにしにくいアイテム。',
      points:['掃除時間を短くしたい','準備や片付けが少ないものがいい','こまめに使いやすいものを探している'],
      benefit:'掃除時間を短くしたい人にぴったり',
      audience:'掃除を短時間で済ませたい人'
    };
  }

  api.painContext=function(name,keyword,description){
    const item=String(name||'');
    const q=String(keyword||'');
    const desc=String(description||'');

    if(/攻略本|書籍|絵本|図鑑|コミック|文庫|お金の大学/.test(item)) return {
      hook:'次に読みたい一冊、内容やレビューを見比べて選びたい。',
      bridge:'テーマや目次、版の違いを確認して、自分に合う一冊を探している人に。',
      points:['読みたいテーマに合うか確認したい','内容やレビューを比べて選びたい','版や付属特典も確認したい'],
      benefit:'内容を確かめて本を選びたい人の候補に',
      audience:'内容やレビューを確認して本を選びたい人'
    };
    if(/ゼルダ|ポケットモンスター|ゲームソフト|Nintendo|ニンテンドー|PlayStation|PS5|Switch/i.test(item)) return {
      hook:'次に遊ぶゲーム、作品や対応機種を確かめて選びたい。',
      bridge:'気になる作品の内容や対応機種、通常版と特典版の違いを確認したい人に。',
      points:['遊びたい作品を探している','対応機種を確かめたい','通常版と特典版を比較したい'],
      benefit:'作品・対応機種・特典を比べて選びたい人の候補に',
      audience:'作品や対応機種を確認してゲームを選びたい人'
    };

    const microwaveStorage=/レンジ台|レンジラック|レンジボード|収納棚|キッチン棚|キッチンラック/.test(item);
    const microwaveItem=!microwaveStorage && /電子レンジ調理|レンジ調理器|レンジクッカー|レンジパン|レンジポット|レンジメート|ムテキレンジ|レンジで(?:調理|蒸|焼)|蒸し器/.test(item);
    const microwaveQuery=/レンジ調理|電子レンジ|レンジクッカー/.test(q);
    const egg=eggContext(item);
    if(egg) return egg;
    const sharp=sharpCategoryContext(item,desc);
    if(sharp) return sharp;
    if(microwaveItem || (microwaveQuery && !microwaveStorage && /レンジ(?:調理|クッカー|パン|ポット|メート)|電子レンジ調理/.test(item))) return microwaveContext(item);

    const cleaningQuery=/掃除|掃除用品|掃除用具|クリーナー|モップ|ワイパー|ホコリ|ほこり|ダスター/.test(q);
    const cleaningItem=/掃除|掃除用品|掃除用具|クリーナー|モップ|ワイパー|ホコリ|ほこり|ダスター/.test(item);
    if(cleaningItem || (cleaningQuery && cleaningItem)) return cleaningContext(item);

    // Use the product title as the source of truth. Search terms are hints only and
    // must not assign a use that is absent from the actual product name.
    return originalPainContext(name,'');
  };

  // Direct ROOM search is redundant. Keep the verified posting route:
  // Urenavi -> Rakuten Market product page -> ROOM icon -> ROOM posting screen.
  const style=root.document.createElement('style');
  style.textContent='.roomLink{display:none!important}';
  root.document.head.appendChild(style);
})(typeof window==='undefined'?null:window);

// stable-production-redeploy

# 隔離Preview構築結果

## 1. HEAD
開始: 996a9be22074f7a07789764a2bacbdbe101d8d63（clean）。
ローカル実装コミット: a246e42946d173f3edba5732f469f2eddd6c5226。
最終ローカルHEADはこの報告コミットのSHAを最終回答に記載。

## 2. 変更
- lib/urenavi-core/calibration-runner.js / isolated-transport.js: 永続保存hookの完了をawaitし、HTTP台帳保存にも同じhookを渡す。既存オフライン動作は維持。
- lib/urenavi-core/live-calibration.js: 隔離Previewでだけローカル鏡を/tmpへ置く。永続性は/tmpではなくPrivate Blobで確保する構成。
- scripts/rebuild/preview/: 独立package/lock、専用vercel.json、説明index、calibration API、Private Blob保存adapter。
- vercel.json: 対象branchの通常アプリ自動デプロイだけ無効化。main=trueは維持。
- tests/rebuild/preview-calibration.test.js: 隔離・起動禁止・永続保存境界の7件。
- 今回の新規証拠ディレクトリのみ追記。過去証拠と原文/schema/medium/通常3000/凍結wireは保護。

## 3. branch公開とPreview
通常git pushはGitHub credential不在で失敗。認証済みGitHub connectorで既存ローカルtreeを同じbranchへ公開した。元のローカル履歴をreset/削除せず保持。
公開commit: 9b27900c38156a94b8b1257113bf901d313c0276。
公開treeとローカルa246e42のtreeは00fbed791c02a9b23522922126cd4836c57f7ef3で完全一致。コミットのmetadata/履歴まで同一とは報告しない。branch refの実値もgit ls-remoteで確認。
API target=previewは400で拒否され、APIが明示した非Production値stagingで修正。これはPreview用deploymentであり、実runtimeでもVERCEL_ENV=previewを必須とするhandlerが正常応答した。
deployment: dpl_7kUeYSDm2SXEDnkqxTy3LocY6RSu / READY。
URL: https://rakuten-affiliate-ai-mobile-rk4ub6uac-hirobeya-6572.vercel.app
個別root: scripts/rebuild/preview。既存app/DB/決済API/cronは含めない。認証済みブラウザーで/api/accessが404であることも確認。
証拠文書を追加した最終ローカルcommitは、このdeploymentのsourceとは区別する。

## 4. Groq認証の環境内接続
認証済みブラウザーで/api/calibrationを直接確認:
groqCredentialPresent=true / storageConnected=false / inferenceEnabled=false / publication=false。
wireHashは351242d9c86b14994760b18621496db1f195f9d1f657db6317bb40f3062648b4、出力1000、maxRequests=1。
既存Previewのキーが環境内に渡ったことは確認できた。値を取得/表示せず、Workへ取り出していない。API推論認証の成功は、実通信禁止のため未確認。

## 5. 公開範囲と一回制御
既存Vercel Authenticationが有効。匿名GETは302でvercel.comへリダイレクト。share/bypass linkを作成していない。
今回LIVE arming変数もexecution secretも作成していないため、認証済みcallerも推論を起動できない。request bodyの許可情報ではarmingを上書きできない。
将来実行時は別明示承認、専用secret、確認済みsnapshot、全caller停止の根拠が必要。global durable claimは固定wireでcreate-only、削除/期限切れ再開なし。両台帳はprivate、conditional overwrite/uncached read-back後にのみローカルへ鏡を保存。
429/timeout/usage不明/予約超過/保存失敗/台帳不一致でhold、正常も一回hold。ROOM文章は公開しない。

## 6. 未完了の環境条件
Private Blob作成はVercel connectorが403(forbidden: permission to create the blob)を返し、storeは作成されなかった。CLIなし。既存projectからのUI作成はProduction/Previewへ自動接続する表示だったため実行しなかった。
このため実Private Blobの永続性・競合・再起動時holdはまだ実検証できていない。オフライン試験を実環境合格とは扱わない。
次の具体的な構築操作は、権限不足を明示したうえでユーザー承認を得て、認証済みブラウザーでproject未接続のPrivate Blobを作成し、Productionを除外して隔離Preview用に接続すること。連携403後の別経路作成は無断で行わない。
接続後にstorage-only probeを別namespaceで同時実行し、勝者一件・競合一件、uncached read-back、次instanceからの重複拒否を確認する。Groqを呼ぶprobeは使わない。

ITPM/OTPM、直前共有枠/reset、他caller停止、未解決通信/予約、他hostを含む同wire未送信確認も実測開始前に必要。これらは今回構築の成功で自動的に解消したとはしない。

## 7. テスト
新版236 + 既存回帰454 = 690成功。失敗0、skip0。通信guard下で実行。
実環境ではREADY、Groq credential存在、推論無効、匿名保護、既存認証route不在を確認。実Blob・実Groqの成功は未確認。

## 8. 既存環境への影響と復旧
mainは前後とも3fb18811de413448384317f2beead78cd29a2ae3。
Production主URL rakuten-affiliate-ai-mobile.vercel.app は従来のdpl_AVuWnmKJnhMWYoFaPFtyon92yQCrのまま。
**ただし、Preview作成時にVercelが共通team alias rakuten-affiliate-ai-mobile-hirobeya-6572.vercel.app をPreviewへ自動割当した。これを検出し、元のProduction deploymentへ戻して再照会で復旧を確認した。** この間の利用影響は計測していないため「影響0」とは断言しない。
project設定updatedAtは前後1792487313734で不変。既存Groqキー・Production環境変数・DB/RLS・決済・アプリ認証設定は変更なし。PR作成/mergeなし。
実Groq推論0、DB接続0。

## 9. 次の操作
1. Private Blobのブラウザー経由作成・Preview接続の承認。
2. storage-only実検証で永続台帳と排他を確認。必要ならPreviewだけ再deploy。
3. 共有枠・他caller停止等を確定。
4. 別途、初回推論一回の明示承認後にだけarmingを有効化。通常3000/品質評価へ自動移行しない。

現在の判定: Previewデプロイと環境内Groq credential接続は成立。永続ストレージ未接続のため、実測環境の準備完了ではない。実通信開始不可を維持。

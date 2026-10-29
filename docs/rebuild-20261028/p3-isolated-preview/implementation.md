# 初回校正・隔離Preview構成

開始HEAD: 996a9be22074f7a07789764a2bacbdbe101d8d63
Branch: rebuild/urenavi-core-20261028。開始時clean。

## 専用デプロイ

Vercelの既存projectを使い、deployment個別のRoot Directoryをscripts/rebuild/previewに指定する。Productionのproject設定は変更しない。既存PreviewスコープのGROQ_API_KEYをVercel内部で利用する。キーの値は取得しない。
このrootにはapi/calibration.jsと説明用indexだけを置く。既存アプリ、DB、ログイン、決済、通常生成のAPIやcronはデプロイしない。
root vercel.jsonにはこのbranchだけdeploymentEnabled=falseを追加し、pushから通常アプリの自動Previewが発生するのを防ぐ。main=trueは維持。APIから専用rootを明示したPreviewだけ作成する。
Vercel Authenticationは既存projectで有効(all_except_custom_domains)であり変更しない。公開share linkは作成しない。

## 今回の送信禁止

GETはruntimeの環境種別、固定wire、認証情報/ストレージ設定の有無だけを返す。秘密値・本文は返さない。
POST executeはURENAVI_CALIBRATION_LIVE=approved-one-callと専用execution secretの両方が必要。今回はいずれも作成しない。query/bodyからの上書き不可。production/別branch/隔離markerなしも拒否。
将来の実行には別の明示承認、非秘密snapshot、全caller停止と共有枠確認が必要。今回Groqへの疎通試験・推論・Playground代替送信は行わない。

## 永続台帳

/tmpは永続台帳としない。Private Blobの固定wire namespaceでcreate-onlyのglobal claimを取得し、削除・期限切れ解放をしない。別instance/redeployから同じ実験を繰り返せない。
既存runner/admission/isolated-transportを再利用。保存hookをawait可能にし、capacity/HTTP台帳をBlobへ保存、uncached read-backとhash/etagを確認してからローカル鏡へ保存する。2回目以降のsnapshot保存はifMatchで競合を拒否する。Groq送信前に両journalが永続化される。
この永続claimは校正Preview間の排他であり、既存Production等のGroq消費を自動管理しない。既存callerの停止・未解決通信解消は引き続き必須。
storage-probeは別namespaceだけに書き、Groqを呼ばずcreate-only競合とread-backを確認する。

## ストレージ接続の障害

既存env metadataにBlob接続はない。Vercel connectorでPrivate Blob作成を試したところ403(forbidden: permission to create the blob)となり、作成されなかった。CLIは利用できない。UI作成画面は既存projectへのProduction/Preview自動接続を表示したため作成せず閉じた。
既存Productionの設定を変える方法や、連携権限不足を無断で別経路から回避する方法は実施しない。
Private Blobをproject未接続で作成し、その後このPreview branchのみに接続する操作が必要。連携403後のブラウザ経由の作成にはユーザー承認が必要。

## 検証

通信遮断下: 新版236 + 回帰454 = 690成功、失敗0、skip0。
新規7件はPreview隔離、投稿許可だけで起動不能、secret/facts必須、global claim競合、etag不一致/保存read-back失敗、Groqなしのstorage probe、専用routeのみの構成を確認。
実Private Blobの競合検証は接続未完了のため未実施。合成テストを実永続性の合格にはしない。
固定原文/schema/medium/1000wire、通常3000、外部契約・拒否条件は維持。

## 参照した公式仕様

- https://vercel.com/docs/vercel-blob/using-blob-sdk : private access、create-only put、ifMatch、useCache=false、OIDC/store接続。
- https://vercel.com/docs/deployments : Preview deployment。

実際のpush/deployment結果、接続boolean、Production保全はdeployment-results.jsonと最終報告へ追記する。

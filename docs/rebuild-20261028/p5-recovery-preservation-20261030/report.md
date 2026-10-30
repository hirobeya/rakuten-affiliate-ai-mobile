# 復旧成果保全・検証範囲補完・実検索接続準備

2026-10-30 JST。

## 保全

開始ローカルHEAD b2a215bc91ddcb3a58c8059b189568fafa507a24、clean。元rebuildブランチは変更せず、recovery/urenavi-core-20261030を新設した。

通常git pushは書込み認証がなく `could not read Username for https://github.com` で失敗。秘密値を取得せず、承認済みGitHub connectorで安全な代替保全を実施した。

GitHub tree SHA d3efd3fb316f4612299e6f4bd083319cb81a60b5はb2a215bのsource treeと完全一致。さらに検証済みGit bundleを同じ保全ブランチへ保存した。これにより元のb2a215bコミットは公開済み945359cを前提に復元できる。

最初のGitHub保全HEAD a0ba347b3da0c445bb2e5403a94a3e3e44479242。元b2a215bはローカルbranch recovery/urenavi-core-20261030-local-b2a215bとGit bundleに保持し、a0ba347をfetchして同名recoveryブランチへcheckoutし、ローカルHEADと一致を確認した。履歴をreset/rebase/force pushしていない。connector作成コミットのためSHAはb2a215bと異なる。この報告後の最終保全SHAは最終回答へ記載する。

push対象変更ファイルでGroq/Stripe/GitHub token、private-key、Bearer JWTパターンを検査し、検出なし。未追跡の秘密ファイルの混入なし。実認証値・envファイルは保存しない。bundleはb2a215bの差分履歴だけで、元のGitHub公開945359cを前提とする。

## 不足した検証の特定と補完

以前723＝262中核＋461既存。復旧694＝240中核＋454既存。失われたローカル専用テストの原本は完全回収できず、「29件のテストを足す」方式は採用しない。

以前の実装・報告・残るテストを照合し、以下の境界を補完した。複数の入力変種を一つのテスト内で照合しており件数の一致を目指していない。

| 境界 | 補完/既存の証拠 |
| --- | --- |
| bridge採用 | owner、Preview/owner権限、商品4欄hash、key、version、conditions、ready、本文改変、品質6軸各failを拒否。完成hitは0通信 |
| registry | 重複・未完成拒否、入力/返却値のclone、別owner/old version miss |
| readonly API | 未設定503/miss404/不正409/無認可403、provider/quota実行0 |
| コピー→準備 | 既存appの実カードhandlerをVM実行。ROOMのコピー成功後だけprepared、拒否・blockedで登録しない、ThreadsはROOM準備へ混入しない |
| 非同期/原文 | 既存requestAiRoomをVM実行し、原文値保持、欠落送信0、商品切替・generation変更後の遅延応答破棄、202/429/503でready化しない |
| source/writer | 復旧済みintegrationで実検索handler→raw保存→審査済artifact保存→API読取り。商品不一致/miss/別owner/改変/保存不明拒否、同時更新1成功・1拒否 |
| batch/復帰/台帳 | 既存room-copy-batch-state、source-binding、durable-search-restore、RoomOutcomes、校正台帳/transportのテストを維持 |

最終ローカル検証：中核243＋既存461＝704成功、fail0/skip0。新たな回帰なし。ただし消失した全テスト原本が揃わないため、以前723件と完全同一の網羅性を保証したとは扱わない。

## 実運用接続の追加実装

lib/urenavi-core/operational-preview-runtime.js を追加。

- 既存検索API、server認可、原文/完成artifact writer、認可付きprivate cache readerを一つのserver compositionに接続。
- approvedUserIdをserver側で明示指定しなければ起動拒否。認可されたAuth IDが完全一致する本人1名だけ検索/読取り可能。クライアント指定IDやemailだけのfallbackを採用しない。
- Blob書込みはwritesApproved=falseが既定。書込み未承認でも検索回数RPCを維持した検索経路は準備できるが、source保存は起動しない。
- writesApproved=trueは保存先と影響範囲の確認・承認後にだけserver構成へ指定する。HTTP bodyで指定させない。
- 通常検索の既存claimSearch/limit30を維持。Productionではhandler起動前に404。本人以外はquotaやBlobに達しない。
- copyはcompletedCoreOnlyの既存読取りに限定。生成endpoint、Groq fallback、追加生成器なし。saveCompletedは信頼済みserver工程にだけ渡す関数でHTTP endpointではない。
- UI/公開契約/通常3000/品質基準/既存拒否は変更なし。実生成からの保存呼出はまだ実運用へ採用していない。

これは接続準備とmock境界検証であり、実認証/実検索/実文章品質の成功ではない。

## Blob管理情報の読取り

既存Vercel接続の認証済み管理画面から読取り確認した。

Store: store_sGSByr5MbYbxbENt
Name: urenavi-p3-first-call-private
Access: Private
Project: rakuten-affiliate-ai-mobile
Environment: Previewのみ
Authentication: OIDC
Env名表示: BLOB_STORE_ID / BLOB_WEBHOOK_PUBLIC_KEY
read-write token追加checkbox: 未選択

接続の編集画面は確認後CancelしSave Changesは押していない。token/環境変数の値は表示・取得していない。

この接続はPreview環境単位で、recovery branchだけへの限定とは確認できない。別ownerの本番データや校正台帳へ影響しないようnamespaceを分け、校正既存pathを触らない。実writerの配備先・対象store固定・権限/影響の承認が揃うまで書込みしない。今回Blob SDK get/putは実行0、管理画面の接続情報読取りのみ。

## 実検索最大2回の承認と停止地点

最大2回＋本人のusage行更新について、今回のユーザー承認は受領済み。承認を再要求しない。

ただし対象本人のウレナビAuth ID/実認証sessionがまだ未特定。接続管理者のVercel/GitHubアカウントとアプリ利用者IDを同一視しない。他ユーザー一覧から推測して選ばない。従って今回実検索0・検索回数更新0。

必要なのは、検証に使うウレナビのログインメール指定と本人ログインによるserver Auth ID確認。APIキーやパスワードをチャットへ求めない。確認できた一名についてのみ、既存limit30のまま合計最大2回を手動実行し、失敗時の無断追加検索・quota巻戻しは行わない。

RPCの既存確認済み実定義はpublic.urenavi_search_daily_usageの(user_id,local_date)にinsert-if-missing/+1。検索APIはUTC日付を渡す。DB関数/RLS/日付仕様は変更しない。この定義は前工程のREAD ONLY確認を引き継ぎ、今回RPC本体やSQL更新を実行していない。

## GitHub/Previewへの影響

保全branchの作成で既存Vercel Git連携が自動Previewを生成した：a0ba347、dpl_Aigqv4giHg6oJVa75mFpGsJWgrDr、READY/target=null。手動デプロイ/Production昇格/alias変更はしていない。この自動Previewを実検索・実生成の合格環境として案内しない。

管理画面でProductionは既存dpl_AVuWnmKJnhMWYoFaPFtyon92yQCr、mainの3fb1881のまま表示。元rebuild公開HEAD945359cは保全branchで上書きしない。

## 残工程/完成判定

1. 本人IDの確定→承認済み実検索最大2回。実データ検索・原文照合は未合格。
2. 実データ用Previewへの限定接続と対象Blob namespaceの有効化。実保存・再利用は未合格。
3. Groq全caller共有予算/ITPM・OTPM/未解決送信整合→別途明示承認後の初回固定wire1通信。今回は推論0、通常3000/校正wire不変。
4. 実生成を多ジャンルで6品質基準評価。90%/80%/ジャンル60%/重大根拠外0を維持。synthetic/mockから合格率を作らない。
5. iPhone実商品一周、復旧・操作性・採算性を総合評価。本番採用未判定。

今回：main/Production/決済/本番認証/DB/RLS変更0、共有DB書込み0、実Groq0、楽天検索0、Blob書込み0。GitHub保全と管理情報読取りは実施。完成ではない。

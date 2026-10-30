# 指示継続：実運用writer接続と作業領域復旧

2026-10-30 JST。

## 基準と復旧の限界

論理的な作業開始時は187bd1534e6f6c8512af888c2e5a348cf7f7e5d1、cleanを確認した。その後追加実装と検証を実施したが、コミット前に作業領域が消失した。公開済み945359c74f5db57282ad45ded31dafc2ea88f9a1をnative git fetchで取得し、同じ作業パスにdetached worktreeを復旧した。新ブランチ作成、元branchのreset/rebase、履歴破棄はしていない。

187bd153のオブジェクトは現在のローカル各repoにもGitHubにも見つからなかった。従って、ローカル履歴・証拠の完全復旧ではない。復旧commitの親は公開945359cであり187bd153ではない。これを隠して以前のHEADと連続するとは報告しない。

会話に残るコードから、authenticated-completed-read、trusted-product-source、room-copy-handlerのresolver注入を復元した。未保存だったPreview writer、検索hook、接続試験も復元・再検証した。既存app.html、app-bridge、registry、校正Preview、安全台帳の公開版を保持。

以前のローカル専用テスト/証拠は一部取得不能。今回の694成功を以前の723/726件と同じ範囲とは扱わない。元のテスト一式が回収できるまで、以前の回帰網羅性維持は未確認。件数合わせの代替テストを創作しない。

## P1 全体整合

| 完成経路 | 既存資産/今回の扱い | 実環境判定 |
| --- | --- | --- |
| 検索・比較・商品選定 | api/search.js、既存ranking/比較UI、limit30を維持。固定synthetic Previewを実検索と呼ばない | 実検索未実施 |
| 完全原文 | 新版4欄source/hashと既存表示投影を分離。検索選定済みraw項目をserver hookで保存 | mock接続合格、実保存未実施 |
| 理解・購入価値・生成 | 新版local-engine/plan/既存prompts不変。offline guardを解除しない | 実推論未実施 |
| 審査・公開 | 6軸・既存拒否・本文一致をbridgeで再確認 | 構造境界のみ。実品質未合格 |
| cache保存/再利用 | Preview writer→private reader→registry→bridge→room-copyの経路 | mock接続合格、実Blob未実施 |
| 認可 | server認可依存を使用。writerはAuth ID必須。readerのemail fallbackと自動統合しない | 実ログイン未実施 |
| 予算 | 既存Production DB budget、隔離file台帳、校正Blob台帳は別。統合済みと扱わない | 共有予算未合格 |
| iPhone | 既存Previewの合格Chrome操作と区別 | 未受領・未検証 |

新版core cache hitは0通信、miss時は最大4通信の実験構造。旧本体のlocalZeroCall経路を削除/無条件置換していない。新版を本番の補助利用へ採用する際のroutingと組織全caller予算は未接続で、毎回Groqへ丸投げする運用へ切替していない。

## P2 限定実装

- api/search.js: server依存captureSourcesを任意注入可能にした。Preview限定。選定済みraw商品を表示用boundedSourceより前に渡す。既定handlerには注入しないため外部副作用なし。検索keyword・選定商品IDをそのまま保持。RPC/limit30/検索公開契約は変更しない。
- preview-artifact-writer.js: assertWriteAllowed(server側の明示許可)とPreview/Auth IDの成立時だけ保存可能。実SDKを今回注入していない。
- 原文保存: 全入力を先に4欄/identity検証し、owner別のoriginal-source namespaceへ保存。更新はifMatch付き、作成はallowOverwrite=false。
- 完成artifact保存: 同一ownerの現在原文hash一致、既存app-bridgeによるversion/審査/output完全一致の採用を通してから、owner/version/key別の完成cache namespaceへ保存。同一保存は再利用、同一keyの異なるartifactは競合停止。
- 全保存はprivate/非キャッシュ読戻し＋etag/内容hash照合後だけ成功。競合・保存不明で自動再試行しない。部分的なbatch保存後に後続が失敗した場合は検索応答全体を失敗とする。原文を不正な公開本文として使わない。
- 読取り: trusted-product-source→authenticated-completed-read→room-copy-handler→registry/app-bridgeを復元。別owner/別商品/hash違い/synthetic provenance/未完成/missで生成fallbackなし。
- provenance文字列だけで真正性/品質を保証するとは扱わない。信頼済みserver検索・writer依存だけを入口とし、HTTP bodyからwriterを呼ぶAPIを追加しない。

## P3/P4 検証

既存検索APIへ認可・quota・商品API応答・Blobをmock注入し、レッグバッグ検索はbag ID、ケトル検索はkettle IDに対応することを確認。レッグバッグはidentity整合試験の一例で、商品別例外は実装しない。

HTML/空白を含む原文は原形で保存、表示のみ既存整形。実local-engineをmock transportで完了し、完成保存→再保存0書込み→既存ready本文読取りまで一続きに検証。bagのcache missは404、別商品名の混入は409、別ownerは停止。改変outputと異なる完成artifactは保存しない。

未承認/Production/原文欄欠落/未完成の保存拒否、読戻し不能で停止。二つの更新は一方だけ成功、他方は競合拒否。4種の商品名で原文復元・不正provenance/owner/hash/identity拒否を確認。mockによる構造検証で実文章品質ではない。

復旧後テスト：中核240＋既存454＝694成功、失敗0、skip0。core.tap/regression.tap保存。以前のlocal専用テストが不足するため以前と同等の回帰証明ではない。

## P5 実配備RPC確認と承認対象

停止前の同一作業でSupabase connectorからBEGIN READ ONLY内のpg_get_functiondefを一度実行し、以下の実配備定義を確認した。RPCそのもの/利用者行は実行・更新していない。復旧後は再queryしていない。

- urenavi_claim_search_daily(p_user_id uuid,p_local_date date,p_limit integer): public.urenavi_search_daily_usageへ(user_id,local_date,request_count=0)をinsert on conflict do nothingし、該当user/dateでrequest_count<p_limitのときだけ+1、updated_at更新。戻り値allowed/used。実検索側はp_limit=30を維持。dateは現行APIのUTC日付であり、日本時間0時リセットへ勝手に変更しない。
- urenavi_session_valid: auth.sessionsの該当session_id/user_id・30日・not_afterをSELECTするstable関数。書込みなし。

具体的な次の承認は：
1. 本人が実ログインしてserverが確認したAuth ID一名について、保護付き実データPreviewから実検索最大2回（通常quota消費最大2）。更新は上記本人/dateのusage行のみ。DB/RLS/関数/認証設定は変えない。実UIDはまだ未特定、他ユーザー行は対象外。失敗もquotaを消費し得る。検証後に回数を無断で戻さない。
2. 指定した隔離Preview用Private Blobに、その検索で得た完全原文だけをoriginal-source namespaceへ保存・非キャッシュ読取り。共有Production cache/校正台帳には触れない。完成artifactの実保存は、後の実生成・審査合格後の別許可範囲として扱う。対象store/接続先は実行前に固定する。
3. Groqは今回禁止。共有予算/未解決予約を整合してから固定wire初回1通信を別途承認。通常3000の品質評価や多ジャンル基準達成へ自動移行しない。

## 未解決・完成判定

実検索・実Blob・実認証・実Groq・iPhone一周・採算性は未合格。品質の目標90%/80%/ジャンル60%/重大根拠外0は維持し、synthetic審査から達成率を作らない。保存済み旧文章の独立評価は既存p3-editorial-quality報告を参照し、新版実品質の代替にしない。

月1480円単一プランは維持。無料Groq枠がユーザー数に対して成立する実測がなく、利用者増加時の使用量/再利用率/保存費を含む採算は未証明。limit30は検索枠であり生成回数保証ではない。

P0復旧は部分完了、P1整合照合/P2-P3ローカル接続と境界検証実施、P4は取得可能テストのみ合格、P5承認範囲具体化。P6以降は未実施。完成候補ではない。

今回の復旧後に外部副作用なし。native git fetchのみ。main/Production/決済/本番認証設定/DB/RLS/通常3000/品質基準は変更なし。推論・楽天API・Blob書込みなし。branch push/Previewデプロイなし。停止前のSQL定義読取り1回を除き実DBアクセスなし。

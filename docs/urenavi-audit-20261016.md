# ウレナビ実装・検証監査（2026-10-16 JST）

## 対象と境界

確認対象: hirobeya/rakuten-affiliate-ai-mobile PR #162 HEAD `cf15eab1db55830d0fcf5e095b5b70a22f1dd7d9`。
修正枝: `fix/urenavi-quality-contract-20261016`（上記HEADから作成）。
既存設計: `urenavi-completion-architecture-20261016.md`、A〜G受入ゲート、Groq制限・バックアップ・商品台帳設計を照合。
main、Production、決済・認証設定、既存PRのDraft・merge状態は変更していない。

## 外部の事実確認

- PR #162: open / draft=true / merged=false。baseはPR #159の開発枝で、mainではない。本文の検証基準 `b71220d` は現HEADと異なる。
- PR #159: open / draft=true / merged=false。HEAD `6664424697fecd2c5e9362b7567a8db23b4cb8c8`。同HEADのVerify Urenavi、ROOM Copy Regressionともsuccess。
- PR #162の現HEAD: ROOM Copy Regression success（run 38840930110）、Verify Urenavi failure（run 38840929977）。後者はPRの合成mergeコミット `dee3f7a` をテストしている。
- 現HEADのPreview: `dpl_7z8GSg7Y3Cm37FCzFSQ77ENUzHYo`、READY、target=null、Git SHA一致。URL: https://rakuten-affiliate-ai-mobile-dci1lbot5-hirobeya-6572.vercel.app/app.html 。Vercel接続経由の取得はHTTP200。実ブラウザでもアプリのログイン画面まで表示。認証後の操作は未確認。HTTP200とREADYを機能合格として扱わない。
- Production: `dpl_B8RvSTq5esxzfHCzB7UowZ8NuAXK`、READY、main `3fb18811de413448384317f2beead78cd29a2ae3`。読み取りのみ。

## 原因に基づく今回の修正

1. `api/room-ai-v3.js`のlocalZeroCallは、商品説明の完全な引用文から「布団が入る」等を抽出できても、分類軸が容量というだけで拒否していた。既存のcaption候補検査（原文・商品との紐付け・否定・高リスク表現等）を通ったcaption_claimを、裸の数値と区別した。サイズ・数だけの文と否定文は引き続き拒否。
2. 同APIで長袖・半袖・季節というラベルだけを強い購入理由として完成扱いしていた。これらだけなら検証済み生成へ回す。全商品を拒否するidentity-onlyの一括判定には戻さない。
3. `urenavi-tabs.test.js`の2ケースは、実装が必要とするFactSafetyとlocalCopyAssessmentがない古いVMを使用していた。実際のstructured engineとFactSafetyで検査し、原文に対応した文の採用、他商品の文・差し替えた文・未根拠の効果の拒否、最終安全検査がない場合の拒否を確認する形へ変更した。投稿の実装条件は変更していない。
4. 商品名や商品IDによる例外分岐、テスト基準の引下げ、Groq上限・モデル・生成契約の変更はない。

## 検証結果

- 修正前 `node --test`: 403件、396成功、7失敗。GitHubの失敗をローカルでも再現。
- 修正後（回帰2件追加）: 405件、404成功、1失敗。失敗は既存 `tests/unsupported-benefit-guard.test.js:85` の生成件数91 < 基準112。基準は変更していない。
- 780商品localZeroCall監査: 8件ローカル完成、772件ローカルでは未完成、疑わしい薄い完成文0件。772件について実際にGroqを呼んだわけではない。無料枠内で処理できる根拠にはならない。
- 洗濯ネット実例9件とローカル品質5件、780件の薄い完成文検査は成功。追加回帰でサイズだけのcaption、否定caption、袖・季節ラベルだけの文を拒否。
- 全体テスト内の投稿一括状態、429即停止・自動再試行なし、交流候補、商品別成果、アカウント別記録・復元のテストは成功。多くはモック・VMであり、実ブラウザ一周や実データの証明ではない。
- この端末にはnpmがなく、`npm run vercel-build`自体は実行不可。package.jsonのvercel-buildとそのtest:copy/test:shadow/test:aiを展開し、同じ順序・同じNode引数で全コマンドを実行、成功。通常のビルド成功とは区別して記録する。Node v24を使用。生成されたバージョンメタデータと一時依存ファイルは変更に含めない。
- `git diff --check`成功。実Groq呼出、商品API通信、決済操作、iPhone実機検査は行っていない。

## 残るCI失敗を安易に直さない理由

現structured.composeは780件中91件を生成する。同じ結果は公開側buildGroundedBenefitPostでも再現。
履歴 `4bc30dd` ではunknown source_labelから仕様だけの文を返す変更が入り、直後 `0ab47e2` で「system-wide evidence review待ち」として戻されている。112件の基準との不整合が現HEADに残っている。仕様だけの文を再び通す変更、または112を91へ下げる変更は今回行わない。失われた商品ごとの原因と、草稿・公開可能文の全呼出側の契約を確認してから修正する必要がある。

## 全体設計との不足一覧

| 領域 | 現コードで確認したこと | 完成に必要な残作業 |
|---|---|---|
| iPhone安定性 | 復帰・検索保持・リンク移動・429停止の回帰は成功。Previewログイン画面表示 | 正規ログイン後、検索→生成→コピー→ROOM移動→復帰→投稿確認を実機で記録。連打、オフライン、再読込、容量不足、アカウント切替も確認。起動直後クラッシュの端末ログは未取得で原因未特定 |
| 無料検索・商品理解 | api/search.jsはbilling.authorizeを呼ぶ。同authorizeはownerまたは有効契約を要求 | 無料検索と有料生成の境界が未実現。楽天の商用提供許諾と既存認証の維持を前提に別工程で対応。無断の課金境界変更はしない |
| 商品比較 | 予算・重複・投稿済み除外を行う実装とテストあり | 実商品で理由・欠損表示、選定から投稿までを確認。参考スコアを販売確率と扱わない |
| 購入理由・ROOM文 | /api/room-copyは既存product/sentences契約のハンドラへ接続。localZeroCallを先行再利用 | 生成範囲のCI失敗、clientとserverの品質判断の差を全経路で整理。複数カテゴリ・未見商品で出典と対象・限定・否定を実測。今回の数件成功を全商品品質と扱わない |
| 投稿管理 | 最大3件、保留・停止再開、投稿確認とコピーの区別、商品台帳、復元のテスト成功 | 認証後の実操作、ROOM投稿後の本人確認、別端末復元を確認。識別情報のない旧メモの自動商品紐付けは未完成 |
| いいね・フォロー | 4活動の管理・候補・履歴・重複回避のテスト成功 | 候補の正規な省力発見は未完成。実際の交流は本人操作。自動操作は追加していない |
| 成果 | 商品別手動実績と訂正・バックアップのテスト成功 | 正規な成果データ連携、クラウド同期、実データ突合は未完成 |
| Groq無料枠 | DBの日次呼出制限、429伝達、残り商品停止、計測経路あり。モック検査成功 | 契約固有のトークン/分/日枠と並列負荷・実処理量・失敗使用量を実測。8/780のローカル完成率だけでは多数利用者の無料運用を保証できない |
| 販売・料金表示 | 認証画面に旧月額980円導線が残る。設計は無料検索＋有料文生成 | 許諾・採算・販売条件・画面の整合を確認してから反映。月額1,480円の価値・原価・継続性は未検証。決済変更なし |

## 判定

修正した範囲は前進したが、全CI成功、iPhone安定運用、A〜G受入、一般販売のいずれも完成扱いしない。既存PR #159/#162はDraft・未merge維持。次の優先順位は生成範囲と公開品質契約の整合、認証後実機フロー、無料検索境界、許諾済み商品による実Groq処理量・品質測定。

# ウレナビ｜実ユーザー経路へ未接続だった再構築成果の統合（2026年11月8日）

## 問題と原因
`scripts/rebuild/local-first-audit.cjs` が評価する `lib/urenavi-core/last-resort.js` は `localZeroCall(item)` が失敗したとき、`localZeroCall(item,'',diagnostics,{editorial:true})` で原文に基づく第2パスを試す。しかし利用者向けの `/api/room-copy` → `/api/room-ai-v3?urenaviContract=1` → `lib/room-copy-handler.js` は第一パスしか試していなかった。

つまり以前の「固定44件の完了5→6」という改善は、実際のPreview通常経路に反映されていなかった。この欠落は、ローカル評価成功を利用者の完成成功と読み替えた工程上の不整合である。

## 今回の改修
`lib/room-copy-handler.js` で第一パスが通らなかった場合、既存の `{editorial:true}` による第2パスを実行。第一パスの受理契約は変更しない。第2パスは `ok=true`、`pending=false`、`model=local`、`quality.status=ready`、`groq.totalCalls=0`、`quality.text === variants[0].text` を満たす場合のみ返す。失敗時は既存の予約・審査付きAI経路へ進む。

新規で根拠なしの主張を許可するものではない。投稿文の6軸品質達成を宣言するものでもない。

## 証拠
`tests/rebuild/local-preview-editorial-bridge.test.js` は、収納ベンチ `e-kurashi:10019512` が第一パスで失敗し第2パスで完了、実際のPreviewハンドラーでも同じ本文を返し、Groq通信・DBアクセス・回数消費を使わないことを検証。書きかえに失敗した結果は採用しない。

`tests/rebuild/whole-44-local-pipeline.test.js` は保存済み固定44件を実際のハンドラーで再生し、第一パス5件・統合後6件、上積み1件、provider calls 0、残り38件はAIへ委譲するときも本テストではクォータ拒否によって未送信であることを検証。

CI：Verify Urenavi／ROOM Copy Regression成功。誤判定修正があった `public/fact-safety.js` についても既存テストを維持。

## 残る欠陥・優先順位
大半38/44が未完成。既存分析は識別不明・競合11、購入理由不足・反復12、根拠抽出不足6、カタログ文拒否9。未完成の原因は単語表現ではなく商品理解・訴求論理に分散している。

新AI編集者方式とガイド付き方式は比較経路のみ実装済みで、実AI出力・独立6軸比較・1件当たりの実消費量の証拠はない。Groqはあくまで使用量制御下の比較・最終手段とし、その他の経路の探索・統合・顧客体験・認証・課金まで通した最終判定が必要。

次の最重要工程は、実モデルで新方式を少数の実商品に適用し、品質改善が実在するか確かめること。合格するまで通常顧客には切り替えない。Free枠/過去未精算の不明がある場合は追加送信しない。

main、Production、決済、認証、RLS、DBは変更していない。実Groq通信0。Preview比較ルートの実装ブランチのみ。

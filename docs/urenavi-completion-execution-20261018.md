# ウレナビ完成作業・実行設計（2026-10-18）

## 確認した開始地点
- PR163: open/Draft/未merge、HEAD a07cf51d1d69bc0cd228ac48a299aba2991c7186。
- 両CI成功（39106328100、39106328104）。今回のローカル全検査も420/420成功。
- HEADのPreview dpl_3iguYGVxNThyef61JR5MBRtJsdwFはCANCELED（ignored-build-stepへのリンク）。直前57ddeb5のPreviewはREADY。最新HEADの実操作完了とはしない。

## 全体構造と完成との差
検索API→search-v2の比較順位→appの商品保持→structured理解・ローカル品質判定→不足時room-copy handler→semantic生成→機械拒否→全文章AI検証→ready adapter→コピー→本人の投稿確認→商品台帳。交流・成果・復元は別モジュールでアカウント別に保存。

|領域|現状と必要な証拠|合格基準|
|---|---|---|
|原文・再利用|semanticはcatchcopyを生成・検証・inflight識別へ渡すが、DBキャッシュは無視している|原文3項目の変更が保存済み状態の再利用に反映され、同一原文は再利用可|
|購入価値|ローカル完成と草稿は分離済み。過去780件のstrict品質は未達|カテゴリ横断で根拠・自然さ・購入理由を個別評価。根拠不足は非公開|
|検索・有料境界|searchは無料用認証＋DB quotaだが、app起動statusは契約を要求|無料ユーザーの正規セッションで検索可、生成は有料の境界を実操作確認|
|投稿・交流・成果|模擬接続検査あり、実アカウント通し操作未検証|検索から本人投稿確認、交流、成果訂正、復元、アカウント隔離を確認|
|iPhone・認証|Previewは保護され、アプリも正規ログインが必要|Safari実機で往復、再読込、連打、認証失効を確認|
|販売条件|許諾・ホスト契約・Groq実枠の成立は未確認|書面回答・実契約・実測により確認。決済は停止維持|

## 根本原因・修正対象
1. `room-semantic-engine`はcatchcopyをキャッシュのitemへ渡すが、`super-urenavi-cache`のload/save/hashが二項目だけを受け取る。catchcopyが肯定から否定に変わっても同じキャッシュキーとなり、再検証せずdone状態を返す。この不整合を共有キャッシュ層で修正する。DBスキーマ追加・商品別分岐・生成品質の緩和は不要。
2. 検索結果の説明は1200文字で切断される一方、Previewは12000文字を受け取る。後段で失われた原文は復元できず、条件や購入理由が欠落し得る。上限と切断による条件欠落の扱いを横断確認してから修正する。

## 実装順序と影響範囲
原文変更時のキャッシュ衝突を再現→共有hash/load/saveを修正→実storeとsemanticの接続回帰→原文受け渡し→全体テスト・build→開発枝へpush→同SHAのCIとPreview→認証後操作。既存の空catchcopyキャッシュは維持し、非空catchcopyは新しい原文識別子へ移す。古い非空catchcopyの誤再利用を避けるため、そのケースの初回missは意図した挙動。

## リリースを止める条件
回帰失敗、原文の変更を無視した再利用、草稿の公開、出典・否定・付属品の誤認、無料枠成立未確認、実機未検証、外部条件未確認。main/Production/決済・PR159の状態・PR163のDraftは変更しない。モック成功を実Groq・実機の成功として報告しない。

## 今回の実装と検証
- キャッシュ共有層のhash/load/saveにcatchcopyを含めた。原文変更・消失時の再生成、同一原文再利用を実store＋semantic engine接続で確認。
- 検索説明の上限をPreview受付と同じ12000文字に統一。appで再切断せず渡す。長すぎる原文は文末までを保持し、途中で切った肯定語を根拠にしない。catchcopyも同じ原則で500文字以内へ。直接API入力が上限超過/非文字列なら切断せず400。
- 追加5回帰を含むnode --test: 425/425成功。npm run vercel-build: exit 0。git diff --check成功。実Groq通信はしていない。
- strict横断監査はexit1。780件はすべて商品名のみ、草稿249、ready8、ready文のguard変更0/拒否0。112の合格基準を下げていない。この入力集合での完成率改善とは報告しない。
- 本番DBへの読み取りで無料検索quota/session検証/AI日次上限の3関数が存在することを確認。関数の存在を実認証・無料境界の合格とは扱わない。DB変更なし。

## 次工程：無料検索と有料生成の画面境界
既存searchは無料認証を採用済みなのにapp起動statusだけが有料契約を要求するため、正規の無料アカウントが検索画面へ到達できない。app専用statusを追加し、有料確認が明示的403の時だけ既存のBearer/session検証へ戻す。既存status/pro-status、生成API、記憶端末cookie、有料認可は維持。無料アカウントには投稿文コピー・表示を開放しない。失効・不正セッション・DB/Stripe障害は無料へ降格させず拒否。新規登録設定・販売停止・決済を変更しないため、未登録者の新規受付は引き続き未完了。

## 続行した修正と実際の限界
- app専用statusを実装。無料アカウントのBearer/session検証で検索画面への入口を許可し、有料status/pro-statusや生成APIは維持。無料では全コピー導線の共通判定を拒否し、生成文の代わりに有料機能表示を出す。登録済み無料アカウントでの本番実操作は未確認。
- titleの肯定機能に対してcaption/catchcopyが否定してもlocalZeroCallがreadyを返すことを修正前に再現（コードレス、型崩れ防止）。ブラウザとサーバーで3原文の矛盾検査を共有した。不可・できません等を含む関連否定だけを拒否し、無関係な否定文では正例を維持。商品名別分岐は追加しない。
- 追加7ケースを含め全432テスト成功、npm run vercel-build成功。strict監査は780件/草稿249/ready8のままexit1、未達を維持。
- 前段a584104fe19a2816ca9414a93197c3e51c101796は両CI成功（39106832102、39106832097）、Preview dpl_67pP3jDoLZmeZpnZLtf5RRsnj9ph READY/target=null/SHA一致。
- 実ブラウザはVercelログイン画面。Vercel接続の保護URL取得もdeployment_authentication_required/302で失敗。ローカルVercel CLIは未導入。この制約をアプリ認証成功やPreview実操作成功と読み替えない。
- 公式条件を確認: Vercel Hobbyは非商用個人利用限定（https://vercel.com/docs/plans/hobby）。ただし今回のチーム取得結果には契約planがなく実契約は未確認。Groqは組織単位の複数レート制限で、正確な枠はアカウントLimitsが必要（https://console.groq.com/docs/rate-limits）。本文を長く保持する変更の実トークン負荷も未実測。楽天規約は公式英訳を確認したが日本語原本が優先と明記され、今回のサービスへの書面許可は未確認（https://webservice.rakuten.co.jp/guide/rule）。
- 未完: 実Groqの自然さ・購入価値・トークン負荷、認証後Preview一周、iPhone実機、無料新規登録、商用条件、成果連携・クラウド同期。外部制約だけで全残作業が止まっているとは主張しない。販売完成とは判定しない。

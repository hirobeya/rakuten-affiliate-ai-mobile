# PR #184 第2段階｜Groq公式残量証拠の監査結果（2026-11-20）

対象HEAD（調査開始時）：`89b647bff55d4bb4dd0fb6a34d4ca670be5bd012`。この文書は公式資料照合であり、署名済みの現在残量証拠ではない。Groq実生成リクエストは行っていない。

## 公式仕様と採用条件

出典：
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/projects
- https://console.groq.com/docs/spend-limits

1. Groqのレスポンスヘッダー `x-ratelimit-limit-requests` / `x-ratelimit-remaining-requests` は **RPD** を意味する。RPMではない。
2. `x-ratelimit-limit-tokens` / `x-ratelimit-remaining-tokens` は **TPM** を意味する。TPDではない。
3. `x-ratelimit-reset-requests` は RPD、`x-ratelimit-reset-tokens` は TPM のリセット情報。ヘッダーの表示は期間であり、絶対タイムスタンプとして扱うには応答受信時刻が必要。
4. 公式ヘッダーだけでは **RPM残量・TPD残量・各リセット時刻は確認できない**。モデル別限度値（RPM30/RPD1000/TPM8000/TPD200000）は組織ごとの実限度・現在残量と同一視できない。
5. 最新の Groq Projects 仕様では、プロジェクト側に組織上限以下の独自の制限を設定できる。証拠は対象組織・プロジェクト・モデル・キー指紋を照合し、組織上限とプロジェクト側上限のうち厳しい条件を使用する。
6. Console の上限表示と **現在残量** は別の値。現在残量が表示・取得できなければ `null` で保持し、推定・日数による割戻し・過去利用量からの差分計算をしない。
7. Freeで請求が発生しないことと、月額支出上限の設定は別物。プラン・課金状態・他の使用主体を現時点で照合するまで新送信は禁止。

## 既存実装を維持したままのギャップ

`lib/urenavi-core/paired-comparison-runner.js` の `validEvidence()` は minute/day にそれぞれ request/token を要求するが、`source:'groq_headers'` の正規ヘッダーは分窓requests(RPM)と日窓tokens(TPD)の **残量を含まない**。つまり正規ヘッダーのみから4窓を生成して合格扱いするのは禁止。

`scripts/rebuild/run-paired-comparison.cjs` は署名済み証拠ファイルを読み込む。現在の第1段階実装はConsoleの証拠を自動取得・検証していない。正式な公式残量証拠は未取得。

**次の実装合格契約：** 原本（Console画面の保存証拠またはHTTP応答ヘッダー＋受信時刻）→原本ハッシュ→取得元の種類ごとに存在する値だけ解析→RPM/RPD/TPM/TPD四窓と組織・プロジェクト・モデル・Free無課金・他使用排他を個別照合→別鍵で証拠署名→既存 `validEvidence` / 容量v2へ渡す。4窓のうち1つでも不明なら送信前停止。Console原本を見ていない人が任意の残量値を署名することは禁止。

## 隔離導入の判定

接続済みSupabaseの一覧に「ウレナビ」（`upooxcugrplfmjnqpuxs`）のみ確認。既存プロジェクトは本番影響を否定できないため、比較専用SQLを適用していない。専用のクリーンなループバックPostgres / Supabase と永続ボリューム、署名用秘密鍵、オーナーJWT、サービスキー、公式容量証拠の組が揃うまでは実環境導入・CI通過・実測開始を主張しない。

実通信許可：なし。生成／審査のGroq送信：0件（今回の調査操作）。管理者承認は **最終実行SHA、2商品×B/Cの送信ハッシュ、最大8段階、58,460予約トークン、公式残量、Free無課金、1段階ごとの再承認要否** を特定して初めて発行する。総上限は連続送信の許可ではない。

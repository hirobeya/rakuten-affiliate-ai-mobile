# 本人認証・実検索最大2回の実行準備

2026-10-30 JST。開始HEAD27673084317ffd2d87793fd07c211130ee500249、clean。

指定メールを既存Supabase Authで限定SELECTし、一致1件・メール確認済み・非匿名・非削除・非停止を確認した。メール照合はログイン成功ではない。ID/認証tokenは公開証拠へ保存しない。owner監査hashはc2f8c0b0d5680d68aba61fe2a77d8c18caa90cd5cdb9d2d3174e39680a762a74。

実配備urenavi_claim_search_daily定義をREAD ONLYで再確認。public.urenavi_search_daily_usageのp_user_id/p_local_date該当行へinsert-if-missingとrequest_count<p_limitの条件付き+1。limit30は維持。2026-10-30 UTCの対象行は未作成、使用0、上限30。本人以外の行を更新しない。

scripts/rebuild/real-search-previewを追加。既存app.html全体/実Supabase Auth/既存search APIを使用。fixtureデータなし。初期renderで自動AI処理なし、選択時は完成cache-only。独立harness/新生成器なし。配備APIはaccess(GET app-statusのみ)、runtime-env、search、room-copyの4つ。決済/cron/Groq/生成fallback endpointなし。認可は既存server authorize＋指定本人ID完全一致。メールだけのcookie認可は採用しない。

既存access-guardのdevice/payment/handoff decoratorはこの隔離buildからだけ省略。Supabaseログインとserver session/owner認可は保持。本番認証設定やpublic/app.html自体は変更しない。

Previewのrecovery branchだけに対象ID（非公開）と原文保存許可flagを設定。Production環境変数は変更なし。書込み先は既存Private store_sGSByr5MbYbxbENt。実行時BLOB_STORE_IDが一致しなければ検索開始前に停止。対象は本人のoriginal-source namespaceのみ。校正台帳/他ownerのpathへ書かず、生成・完成artifact保存は行わない。Blob実書込みはまだ0。

中核245＋既存461＝706成功、fail0/skip0。元704件を維持。新rootの実UI/認証保持・fixture除外・生成route非配備・決済POST拒否を境界検証。

この時点：実検索0/2、Groq0、Blob SDK書込み0。実認証のsession成立を確認してから実検索を行う。本人確認をSQL結果や模擬Bearerで代用しない。本人ログインに手動操作が必要なら、正規ログイン画面を引き継いで待つ。

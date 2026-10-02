# 投稿文の構造改善・Preview検証候補（本番反映不可）

本番基準: `3fb18811de413448384317f2beead78cd29a2ae3`。Vercel Productionのcommit SHAとmainを一致確認。main・Production・環境変数・課金設定は変更しない。

## 原因

検品文化は9/26だけの変更ではない。9/25の `35cc306` で3媒体の生成をneutral/exact-tokenへ変更、`894fb05` で `groundedBenefitForFact` に「商品名には…と明記されています」を導入。`9485769` で商品種別付きの比較説明を追加。9/26の `a37e507` は未根拠benefit単語を行単位で削除、`25ef07c` はtypeKnowledge rankingに基づく「と確認できます」を生成し、検品文化を強めた。

本番ROOM欄: `public/app.html` の `post -> resolvedPost`。通常/legacy ROOMは `neutralRulePost -> buildNeutralFactPost`、AI合格時は `aiPhase1Post -> buildValidatedProductPost`。Threads/Instagramは `makeThreadsCopy/makeInstagramCopy`。`public/fact-safety.js` が公開メソッドをwrapして行単位のbenefit guardを適用する。`api/room-ai.js -> typeWrapper.createHandler -> super-urenavi-router` のサーバー事実検証を経てAI欄へ渡る。

`lib/room-ai-handler.js` はfacts-onlyプロンプトであり、ここが「明記されています」を作文しているのではない。主原因はクライアントの文章組み立てと後段wrap。仕様の許可リストは素材/規格/一部数値に限定され、スマホ対応・防風・季節などを採用できなかった。重複判定も文字列一致のみで本革/レザー/山羊革を整理していなかった。

v3は別経路: `api/room-ai-v3.js -> analyzeProductV3 -> validateUnderstanding -> applyVerification -> composeVariants`。現行app.htmlはroom-ai-v3を使っていない。v3 understanding/engineの検証は維持。旧v3コピーの `evidenceSentence/directFactLines` にも「と確認できます」があり、同じ文章化問題が存在した。

## 修正

新しい `public/structured-room-copy.js` をクライアントとv3で共用。

A. 商品理解: 既知の種別は原文から照合し、商品種別の定義に基づく使用場面だけを使う。無関係な種別が同居する場合は停止。未知の商品は原文の名称トークンと出典を保持する共通経路へ進め、生活シーンは作文しない。アクセサリーに本体機能を転用しない。
B. 事実抽出: 商品名/説明の原文引用とsourceを保持。仕様辞書と数値の形を使い、否定/条件/素材修飾を除外。画像からの推測はしない。レザー系列・USB-C系列・サイズの同義語を整理。数量/容量の矛盾は採用しない。
C. 安全な価値変換: 一つの事実と対応カテゴリに限定した規則。スマホ対応→停車中のスマホ操作にも対応。防風→走行時の風対策。IH対応→IH調理。食洗機対応→食洗機で洗える。快適・時短・安心などへの拡張はなし。未対応の意味変換は事実のまま示す。
D. 投稿文化: 使用場面→素材/商品種別→根拠のある用途→未使用の特徴→価格→広告表記。本文に使った事実は箇条書きで繰り返さない。

旧guardを一般に無効化したのではない。固定規則でのみ文章を構築する新生成器の公開関数に `__structured` を付け、この出力には旧単語削除を重ねない。旧メソッドには従来guardを適用し続ける。安全性の責任を構造化生成器の原文/否定/矛盾/意味変換検証へ移す。

## 検証と限界

- 指定15分類の契約テスト: 15/15生成。バイクグローブの商品名はユーザー提示データ。他14例は人工的なテスト入力であり実商品の事実確認結果ではない。
- 否定、条件付き数量、素材修飾、容量矛盾、種別矛盾、無根拠特徴、走行中操作、効能混入など14ケースを別に検査。
- `npm run vercel-build` 完了。コピー/分類/shadow/AI検証/cache/v3サーバーを含む。旧テストの検品文必須条件だけを新出力契約に更新し、否定・条件・原文一致・効能の安全性テストは維持。
- 39カテゴリ780件（既存の2026-09-25商品名fixture）: 旧生成112件、新生成253件、新停止527件。旧生成112件のうち109件を維持、144件を新たに生成、3件は長い商品名から安全な名称を確定できず停止。203件は原文名称を使うsource_label経路で、使用場面を推測しない。生成数の増加は自然な価値表現を全商品で達成した証明ではない。
- リアルな商品説明/画像を含む15カテゴリのライブAPI/ライブGroqの再生成は未測定。オフラインfixtureの結果と混同しない。
- v3は今回、安全に異なるhookを証明できない場合に1案だけ返す。無関係な3種類の定型hookは返さない。既存の3案UXとの整合性はリリース前に確認が必要。

## 判定

Draft/Previewのみ。本番反映不可。指定例の文章は改善したが、全商品の自然な用途表現と実データでのライブ検証が未完了。ビルド成功/安全性の自動確認は「欲しくなる文章」を全商品で達成した証明ではない。

比較データ: `docs/structured-copy-report-20261002.json`。検証画面: `/structured-copy-preview.html`。

過去との完全diff: https://github.com/hirobeya/rakuten-affiliate-ai-mobile/compare/74f9a1f...3fb18811de413448384317f2beead78cd29a2ae3 （コピー関連の6ファイルを確認）。9/26直前との差分: https://github.com/hirobeya/rakuten-affiliate-ai-mobile/compare/4827461401...3fb18811de413448384317f2beead78cd29a2ae3

## オンラインPreview確認

Vercel Preview READY: commit `79441f4fdc09fd9f94e558c2ee5e984715d1aaf0`。検証ページの全15分類をブラウザで選択し、生成あり/ルート一致OKを確認。否定入力 `バイクグローブ 非 スマホ対応 防風ではない レザー 調` は生成停止/ルート一致OK。修正前後のスクリーンショット: `docs/urenavi-copy-preview-20261002.jpg`。

`/app.html` 自体も表示を確認したが、アプリのauthGate（メールリンクによる認証）で停止。ブラウザには本番の認証済み端末情報がなく、検索→実商品AI生成→コピーのE2E確認は完了していない。ログインメールの送信や認証設定の変更はしていない。

Draft PR: https://github.com/hirobeya/rakuten-affiliate-ai-mobile/pull/158
Preview比較画面: https://rakuten-affiliate-ai-mobile-fulem7slk-hirobeya-6572.vercel.app/structured-copy-preview.html （Vercel認証が必要な場合あり）。

次に必要な検証: 認証済みアプリの実商品データで、A/B層の不足を測定し、意味変換の対応範囲と生成カバレッジを改善する。原文名称のみの203件を含むため「全商品で自然な使用場面まで修正完了」とは判定しない。

## 続行修正

未知種別を一律停止する条件を外し、原文名称・事実・用途変換を別に扱う共通fallbackを追加。素材の役割が不明なら商品全体の素材と断定せず特徴欄に留める。充電式＋コードレス等は一文に統合し、本文と箇条書きの意味重複を除去。名称の途中切断は禁止し、長すぎて安全に確定できない名称は停止する。追加の未知種別、素材役割、付属品への機能転用、複合機能重複テストを実施。全体ビルド通過。

最終Previewで発見した旧種別hintの付属品誤認を除去。通常/AI経路双方のテストを追加し、WiFi表記・アルミ素材表記・原文名称の繰り返しも共通の意味キーで整理。旧112件のうち109件を維持、残る3件の停止理由と全文はJSONレポートlostRowsに記録。

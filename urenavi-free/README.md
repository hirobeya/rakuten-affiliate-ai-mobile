# 無料ウレナビ

このディレクトリを配備ルートに指定する。既存プロジェクトのルートや環境変数を流用しない。ビルド時に `npm test` が実行される。設定を空にしたPreviewはトップページだけを表示し、商品APIは503を返す。検索エンジンの登録はHTMLとHTTPの両方で停止する。

## データと表示

- 接続対象は楽天市場の公式商品検索とランキングAPI。価格・レビュー・順位は提供元と時刻を表示する。お買い得候補は予算上限付きの価格順で、値下げや最安値を示すものではない。
- 急上昇は同一条件で取得したリアルタイムランキングの順位差。取得元時刻が5分以上離れ、両方の順位が確認できた商品だけ表示する。順位比較用の保存は最長1時間。季節のキーワードは編集した検索候補。
- 楽天の成果リンクは、承認済みの運営者IDを付けた楽天APIの応答から取得する。商品URLと購入先が照合できたリンクを原文のまま掲載。楽天の応答リンク内のIDが送信IDと異なる場合があるため、実測ではアフィリエイトレポート側も確認する。
- 表示する推定報酬は取得時点の価格×提示料率で1商品1,000円を上限とした参考値。確定報酬の正本は楽天アフィリエイトのレポート。お気に入りには商品コードだけを保存し、商品情報は利用者が開いたときに取得する。
- Yahoo!ショッピングとAmazonは未接続。追加時は各社アダプターで正規化し、取得元、商品識別子、購入リンクを揃える。複数ECの価格を横断比較する前に、Amazonの新品・中古の最低価格表示など、各社固有条件を満たす。
- 公式資料 [楽天 データ更新](https://webservice.faq.rakuten.net/hc/ja/articles/900001974343) ／ [楽天 他社商品併置](https://webservice.faq.rakuten.net/hc/ja/articles/900001970786) ／ [Yahoo! 商品検索](https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html) ／ [Amazon 運営ポリシー](https://affiliate.amazon.co.jp/help/operating/policies) ／ [Vercel 利用規約](https://vercel.com/legal/terms)

## 通信承認と停止

実接続には、このブランチ・対象SHA・有効期限・日次上限・承認全体の送信上限・登録済みサイトURLを含む新しい承認が必要。VercelのGit連携で付与されるシステム変数だけを利用して実行SHAを照合する。明示の承認まで以下は設定しない。

- `URENAVI_FREE_APPROVED_SHA`、`URENAVI_FREE_APPROVED_UNTIL`（ISO 8601）、`URENAVI_FREE_DAILY_LIMIT`、`URENAVI_FREE_APPROVAL_LIMIT`
- `URENAVI_FREE_RAKUTEN_ORIGIN`、`URENAVI_FREE_RAKUTEN_APP_ID`、`URENAVI_FREE_RAKUTEN_ACCESS_KEY`、`URENAVI_FREE_RAKUTEN_AFFILIATE_ID`、`URENAVI_FREE_APPROVED_AFFILIATE_HASH`
- 隔離したRedisの `URENAVI_FREE_REDIS_URL`、`URENAVI_FREE_REDIS_TOKEN` と独立した `URENAVI_FREE_EVENT_SECRET`。閲覧・クリックの重複防止は30分、日別集計は90日。
- 楽天データ保存条件と配備先を確認後、`URENAVI_FREE_CACHE_APPROVED=true` で60秒の共有キャッシュと順位比較を有効にする。

通信予約はRedisで原子的に記録する。429、タイムアウト、処理中断、結果保存失敗で予約が残った場合は楽天への送信が止まる。運営者は停止を維持して記録を照合し、送信が終わったことと残りの承認枠を確認した後に当該予約だけを解除する。期限切れや再配備で自動解除しない。商用配備と検索登録は、運用先を確定し実機・実データと帰属を検証してから実装する。

## iPhone検証

承認済みの隔離PreviewをSafariで開く。一般検索、予算上限、売れ筋、詳細、2商品の比較、お気に入り登録・再読み込み、購入リンクの順に確認する。楽天への遷移は購入確定前に終了する。検索・ランキングに必要な通信を事前に数え、急上昇の確認には提供元の異なる時刻の取得枠を含める。

# 固定2商品比較の公式残量証拠

[公式仕様の監査](./official-capacity-audit-stage2.md)に基づき、ネットワークを使わず、保存した公式画面または応答ヘッダーを取り込む。残量取得目的で新規の生成リクエストを送らない。

1. Groq Consoleで組織・プロジェクト・モデル・キーの所属、Free契約と課金設定、組織とプロジェクトそれぞれの制限を照合する。RPM・RPD・TPM・TPDについて、対象範囲で有効な上限、画面に明示された現在残量とリセット時刻を確認する。現在残量が表示されない列は `null` とする。利用履歴や上限から引き算しない。画面と照合できる原本をアクセス制限した領域に保存する。秘密鍵、APIキー、認証ヘッダーを保存しない。
2. 原本を直接確認した担当者が、下の形式に転記する。観測日時は採取時、キー指紋は実行に使うキーのSHA-256。Free無課金、他利用の排他、未解決送信0は担当者が照合できた場合に入力する。Console原本の目視照合と、運用上の排他確認は署名者の責任で行う。
3. 許可済みの既存応答を使う場合は `source:"groq_headers"` とし、公式の `x-ratelimit-{limit,remaining,reset}-{requests,tokens}` だけを値が文字列のJSONオブジェクトとして保存する。観測日時は応答を受け取った時刻。RPDとTPMだけが取得対象で、RPM・TPDは全項目 `null`。この方法のみでは送信条件を満たさない。現行監査では4項目の現在残量を無消費で取得できる公式APIは確認できていない。
4. オフライン取り込み後、正規化された payload と原本を照合し、証拠署名用のEd25519鍵で署名する。署名対象は payload の JSON.stringify のUTF-8。エンベロープは `{payload,signature}`、署名値はbase64。実行側は `--evidence` と `--artifact` で署名と原本を照合する。原本、転記、署名ファイルはGitに置かない。

```sh
node scripts/rebuild/run-paired-comparison.cjs --action import-evidence \
  --observation /isolated/private/observation.json \
  --artifact /isolated/private/console-capture.pdf
```

```json
{
  "source": "groq_console",
  "verifiedAt": "2026-11-20T08:00:00.000Z",
  "account": {"organization": "example", "project": "example", "credentialSha256": "<64桁のSHA-256>"},
  "model": "openai/gpt-oss-120b",
  "plan": null,
  "billable": null,
  "exclusiveWindow": false,
  "unresolvedSends": null,
  "counters": {
    "rpm": {"limit": null, "remaining": null, "resetAt": null},
    "rpd": {"limit": null, "remaining": null, "resetAt": null},
    "tpm": {"limit": null, "remaining": null, "resetAt": null},
    "tpd": {"limit": null, "remaining": null, "resetAt": null}
  }
}
```

4項目に十分な残量があり、証拠が60秒以内で、リセットまで10秒を超える場合だけ予約に進む。比較経路ではRPM・RPD・TPM・TPDの終了時刻を個別にDBへ登録して照合する。各項目の署名値よりDBの許容残量が大きい場合は停止する。既存のテナント別分枠・日枠も同時に予約する。DBに確認窓を設定するときは、全体の公式残量とローカルの消費・予約を重複計上しない。停止解除には同じ原本照合に加え、未解決試行の根拠付き照合が必要。

GitHub Actionsの検証では使い捨てPostgreSQLに両SQLを適用し、既存送信器のDB呼出しをservice_roleで実行する。テスト用のオーナー識別と模擬トランスポートを使用する。隔離Supabase Authへの接続確認とは別の検証である。

## 実測用の隔離環境と確認順序

1. Docker、Supabase CLI 2.75.0、Node 24、psql がある専用ホストでPRの最終SHAをクリーンにチェックアウトする。テスト手順 `bash scripts/test-comparison-supabase.sh` を先に実行する。テストはSupabase Auth、PostgREST、PostgreSQLをローカルコンテナで起動し、模擬送信で確認後にその環境を破棄する。
2. 実測用はテストと別のローカル作業ディレクトリをホストの永続ディスクに作る。ディレクトリを所有者だけが操作できるようにし、Supabase CLIの `init` と `start` に同じ `--workdir` を指定する。ホストの外側からAPI・DBポートに到達できない状態で運用する。クラウドプロジェクトへのリンクは不要。新規専用DBのループバック接続先を `supabase status` で照合し、`psql -v ON_ERROR_STOP=1` で容量v2と比較専用の既存SQLを順に適用する。
3. 永続ディスクに比較専用の空のジャーナル領域を作り、実行ユーザーだけに読み書きを許可する。専用ローカルAuthで作成した管理者の `app_metadata.urenavi_role` を `owner` に設定し、ログイン済みのJWTをCLI設定へ渡す。JWT・service_roleキーは専用環境の値を使い、ファイルや環境変数で保持する。SQL適用先とジャーナルは使い捨て検証環境と分ける。
4. Groq管理者は既にログインしたConsoleで対象組織とプロジェクトを選び、組織Limits、プロジェクトLimits、Billingを一度照合する。モデル、対象範囲、画面の採取時刻を記録し、表示される場合に限り4項目の現在残量とリセットを保存する。正式な応答ヘッダー原本があればRPD・TPMの証拠として保持する。Free契約の確認と、他の使用主体を排除できる状態の確認は別々に行う。
5. [GroqのRate Limits](https://console.groq.com/docs/rate-limits)が公開するヘッダーにはRPM・TPDの残量とリセットは含まれない。[Projects](https://console.groq.com/docs/projects)で説明されるプロジェクト別の設定にも組織上限が適用される。管理画面に対象モデルの現在残量が表示されなければ、画面取得の反復は不要。上限、使用履歴、プロジェクト分離、ローカル予約、429停止だけでは送信前の4項目の現在残量は確定できない。回避のための試し送信は行わない。


## 独立窓の登録と署名の所要時間

比較用Groqのグローバル窓は、`urenavi_capacity_confirm_window_v2` に `p_tenant=null` と `p_dimension=requests|tokens` を指定して登録する。RPMはminute/requests、RPDはday/requests、TPMはminute/tokens、TPDはday/tokens。非対象軸の上限と外部消費は0。テナント枠は従来の `both` を使う。観測日時と4軸それぞれのリセット時刻を原本から設定する。初回観測時刻をローカルの適用開始時刻にできるが、Groq公式の窓開始を表さない。同じ窓を更新する場合は既に登録した開始時刻を維持する。比較用の旧グローバル合算窓から移る場合は自然失効を待つ。実測用には新規の専用ローカルDBに両SQLを適用する。既存DBへの移行はこの変更に含めていない。

実測前に、クリーンな最終SHA、承認署名、接続、時計、原本の保存先、証拠署名とDB投入の準備を済ませる。模擬原本で採取から送信直前までを計時し、60秒の鮮度と全窓の残り10秒超を満たすことを実測ホストで確認する。本番用原本の採取時刻は固定し、署名時刻で上書きしない。署名・原本照合、予約、送信意図の途中で期限を超えた場合は停止する。未測定の手作業時間を合格扱いしない。

公式確認済みの4軸を方式Aとする。専用キー・全組織の利用主体の管理・保守的予約・単一送信・永続精算・異常停止は方式Bの材料になる。Bで管理できるのは管理下の通信・予約・精算。Groq側の現在残量、課金状態、別経路の消費や最初の429は排除できない。対象アカウント確認や管理者の別承認が欠ける状態は方式Cとし、既存ゲートで送信しない。Bの送信を許可する経路は追加していない。

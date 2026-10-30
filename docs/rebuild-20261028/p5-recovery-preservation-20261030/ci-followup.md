# CI起動経路の限定修正

公開保全0a1168fのVerify Urenavi（run41001360294/job123886262992）がfailure。ログでoffline_guard_requiredを確認。ROOM Copy Regression（run41001360286）はsuccess。

既存ci.ymlはnode --testを直接実行し、offline guardが必須の新版テストに正しい起動条件を渡していなかった。安全条件/テストを削除せず、既存offline.shで中核、regression.shで既存回帰を実行するよう保全ブランチ内だけ変更。

ローカルの同コマンドは中核243/既存461成功・fail0/skip0。実通信しない。その他のROOM Copy Regression workflowは維持。最終commitのGitHub Actions結果は別途取得し、未確認をsuccessとは報告しない。

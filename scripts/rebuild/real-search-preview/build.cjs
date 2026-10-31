'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.join(__dirname,'dist');fs.mkdirSync(out,{recursive:true});
for(const file of fs.readdirSync(root+'/public'))if(file.endsWith('.js'))fs.copyFileSync(root+'/public/'+file,out+'/'+file);
let html=fs.readFileSync(root+'/public/app.html','utf8');
html=html.replace('<html lang="ja">','<html lang="ja" data-completed-core-only="true">');
// Keep real Supabase login. Omit the old device/payment/handoff decorator only in this isolated build.
html=html.replace(/<script src="\/access-guard[^>]*><\/script>/,'');
// Keep verification in the already-open, protected Preview browser. Opening a
// one-use email link elsewhere can consume it before that browser has a session.
// Only Preview guidance changes; the existing SDK verifier and acceptance rules
// remain identical to public/app.html.
html=html.replace('<details style="margin-top:12px;font-size:13px;line-height:1.6">', '<details open style="margin-top:12px;font-size:13px;line-height:1.6">');
html=html.replace('<summary>メールを開いてもログインできない場合</summary>', '<summary>このPreviewのログイン手順</summary>');
html=html.replace('メール内のログインボタンを長押ししてリンクをコピーし、ここに貼り付けてください。このブラウザで認証します。', '最新メールの「Sign in」はタップして開かず、長押ししてリンクをコピーしてください。メール送信に使ったこの画面へ戻り、下の欄に貼り付けて認証してください。すでに開いたリンクは再利用できません。リンクはチャットへ送らないでください。');
html=html.replace('メールに届いたリンクを押すとログインできます。', 'このPreviewでは、未使用のメールリンクを上の欄に貼り付けて認証します。');
html=html.replace('ログインリンクを送信しました。メールを確認して、届いたリンクを押してください。', 'ログインリンクを送信しました。「Sign in」を開かずに長押しでリンクをコピーし、この画面の欄に貼り付けて認証してください。');
// The verified account already has a password. This Preview uses the existing
// password grant to avoid the broken cross-browser email/SSO return path.
// Production app, Auth configuration and Deployment Protection are unchanged.
html=html.replace('<button id="loginBtn" class="authBtn">', '<label for="previewLoginPassword">ウレナビの登録済みパスワード</label><input id="previewLoginPassword" type="password" autocomplete="current-password"><button id="previewPasswordLogin" type="button" class="authBtn">パスワードでログイン</button><p class="authNote">GoogleやVercelのパスワードとは別です。新規発行・変更は行いません。</p><button id="loginBtn" class="authBtn" hidden>');
html=html.replace('<details open style="margin-top:12px;', '<details hidden style="margin-top:12px;');
html=html.replace('ログイン用のリンクをメールで送ります。','このPreviewは登録済みパスワードでログインします。');
html=html.replace('パスワードは不要です。','登録済みパスワードが不明な場合は、推測で繰り返し入力しないでください。');
html=html.replace('このPreviewでは、未使用のメールリンクを上の欄に貼り付けて認証します。','認証メールの再送やリンクのコピーは必要ありません。');
fs.copyFileSync(path.join(__dirname,'password-login.js'),out+'/password-login.js');
html=html.replace('</body>','<script src="/password-login.js"></script></body>');
html=html.replace('{autoAi=true,restored=false,keyword=lastSearchKeyword}={}','{autoAi=false,restored=false,keyword=lastSearchKeyword}={}');
html=html.replace('function aiTargetDecision(item){','function aiTargetDecision(item){ if(document.documentElement.dataset.completedCoreOnly==="true")return {callAi:true,reasons:["completed-cache-only"]};');
html=html.replace('<nav id="urenaviWorkTabs"','<section class="box"><b>実商品検索の限定検証</b><p>本人の実検索は累計2回まで。Groq生成・決済・cronは無効です。新規生成は行わず、完成cacheがない商品は本文を表示しません。</p></section><nav id="urenaviWorkTabs"');
// Passive Preview-only observations: fixed status enums, no credentials, no new Auth calls.
fs.copyFileSync(path.join(__dirname,'auth-observation.js'),out+'/auth-observation.js');
html=html.replace('<script>','<script src="/auth-observation.js"></script><script>');
html=html.replace('storage:window.localStorage','storage:UrenaviAuthObservation.storage(window.localStorage)');
html=html.replace('const authGate=', 'UrenaviAuthObservation.watch(sb.auth);\nconst authGate=');
html=html.replace("if(generation!==accessGeneration) return;\n    if(response.status===401", "UrenaviAuthObservation.access(response.status);\n    if(generation!==accessGeneration) return;\n    if(response.status===401");
html=html.replace('<div id="authMsg"', '<pre id="authObservation" aria-label="Preview認証処理の観測状態">認証処理は未観測です。秘密情報は表示しません。</pre><div id="authMsg"');
let n=0;html=html.replace(/<script>([\s\S]*?)<\/script>/g,(_,code)=>{const file='app-inline-'+(++n)+'.js';fs.writeFileSync(out+'/'+file,code);return '<script src="/'+file+'"></script>';});
fs.writeFileSync(out+'/index.html',html);fs.writeFileSync(out+'/app.html',html);
console.log('Existing app UI, real auth/search, completed-cache-only, no fixture or inference routes.');

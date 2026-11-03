'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),out=path.join(__dirname,'dist');fs.mkdirSync(out,{recursive:true});
for(const file of fs.readdirSync(root+'/public'))if(file.endsWith('.js'))fs.copyFileSync(root+'/public/'+file,out+'/'+file);
let html=fs.readFileSync(root+'/public/app.html','utf8');
html=html.replace('<html lang="ja">','<html lang="ja" data-completed-core-only="true">');
// Keep real Supabase login. Omit the old device/payment/handoff decorator only in this isolated build.
html=html.replace(/<script src="\/access-guard[^>]*><\/script>/,'');
// Preview-only PKCE uses the existing Supabase mail sender and default template.
// The auth code is exchanged by the pinned SDK using this browser's verifier.
// No SMTP, shared template, allowlist or Deployment Protection change is required.
html=html.replace('detectSessionInUrl:true,', "detectSessionInUrl:true,\n      flowType:'pkce',");
html=html.replace('<details style="margin-top:12px;font-size:13px;line-height:1.6">','<details hidden style="margin-top:12px;font-size:13px;line-height:1.6">');
html=html.replace('ログイン用のリンクをメールで送ります。','既存のメール送信でログインします。新しいサービス登録は不要です。');
html=html.replace('メールに届いたリンクを押すとログインできます。','この画面をSafariで開いて送信し、メールのリンクも同じSafariで開いてください。');
html=html.replace('メールのリンクを開いたブラウザでログイン状態が保存されます。','送信を始めたブラウザの確認情報と、メールのリンクの両方で認証します。');
html=html.replace('SafariとGmail内ブラウザなど、別のブラウザ間ではログイン状態は共有されません。','別のブラウザでは認証を完了できません。メールのリンクは送信に使ったSafariで開いてください。');
html=html.replace('ログインリンクを送信しました。メールを確認して、届いたリンクを押してください。','ログインメールを送信しました。メールのリンクを、この画面を開いたSafariで開いてください。リンクやコードをチャットに送らないでください。');
// Use the stable origin, so a unique deployment URL cannot create a verifier
// that the stable callback origin cannot read. Fail closed before any send.
html=html.replace('let sendingLogin=false;', 'let sendingLogin=false;\nlet previewLoginUncertain=false;');
html=html.replace('function updateLoginButton(){', 'function updateLoginButton(){\n  if(previewLoginUncertain){loginBtn.disabled=true;loginBtn.textContent="送信結果が不明です";return;}');
html=html.replace('async()=>{\n\n  if(\n    sendingLogin', 'async()=>{\n\n  if(previewLoginUncertain)return;\n  if(location.origin!=="https://rakuten-affiliate-ai-mobile-git-recovery-u-aa2890-hirobeya-6572.vercel.app"){setAuthMessage("固定の検証URLからログインしてください。","err");return;}\n  if(\n    sendingLogin');
html=html.replace('await sb.auth.signInWithOtp({', 'await authDeadline(sb.auth.signInWithOtp({');
html=html.replace('emailRedirectTo:redirectTo\n      }\n\n    });','emailRedirectTo:redirectTo\n      }\n\n    }),12000);');
// Sanitize only the login-send catch. Timeout/network uncertainty disables
// further sends in this page; getSession still permits a later valid callback.
const sendStart=html.indexOf('loginBtn.onclick='),sendEnd=html.indexOf("loginEmail.addEventListener(",sendStart);
let sendCode=html.slice(sendStart,sendEnd);
sendCode=sendCode.replace(/console\.error\(\s*e\s*\);/g,'');
sendCode=sendCode.replace('const status=', `if(e?.message==='認証確認が時間内に完了しませんでした。'||e?.name==='TypeError'){
      previewLoginUncertain=true;
      setAuthMessage('送信結果を確認できませんでした。自動再送はしません。届いたメールがある場合は同じSafariで開いてください。','err');
      return;
    }
    const status=`);
html=html.slice(0,sendStart)+sendCode+html.slice(sendEnd);
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

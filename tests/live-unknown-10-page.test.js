const fs=require('fs');
const html=fs.readFileSync('public/live-unknown-10.html','utf8');
const must=['電気シェーバー','エアフライヤー','折りたたみ傘','電気ケトル','ネックピロー','ワイヤレスイヤホン','フードプロセッサー','デスクライト','キャリーケース','加湿器','/api/search','/api/room-ai','buildValidatedProductPost','owner限定','safeKeywordIdentity','search_keyword_grounded','ai?.data?.validation','validationReasons'];
for(const s of must){if(!html.includes(s))throw new Error('missing '+s);}
if((html.match(/KEYWORDS=\[/g)||[]).length!==1)throw new Error('keyword list missing');
if(html.includes('このページをSafariで'))throw new Error('browser-specific guidance remains');
console.log('live unknown 10 page test: PASS');

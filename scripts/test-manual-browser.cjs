const {chromium,devices}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const base=process.cwd();
process.env.VERCEL_ENV='preview';
const authorize=async()=>({ok:true,plan:'owner'});
const endpoint=require(path.join(base,'lib/manual-room-copy')).createHandler({authorizeUser:authorize});
const serverRequests=[];
const blockedTransport=[];
global.fetch=async url=>{blockedTransport.push(String(url));throw Error('unexpected_external_transport');};
const fixture=require(path.join(base,'docs/evaluations/20261120-source-relations/manual-inputs.json'))[4];
const server=http.createServer(async(req,res)=>{
 let url=new URL(req.url,'http://localhost');
 serverRequests.push(url.pathname);
 const json=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
 if(url.pathname==='/api/runtime-env')return json(200,{preview:true,manualOnly:false});
 if(url.pathname==='/api/access')return json(200,{ok:true,plan:'owner',pro:true});
 if(url.pathname==='/api/manual-room-copy'){
  let payload='';for await(const chunk of req)payload+=chunk;
  req.body=JSON.parse(payload);
  return endpoint(req,{setHeader:res.setHeader.bind(res),status:code=>({json:body=>json(code,body)})});
 }
 if(url.pathname.startsWith('/api/'))return json(403,{message:'unexpected API request'});
 const target=path.join(base,'public',url.pathname);
 if(!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',url.pathname.endsWith('.js')?'application/javascript':url.pathname.endsWith('.json')?'application/json':'text/html');
 res.end(fs.readFileSync(target));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.URENAVI_CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox']});
  const context=await browser.newContext({...devices['iPhone 13'],permissions:['clipboard-read','clipboard-write']});
  const banned=[], navigations=[];
  await context.route('**/*',async route=>{
   const u=route.request().url();
   if(u.startsWith(origin+'/'))return route.continue();
   if(u.startsWith('https://cdn.jsdelivr.net/npm/@supabase/'))return route.fulfill({contentType:'application/javascript',body:`window.supabase={createClient(){return {auth:{async getSession(){return {data:{session:{access_token:'fixture-only',user:{email:'fixture@example.invalid',last_sign_in_at:new Date().toISOString()}}},error:null}},onAuthStateChange(){},async signInWithOtp(){},async signOut(){}}}}}`});
   if(u==='https://room.rakuten.co.jp/'&&route.request().isNavigationRequest()){
    navigations.push(u);return route.fulfill({body:'ROOM navigation stub'});
   }
   banned.push(u);return route.abort();
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/app.html?mode=manual');
  await page.locator('#manualName').waitFor({state:'visible'});
  assert.equal(await page.locator('#urenaviWorkTabs').isVisible(),false);
  await page.locator('#manualName').fill(fixture.itemName);
  await page.locator('#manualDescription').fill(fixture.itemCaption);
  await page.locator('#manualPrice').fill(String(fixture.itemPrice));
  await page.locator('#manualProductForm button').click();
  const out=page.locator('#manualProductResult');
  await out.waitFor({state:'visible'});
  assert.match(await out.inputValue(),/直径6mm以下/);
  await page.locator('#manualProductCopy').click();
  await page.getByText('コピーしました。',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),await out.inputValue());
  const popupPromise=context.waitForEvent('page');
  await page.locator('#manualRoomHome').click();
  const popup=await popupPromise; await popup.waitForLoadState();
  assert.deepEqual(navigations,['https://room.rakuten.co.jp/']);
  assert.deepEqual(blockedTransport,[]);
  assert.deepEqual(banned,[]);
  assert.deepEqual(errors,[]);
  assert.ok(serverRequests.filter(p=>p.startsWith('/api/')).every(p=>['/api/access','/api/runtime-env','/api/manual-room-copy'].includes(p)),serverRequests.join(','));
  console.log(JSON.stringify({viewport:page.viewportSize(),apiRequests:serverRequests.filter(p=>p.startsWith('/api/')),externalRequests:0,clipboard:true,roomNavigationStub:true,generated:await out.inputValue()}));
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

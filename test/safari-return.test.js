const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const state=require('../public/return-state');
function storage(){const data=new Map();return {setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)||null,removeItem:k=>data.delete(k)};}
const saved={email:'buyer@example.test',items:[{itemName:'ゼルダの伝説',itemPrice:8980}],fields:{k:'ゼルダ',sort:'standard'},platforms:['threads'],scrollY:750};
test('a newly loaded document can restore results, form, selected platform and scroll position',()=>{
  const disk=storage();assert.equal(state.save(disk,saved,1000),true);
  assert.deepEqual(state.load(disk,saved.email,2000),{...saved,at:1000});
});
test('saved results cannot restore under another account or after expiry',()=>{
  const disk=storage();state.save(disk,saved,1000);
  assert.equal(state.load(disk,'other@example.test',2000),null);
  state.save(disk,saved,1000);assert.equal(state.load(disk,saved.email,1000+30*60*1000+1),null);
});
test('storage unavailable, corrupted or oversized does not block navigation',()=>{
  const blocked={setItem(){throw Error('quota');},getItem(){throw Error('disabled');},removeItem(){throw Error('disabled');}};
  assert.equal(state.save(blocked,saved),false);assert.equal(state.load(blocked,saved.email),null);
  const disk=storage();assert.equal(state.save(disk,{...saved,items:[{itemName:'x'.repeat(500001)}]}),false);
  assert.equal(state.load({getItem:()=>'{bad',removeItem(){}},saved.email),null);
});
test('logout clears remembered results',()=>{
  const disk=storage();state.save(disk,saved);state.clear(disk);assert.equal(state.load(disk,saved.email),null);
});
const html=fs.readFileSync(path.join(__dirname,'../public/room-bridge.html'),'utf8');
function bridge(){
  const actions=[];const handlers={};const links=[];
  const open={style:{}};links.push(open);
  const nodes={openRoom:open,back:{addEventListener:(name,cb)=>handlers[name]=cb},'.msg':{},'.card':{appendChild:el=>links.push(el)}};
  const context=vm.createContext({URL,URLSearchParams,location:{search:'?to='+encodeURIComponent('https://room.rakuten.co.jp/search/item?keyword=ゼルダ'),replace:url=>actions.push(url)},document:{getElementById:id=>nodes[id],querySelector:s=>nodes[s],createElement:()=>({})},window:{addEventListener(){}},setTimeout:cb=>cb(),history:{length:3,back:()=>actions.push('back')}});
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
  return {actions,handlers,links};
}
test('return bridge cannot relaunch ROOM on a cold history return or reload',()=>{
  for(let i=0;i<3;i++){
    const page=bridge();assert.deepEqual(page.actions,[]);
    assert.equal(new URL(page.links[0].href).searchParams.get('keyword'),'ゼルダ');
    assert.equal(page.links[0].target,'_self');
    assert.equal(page.links[0].rel,'noopener noreferrer');
    assert.deepEqual(page.handlers,{});
    assert.match(html,/id="back" href="\/app.html"/);
  }
});

test('both rendered ROOM actions use native same-tab history without a script interceptor',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');
  const functions=app.slice(app.indexOf('function roomSearchUrl('),app.indexOf('function hist('));
  const context=vm.createContext({URLSearchParams,esc:s=>s.replace(/&/g,'&amp;').replace(/"/g,'&quot;')});
  vm.runInContext(functions,context);
  const link=context.roomAction({itemName:'ゼルダの伝説'});
  assert.match(link,/target="_self"/);
  assert.match(link,/rel="noopener noreferrer"/);
  assert.match(link,/href="https:\/\/room\.rakuten\.co\.jp\/search\/item\?/);
  assert.equal((app.match(/\$\{roomAction\(i\)\}/g)||[]).length,2);
});

for(const browser of ['iPhone Safari','iPhone Chrome','ChatGPT iPhone','PC Chrome']){
  test(`${browser}: entry and lifecycle never force another browser or programmatic navigation`,()=>{
    const actions=[];const events={};const nodes={normalBtn:{}};
    const window={document:{createElement:()=>({}),head:{appendChild(){}},addEventListener:(name,fn)=>{events[name]=fn;}},navigator:{userAgent:browser},location:{origin:'https://preview.example',search:'?activated=1',assign:u=>actions.push(u),replace:u=>actions.push(u)},addEventListener:(name,fn)=>{events[name]=fn;},bootAuth:()=>{}};
    const originalAuth=window.bootAuth;
    const context=vm.createContext({window,URL,URLSearchParams,document:{getElementById:id=>nodes[id]},location:window.location,navigator:window.navigator});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/return-state.js'),'utf8'),context);
    assert.equal(window.bootAuth,originalAuth);
    assert.equal(events.click,undefined);
    assert.equal(events.pageshow,undefined);
    assert.equal(events.visibilitychange,undefined);
    const entry=fs.readFileSync(path.join(__dirname,'../public/open-app.html'),'utf8');
    vm.runInContext(entry.match(/<script>([\s\S]*?)<\/script>/)[1],context);
    assert.equal(nodes.normalBtn.href,'https://preview.example/app.html?activated=1');
    assert.deepEqual(actions,[]);
    assert.doesNotMatch(entry,/userAgent|x-safari|intent:|_blank|location\.(replace|assign)/);
  });
}

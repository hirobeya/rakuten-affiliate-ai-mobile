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
  const nodes={back:{addEventListener:(name,cb)=>handlers[name]=cb},'.msg':{},'.card':{appendChild:el=>links.push(el)}};
  const context=vm.createContext({URL,URLSearchParams,location:{search:'?to='+encodeURIComponent('https://room.rakuten.co.jp/search/item?keyword=ゼルダ'),replace:url=>actions.push(url)},document:{getElementById:id=>nodes[id],querySelector:s=>nodes[s],createElement:()=>({})},window:{addEventListener(){}},setTimeout:cb=>cb(),history:{length:3,back:()=>actions.push('back')}});
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
  return {actions,handlers,links};
}
test('return bridge cannot relaunch ROOM on a cold history return or reload',()=>{
  for(let i=0;i<3;i++){
    const page=bridge();assert.deepEqual(page.actions,[]);
    assert.equal(new URL(page.links[0].href).searchParams.get('keyword'),'ゼルダ');
    page.handlers.click({preventDefault(){}});assert.deepEqual(page.actions,['/app.html']);
  }
});

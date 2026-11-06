'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('isolated search starts completed reads and changed candidate order reloads completed reads',()=>{
 const elements=new Map(),renders=[],listeners={};let tabClicks=0;
 const node=id=>{if(!elements.has(id))elements.set(id,{style:{},value:'',textContent:'',replaceChildren(){}});return elements.get(id);};
 const items=[{itemCode:'synthetic:a'},{itemCode:'synthetic:b'}];
 const context={window:{AppIsolation:{owner:'fixture-a'},AppFixtureItems:items,initRoomOutcomes(){},roomOutcomePosted:()=>false,addEventListener:(name,fn)=>{listeners[name]=fn;}},document:{createElement:()=>({}),getElementById:node,querySelector:()=>({click(){tabClicks++;}})},authGate:node('authGate'),appRoot:{style:{},prepend(){}},userMail:node('userMail'),k:{value:'ケトル'},aiRunGeneration:0,aiRoomResults:new Map(),aiRoomReviews:new Map(),lastSearchItems:[],render:(rows,options)=>{renders.push({rows,options});context.lastSearchItems=rows;},$:selector=>node(selector.slice(1))};
 vm.runInNewContext(fs.readFileSync(require.resolve('../../scripts/rebuild/app-preview/boot.js'),'utf8'),context);
 node('go').onclick();
 assert.equal(renders.length,1);assert.equal(renders[0].options.autoAi,true);assert.equal(tabClicks,1);
 assert.notEqual(renders[0].rows[0],items[0]);
 listeners['room-outcomes-change']();assert.equal(renders.length,1);
 context.window.roomOutcomePosted=item=>item.itemCode==='synthetic:a';listeners['room-outcomes-change']();
 assert.equal(renders.length,2);assert.equal(renders[1].options.autoAi,true);
});

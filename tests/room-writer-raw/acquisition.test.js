'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),A=require('../../lib/room-writer-raw/acquisition'),S=require('../../lib/room-writer-raw/source');
const sha='a'.repeat(40),observedAt='2026-11-11T09:00:00.000Z';
const item=()=>({itemCode:'merchant:123',itemName:'収納ケース',itemCaption:'先頭。'+'あ'.repeat(1300)+'\n■モデル別\n上位モデルのみ約3kg。別売部品は非対応。',catchcopy:'  原文\nのまま  ',itemPrice:1200,itemUrl:'https://item.rakuten.co.jp/merchant/case/',mediumImageUrls:[{imageUrl:'https://example.com/image.jpg'}]});
const capture=i=>A.fromResponse({body:JSON.stringify({items:[i]}),itemCode:i.itemCode,observedAt,executionSha:sha});
test('API body and all fields survive beyond 1200 characters without normalization or image input',()=>{
 const i=item(),r=capture(i);assert.equal(r.localTruncation,false);assert.equal(r.source.itemCaption,i.itemCaption);assert.equal(r.source.catchcopy,i.catchcopy);
 assert.equal(r.fields.itemCaption.utf16Length,i.itemCaption.length);assert.deepEqual(r.originalItem,i);assert.equal(r.responseHash,S.hash(r.originalBody));
 assert(!Object.hasOwn(r.source,'mediumImageUrls'));assert.equal(A.verify(r),true);
 assert.equal(A.verify({...r,source:{...r.source,itemCaption:i.itemCaption.slice(0,1200)}}),false);
});
test('absent, empty and null catchcopy retain distinct original states',()=>{
 const i=item();delete i.catchcopy;const missing=capture(i);assert.equal(missing.held,true);assert.equal(missing.fields.catchcopy.present,false);assert(!Object.hasOwn(missing.originalItem,'catchcopy'));
 const empty=capture({...i,catchcopy:''});assert.equal(empty.held,false);assert.equal(empty.fields.catchcopy.utf16Length,0);
 const nil=capture({...i,catchcopy:null});assert.equal(nil.held,true);assert.equal(nil.fields.catchcopy.type,'null');assert.equal(A.verify(nil),true);
});
test('oversized and ambiguous sources are held with the original retained, not cut',()=>{
 const i=item();i.itemCaption='あ'.repeat(7000);const r=capture(i);assert.equal(r.held,true);assert.equal(r.reason,'raw_source_too_long_no_truncation');assert.equal(r.originalItem.itemCaption.length,7000);
 assert.throws(()=>A.fromResponse({body:JSON.stringify({items:[item(),item()]}),itemCode:i.itemCode,observedAt,executionSha:sha}),/exactly_one/);
});
test('exact item and URL are checked without interpreting price as selected-model price',()=>{
 const r=capture({...item(),itemUrl:'https://evil.example/merchant/x'});assert.equal(r.held,true);assert.equal(r.reason,'rakuten_item_url_mismatch');
 const x=capture(item());assert.equal(x.sellerPageCompleteness,'unverified');assert.equal(x.source.itemPrice,1200);
 assert.throws(()=>A.fromResponse({body:JSON.stringify({items:[item()]}),itemCode:'merchant:456',observedAt,executionSha:sha}),/identity_mismatch/);
});
test('one Rakuten request, no retry, no credential echo or raw upstream error disclosure',async()=>{
 let calls=0;const credentials={appId:'private-app-identifier',accessKey:'private-access-value'};
 const good=await A.fetchItem({itemCode:'merchant:123',credentials,executionSha:sha,fetchImpl:async(url,options)=>{calls++;assert.equal(url.origin,'https://openapi.rakuten.co.jp');assert.equal(options.redirect,'error');assert.equal(options.headers.accessKey,credentials.accessKey);return new Response(JSON.stringify({items:[item()]}),{status:200});}});
 assert.equal(calls,1);assert.equal(A.verify(good),true);assert(!JSON.stringify(good).includes(credentials.appId));
 for(const status of [429,500]){let n=0;await assert.rejects(A.fetchItem({itemCode:'merchant:123',credentials,executionSha:sha,fetchImpl:async()=>{n++;return new Response('do not disclose',{status});}}),/rakuten_(429_stop|http_500)/);assert.equal(n,1);}
 const echo=await A.fetchItem({itemCode:'merchant:123',credentials,executionSha:sha,fetchImpl:async()=>new Response(JSON.stringify({items:[item()],echo:credentials.accessKey}))});
 assert.equal(A.verify(echo),true);assert.deepEqual(echo.originalItem,item());assert.equal(echo.wireResponse.retained,false);assert(!JSON.stringify(echo).includes(credentials.accessKey));
 const tracked=await A.fetchItem({itemCode:'merchant:123',credentials,executionSha:sha,fetchImpl:async()=>new Response(JSON.stringify({items:[{...item(),affiliateUrl:'https://example.com/?key='+credentials.accessKey}]}))});
 assert.equal(A.verify(tracked),true);assert.equal(tracked.source.itemCaption,item().itemCaption);assert(!JSON.stringify(tracked).includes(credentials.accessKey));assert.deepEqual(tracked.responseProjection.omittedCredentialEchoFields,['affiliateUrl']);
 const query=await A.fetchItem({itemCode:'merchant:123',credentials,executionSha:sha,fetchImpl:async()=>new Response(JSON.stringify({items:[{...item(),itemUrl:item().itemUrl+'?accessKey='+credentials.accessKey}]}))});
 assert.equal(A.verify(query),true);assert.equal(query.source.itemCaption,item().itemCaption);assert.equal(query.source.itemUrl,item().itemUrl);assert.equal(query.fields.itemUrl.preserved,false);assert.equal(query.responseProjection.itemUrlProjection.originalPlaintextRetained,false);assert(!JSON.stringify(query).includes(credentials.accessKey));
 assert.equal(A.verify({...query,fields:{...query.fields,itemUrl:{...query.fields.itemUrl,preserved:true}}}),false);
 await assert.rejects(A.fetchItem({itemCode:'merchant:123',credentials,executionSha:sha,fetchImpl:async()=>new Response(JSON.stringify({items:[{...item(),itemUrl:'https://item.rakuten.co.jp/merchant/'+credentials.accessKey}]}))}),/refuse_export/);
 await assert.rejects(A.fetchItem({itemCode:'merchant:123',credentials,executionSha:sha,fetchImpl:async()=>new Response(JSON.stringify({items:[{...item(),itemCaption:credentials.accessKey}]}))}),/refuse_export/);
});

'use strict';
// Replay only; quality decisions are saved separately by the independent reviewer.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const A=require('../../lib/room-writer-raw/acquisition'),S=require('../../lib/room-writer-raw/source'),C=require('../../lib/room-writer-raw/contract'),Q=require('../../lib/room-writer-raw/local-quality'),E=require('../../lib/urenavi-core/last-resort');
assert(process.execArgv.some(x=>x.includes('offline-guard.cjs')),'offline guard required');
const dir=path.resolve(__dirname,'../../docs/experiments/raw-source-fallback-20261111/acquisition-20261111');
const report=JSON.parse(fs.readFileSync(path.join(dir,'api-capture-final.json'),'utf8'));assert.equal(report.generationCalls,0);
const out=path.join(dir,'fresh-products');fs.mkdirSync(out,{recursive:false});const rows=[];
for(const [i,record]of report.captures.entries()){
 assert(A.verify(record),'captured original/field digest mismatch');
 if(record.held){rows.push({itemCode:record.originalItem.itemCode,status:'source_held',reason:record.reason});continue;}
 const envelope=S.prepare(record.originalItem),local=E.generate(envelope.source),packet=Q.packet({source:envelope.source,sourceHash:envelope.sourceHash,local,mode:'normal'}),bundle=C.build(envelope);
 assert.equal(envelope.sourceHash,record.sourceHash);assert.equal(local.groqCalls,0);
 const detail={acquisitionReference:'api-capture-final.json#/captures/'+i,apiFieldRetention:record.fields,source:envelope.source,sourceHash:envelope.sourceHash,local,qualityPacket:packet,
  text:local.result?.quality?.text??null,characterCount:local.result?.quality?.text?Array.from(local.result.quality.text).length:null,qualityState:'unverified',
  requestHeld:bundle.held,requestHoldReason:bundle.reason??null,inputEstimate:bundle.inputEstimate,reservation:bundle.reservation,inputHash:bundle.inputHash??null,requestHash:bundle.requestHash??null,groqCalls:0};
 fs.writeFileSync(path.join(out,String(i+1).padStart(2,'0')+'.json'),JSON.stringify(detail,null,2)+'\n',{flag:'wx'});
 rows.push({number:i+1,itemCode:record.source.itemCode,sourceHash:record.sourceHash,text:detail.text,diagnostic:local.diagnostic,requestHeld:bundle.held,reservation:bundle.reservation});
}
fs.writeFileSync(path.join(dir,'fresh-replay.json'),JSON.stringify({mode:'offline_only',groqCalls:0,qualityNotAutomaticallyDecided:true,rows},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(rows));

'use strict';

const fs=require('node:fs');
const {prepareReport,fixedInputs,prepareArm,prepareReview,MODEL}=require('../../lib/urenavi-core/generation-comparison');
const index=require('../../docs/evaluations/20261120-multi-sentence/frozen-index.json');
const {parseArgs}=require('node:util');

const {values}=parseArgs({options:{
 inputs:{type:'string'},item:{type:'string'},arm:{type:'string'},'writer-receipt':{type:'string'},receipts:{type:'string'},evaluations:{type:'string'},rates:{type:'string'},out:{type:'string'}
}});
if(!values.inputs)throw Error('Supply --inputs with the 20 fixed originals');
const read=name=>values[name]?JSON.parse(fs.readFileSync(values[name],'utf8')):undefined;
function run(){
 const inputs=read('inputs');
 if(!values.item&&!values.arm&&!values['writer-receipt'])return prepareReport(index,inputs,{
  receipts:read('receipts'),evaluations:read('evaluations'),rates:read('rates')
 });
 if(!values.item||!values.arm||!values.out)throw Error('Supply --item, --arm and --out for a request envelope');
 const record=fixedInputs(index,inputs).find(row=>row.item.itemCode===values.item);
 if(!record)throw Error('requested_item_not_in_fixed_manifest');
 const plan=prepareArm(record,values.arm);
 if(plan.stop)throw Error(plan.stop);
 const receipt=read('writer-receipt');
 const metadata={itemCode:record.item.itemCode,sourceHash:record.sourceHash,arm:plan.arm,model:MODEL,
  liveAuthorized:false};
 if(!receipt)return {...metadata,stage:'generate',attemptId:plan.attemptIds.writer,...plan.writer};
 if(receipt.itemCode!==record.item.itemCode||receipt.arm!==plan.arm||receipt.sourceHash!==record.sourceHash||
    receipt.model!==MODEL||receipt.writerRequestHash!==plan.writer.requestHash)throw Error('writer_receipt_mismatch');
 const next=prepareReview(record,plan,receipt.draft);
 if(!next.ok)throw Error(next.reason);
 return {...metadata,stage:'verify',attemptId:plan.attemptIds.review,...next.request};
}
const json=JSON.stringify(run(),null,2)+'\n';
if(values.out)fs.writeFileSync(values.out,json);
else process.stdout.write(json);

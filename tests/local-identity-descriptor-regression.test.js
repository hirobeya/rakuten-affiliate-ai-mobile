'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {isDescriptorIdentity,isNonWholeProductIdentity}=require('../lib/local-identity-role-guard');
const {evidenceBackedLeadingIdentity}=require('../lib/local-semantic-composer');
const {localZeroCall}=require('../api/room-ai-v3');

test('cordless is a specification, never a whole-product identity',()=>{
  assert.equal(isDescriptorIdentity('コードレス'),true);
  assert.equal(isNonWholeProductIdentity('コードレス','真空パック機 コードレス 充電式'),true);
});

test('semantic composer never promotes cordless as the product identity',()=>{
  const local=evidenceBackedLeadingIdentity({
    itemName:'真空パック器 コードレス 充電式 真空パック機 フードシーラー Type-C フードシーラー',
    itemCaption:''
  });
  assert.notEqual(local?.canonicalIdentity,'コードレス');
});

test('whole local route never publishes cordless as product identity',()=>{
  const result=localZeroCall({
    itemCode:'identity-descriptor:vacuum-sealer',
    itemName:'真空パック器 コードレス 充電式 真空パック機 フードシーラー Type-C フードシーラー',
    itemCaption:'',
    itemPrice:0
  });
  assert.notEqual(result?.productType?.specific,'コードレス');
});

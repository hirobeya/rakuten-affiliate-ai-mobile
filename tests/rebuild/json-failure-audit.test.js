'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../../lib/urenavi-core/contracts'),{fixture}=require('./fixture.cjs'),{audit,schemaAudit}=require('../../scripts/rebuild/json-failure-audit.cjs');
test('frozen wire already uses strict mode; writer and review satisfy documented closed required object rules',()=>{
 const a=audit();assert.equal(a.wireHash,'351242d9c86b14994760b18621496db1f195f9d1f657db6317bb40f3062648b4');assert.equal(a.strict,true);assert.equal(a.maxCompletionTokens,1000);assert.equal(a.reasoningEffort,'medium');assert.deepEqual(a.writer.issues,[]);assert.deepEqual(a.review.issues,[]);assert.equal(a.writer.providerAcceptanceProven,false);
 assert.equal(a.shapeWitness.schemaValid,true);assert.equal(a.syntheticFixture.schemaValid,true);assert.equal(a.syntheticFixture.tokens,715);assert.deepEqual(a.schemaSentenceRange,[1,4]);
});
test('schema audit detects optional and open objects rather than silently weakening schema for strict mode',()=>{
 const s=structuredClone(C.WRITE_SCHEMA);s.required=['product'];s.properties.product.additionalProperties=true;
 assert.ok(schemaAudit(s).issues.some(x=>x.includes('required_mismatch')));assert.ok(schemaAudit(s).issues.some(x=>x.includes('object_not_closed')));
});
test('existing writer contract rejects missing fields, wrong types, extra fields and unfinished structures',()=>{
 for(const mutate of [d=>delete d.product.acts_on,d=>d.sentences='text',d=>d.secret='unexpected',d=>delete d.plan.bindings]){const d=fixture().draft;mutate(d);assert.equal(C.validSchema(d,C.WRITE_SCHEMA),false);assert.equal(C.inspect(fixture().item,d).ok,false);}
});

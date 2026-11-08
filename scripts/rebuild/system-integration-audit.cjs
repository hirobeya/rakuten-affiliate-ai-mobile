'use strict';
// Read-only source-backed integration readiness audit. Never enables routes,
// reads credentials, queries payment systems, uses Groq or changes DB state.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const file=p=>fs.readFileSync(path.join(root,p),'utf8');
function audit(){
 const v=JSON.parse(file('vercel.json'));
 const endpoint=file('api/room-ai-v3.js');
 const copy=file('lib/room-copy-handler.js');
 const app=file('public/app.html');
 const transport=file('public/room-preview-request.js');
 const safety=file('public/room-copy-result.js');
 const search=file('api/search.js');
 const evidence=JSON.parse(file('docs/rebuild-20261028/p3-local-first-20261108/evaluation.json'));
 const rewrite=v.rewrites.find(x=>x.source==='/api/room-copy');
 const routeMapped=rewrite?.destination==='/api/room-ai-v3?urenaviContract=1';
 const routeDelegates=endpoint.includes("req.query?.urenaviContract==='1'")&&endpoint.includes("require('../lib/room-copy-handler')(req,res)");
 const browserUsesRoute=transport.includes("fetchImpl('/api/room-copy'");
 const productionBlocked=copy.includes("if(process.env.VERCEL_ENV!=='preview')return res.status(404)");
 const ownerOnly=copy.includes("auth.plan!=='owner'");
 const reviewedResultRequired=safety.includes("result.quality?.machine?.ok!==true")&&safety.includes("result.quality?.review?.ok!==true")&&safety.includes("result.variants[0].text!==text");
 const authVisible=app.includes('currentAppSession');
 const searchSuppliesFullSource=search.includes('boundedSource(x.itemCaption,12000)')&&search.includes('boundedSource(x.catchcopy,500)');
 const uiSearchCarriesSource=app.includes("itemCaption:String(item?.itemCaption||'')")&&app.includes("catchcopy:String(item?.catchcopy||'')");
 const resultRecorded=app.includes('roomOutcomePosted')&&app.includes('room-record-restore.js');
 const validationRows=evidence.rows||[];
 const measured={frozenProducts:validationRows.length,previousReady:validationRows.filter(x=>!!x.before).length,currentReady:validationRows.filter(x=>!!x.after).length};
 const contracts=[
  {id:'route_to_backend',observed:routeMapped&&routeDelegates&&browserUsesRoute,scope:'static_source'},
  {id:'original_source_passed',observed:searchSuppliesFullSource&&uiSearchCarriesSource,scope:'static_source'},
  {id:'reviewed_copy_gate',observed:reviewedResultRequired,scope:'static_source'},
  {id:'login_and_outcome_code_present',observed:authVisible&&resultRecorded,scope:'static_source_only'},
  {id:'paid_customer_production_copy_eligible',observed:!productionBlocked&&!ownerOnly,scope:'actual_handler_guard'}
 ];
 const blockers=[
  ...(productionBlocked?['production_ai_route_returns_404']:[]),
  ...(ownerOnly?['ai_generation_owner_only']:[]),
  'six_axis_appeal_quality_not_proven',
  'new_editorial_writer_not_enabled_for_ordinary_customers',
  'paid_subscriber_real_iphone_full_journey_not_accepted',
  'live_model_comparison_and_cost_not_measured'
 ];
 return {version:1,source:'repository_static_audit_plus_stored_frozen_results',contracts,measured,
  blockers,launchReady:false,qualityCertified:false,productionChanged:false,
  note:'Presence of code is NOT a live iPhone, user, subscription, payment, accessibility or production test.'};
}
if(require.main===module)console.log('URENAVI_SYSTEM_INTEGRATION_AUDIT '+JSON.stringify(audit()));
module.exports={audit};

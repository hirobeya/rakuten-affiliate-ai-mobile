'use strict';
// Operator-only CLI. Does not load .env, contact Console, deploy, or publish copy.
const fs=require('node:fs'),path=require('node:path');
const R=require('../../lib/urenavi-core/calibration-runner'),L=require('../../lib/urenavi-core/live-calibration');
async function main(){
 if(process.argv.length!==3||!path.isAbsolute(process.argv[2]))throw Error('absolute_snapshot_file_required');
 const facts=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 // Refuse credentials in the nonsecret snapshot. The operator supplies the process env privately.
 if(!facts||Object.keys(facts).some(k=>!['grant','evidence','account','isolation'].includes(k)))throw Error('snapshot_contract');
 const source=require('../../docs/rebuild-20261028/p3-first-call-gate/first-call-plan.json').selected.source;
 L.validate({...facts,directory:L.STATE_DIRECTORY,wireHash:L.WIRE_HASH,now:Date.now(),calibrationProfile:'first-call-1000',liveAuthorization:L.authorizationFromEnvironment,mockAuthentication:null});
 if(!process.env.GROQ_API_KEY)throw Error('runtime_authentication_not_connected');
 const result=await R.run({...facts,directory:L.STATE_DIRECTORY,item:source,runtimeMode:'live-calibration',calibrationProfile:'first-call-1000',liveAuthorization:L.authorizationFromEnvironment});
 process.stdout.write(JSON.stringify(result)+'\n');
}
main().catch(()=>{process.stderr.write('calibration_not_completed_inspect_usage_only_journals_do_not_retry\n');process.exitCode=1;});

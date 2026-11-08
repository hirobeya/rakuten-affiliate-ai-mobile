'use strict';
// Pure reservation calculator. A successful calculation does not acquire a
// claim or authorize transport. The existing durable ledger remains required.
function fail(){throw Error('editorial_budget_unverified');}
function nat(n){if(!Number.isSafeInteger(n)||n<0)fail();return n;}
function reserve({plan,account,owner,organization,now=Date.now()}){
 if(!plan||!account||account.plan!=='Free'||account.paidFallback!==false||account.currentLimitsVerified!==true||account.allCallerUsageVerified!==true||account.observedAt>now||account.validUntil<=now||account.validUntil-account.observedAt>60000)fail();
 nat(now);nat(account.observedAt);nat(account.validUntil);if(!nat(account.maxOutput)||!nat(account.maxPerRequest))fail();
 const stages=['writer','review','additional'];
 const allocation={};let tokens=0,requests=0,money=0;
 for(const stage of stages){const p=plan[stage];if(!p||!['local','groq','none'].includes(p.provider))fail();
  if(stage==='writer'&&p.provider!=='groq'||stage==='review'&&p.provider==='none')fail();
  const calls=nat(p.calls),input=nat(p.inputUpperTokens),output=nat(p.outputLimit),cost=nat(p.moneyUpperNanoUsd);
  if(p.provider!=='groq'&&(calls||input||output||cost))fail();
  if(p.provider==='groq'&&(!calls||!input||!output||output>account.maxOutput||input+output>account.maxPerRequest))fail();
  if(stage==='writer'&&calls!==1||stage==='additional'&&calls!==0)fail();
  if(account.plan==='Free'&&cost!==0)fail();
  const total=nat(calls*(input+output));requests=nat(requests+calls);tokens=nat(tokens+total);money=nat(money+cost);
  allocation[stage]={requests:calls,tokens:total,moneyUpperNanoUsd:cost};
 }
 for(const scope of [owner,organization]){
  if(!scope||typeof scope.id!=='string'||!scope.id.trim()||scope.dayId!==new Date(now).toISOString().slice(0,10)||scope.monthId!==new Date(now).toISOString().slice(0,7)||scope.unknownConsumption!==false||scope.pendingWrites!==false)fail();
  for(const [kind,amount] of [['requests',requests],['tokens',tokens],['money',money]]){
   for(const window of kind==='money'?['month']:['minute','day']){
    const b=scope[window]?.[kind];if(!b||nat(b.spent)+nat(b.held)+amount>nat(b.limit))fail();
   }
  }
 }
 // Include account limits even if application-scope limits were configured higher.
 for(const [kind,amount] of [['requests',requests],['tokens',tokens]])for(const window of ['minute','day']){
  const b=account[window]?.[kind];if(!b||nat(b.spent)+nat(b.held)+amount>nat(b.limit))fail();
 }
 return {status:'reservation_calculated_not_acquired',tokens,requests,moneyUpperNanoUsd:money,allocation,sendPermission:false,paidFallback:false};
}
module.exports={reserve};

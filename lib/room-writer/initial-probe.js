
'use strict';
// Explicit administrator exception for one initial experimental request only.
// Unknown provider capacity stays null; this is a reservation, not a balance.
function initialProbeBudget({approved=false,priorAttempts,inputEstimate,outputReserve}={}){
 const reserved=inputEstimate+outputReserve;
 if(approved!==true||priorAttempts!==0)return {allow:false,reason:'initial_probe_not_authorized_or_already_attempted'};
 if(!Number.isSafeInteger(inputEstimate)||inputEstimate<0||outputReserve!==2000||reserved>5061)return {allow:false,reason:'initial_probe_reservation_exceeded'};
 return {allow:true,reason:'one_explicitly_approved_initial_attempt',reserved,remainingMinute:null,remainingDaily:null};
}
module.exports={initialProbeBudget};

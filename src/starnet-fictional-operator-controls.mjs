/**
 * Offline fictional review and irreversible exercise stop controls.
 *
 * Strictly fabricated inputs; cannot authorize brokerage, wallet, provider
 * or blockchain execution. No network, account access or real dispatch.
 */
import {deliverFictionalExecutionMessage} from './starnet-fictional-message-emulator.mjs';

const fail=reason=>{throw new TypeError('Fictional operator control refused: '+reason);};
const exact=(v,fields)=>v!==null&&typeof v==='object'&&
  Object.getPrototypeOf(v)===Object.prototype&&
  Reflect.ownKeys(v).length===fields.length&&fields.every(k=>Object.hasOwn(v,k));
const reviewFields=['schema','scope','reviewId','messageId','action','reason','operator'];
const stopFields=['schema','scope','stopId','reason','operator'];
const reviewPattern=/^SIM-REVIEW-[A-Z0-9]+(?:-[A-Z0-9]+){0,3}$/;
const stopPattern=/^SIM-STOP-[A-Z0-9]+(?:-[A-Z0-9]+){0,3}$/;
const messagePattern=/^SIM-MSG-[A-Z0-9]{1,12}(?:-[A-Z0-9]{1,12}){0,2}$/;
const safeId=(x,regex)=>typeof x==='string'&&x.length<=64&&regex.test(x);
export const FICTIONAL_REVIEW_OUTCOME=Object.freeze({
  DISMISSED:'DISMISSED_NO_EVENT',
  RELEASED:'RELEASED_TO_FICTIONAL_LEDGER'
});
export const FICTIONAL_STOP_STATE=Object.freeze({RUNNING:'RUNNING',STOPPED:'STOPPED_LATCHED'});

export function validateFictionalReview(input){
  if(!exact(input,reviewFields)||
     input.schema!=='project9-fictional-quarantine-review-v1'||
     input.scope!=='FICTIONAL_OFFLINE'||
     !safeId(input.reviewId,reviewPattern)||
     !safeId(input.messageId,messagePattern)||
     !['RELEASE','DISMISS'].includes(input.action)||
     input.operator!=='SIM-OPERATOR-LAB'||
     input.reason!==(input.action==='RELEASE'?
       'SEQUENCE_VERIFIED_IN_LOCAL_FIXTURE':'UNSAFE_OR_UNNEEDED_FICTIONAL_MESSAGE')){
    fail('exact synthetic review fields, identities, operator and reason required');
  }
  return Object.freeze({...input});
}

export function validateFictionalStop(input){
  if(!exact(input,stopFields)||
     input.schema!=='project9-fictional-emergency-stop-v1'||
     input.scope!=='FICTIONAL_OFFLINE'||
     !safeId(input.stopId,stopPattern)||
     !['SIMULATED_INCIDENT','OPERATOR_HALTED_EXERCISE'].includes(input.reason)||
     input.operator!=='SIM-OPERATOR-LAB'){
    fail('exact offline emergency-stop fields and synthetic operator required');
  }
  return Object.freeze({...input});
}

export function reviewFictionalQuarantine(input,{receipts,port,risk,eventIds,reviews,stopped}){
  const review=validateFictionalReview(input);
  if(stopped)fail('emergency stop latched; no reviews or releases can execute');
  if(!(receipts instanceof Map)||!(reviews instanceof Map)||
     !(eventIds instanceof Set)||!port||!risk){
    fail('fully verified synthetic journal required');
  }
  const prior=receipts.get(review.messageId);
  if(!prior||prior.receipt.disposition!=='QUARANTINED_REQUIRES_REVIEW'){
    fail('only an existing quarantined fictional message may be reviewed');
  }
  if([...reviews.values()].some(x=>x.review.messageId===review.messageId)){
    fail('fictional message already reviewed; no second release');
  }
  let outcome=FICTIONAL_REVIEW_OUTCOME.DISMISSED;
  let eventId=null;
  if(review.action==='RELEASE'){
    // Only a formerly *early* fixture message can subsequently become
    // eligible. Stale, wrong-rail, collision, denied and invalid messages
    // cannot acquire new authority through a review.
    if(prior.receipt.reason!=='FUTURE_SEQUENCE_HELD_NOT_AUTO_REPLAYED'){
      fail('only held future-sequence fixture may be released');
    }
    const receipt=deliverFictionalExecutionMessage(prior.message,{
      port,risk,seenEventIds:eventIds
    });
    if(receipt.disposition!=='SIMULATED_APPLIED'){
      fail('reviewed fictional message remains ineligible for release');
    }
    outcome=FICTIONAL_REVIEW_OUTCOME.RELEASED;
    eventId=receipt.simulatedEventId;
  }
  return Object.freeze({
    schema:'project9-fictional-quarantine-review-result-v1',
    scope:'FICTIONAL_OFFLINE',
    reviewId:review.reviewId,messageId:review.messageId,
    action:review.action,reason:review.reason,
    outcome,simulatedEventId:eventId,
    realOrdersCreated:0,blockchainBroadcasts:0,
    productionGate:'NO_GO'
  });
}

export function fictionalStopSnapshot(stop){
  return Object.freeze({
    state:stop?FICTIONAL_STOP_STATE.STOPPED:FICTIONAL_STOP_STATE.RUNNING,
    stopId:stop?.stopId??null,
    reason:stop?.reason??null,
    reversibleInSameJournal:false,
    blocksFictionalSubmissions:!!stop,
    blocksFictionalEvents:!!stop,
    blocksQuarantineRelease:!!stop,
    automaticallyCancelsExistingOrders:false,
    realOrdersCreated:0,chainTransactionsBroadcast:0,
    productionGate:'NO_GO'
  });
}

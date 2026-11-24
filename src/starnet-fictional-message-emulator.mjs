/**
 * Disconnected fictional execution-message emulator.
 *
 * This is deliberately NOT a broker adapter: no network, credentials,
 * signing, accounts, clocks, wallets, blockchains or actual orders.
 * Messages are fabricated educational fixtures, never provider statements.
 * Delivery is evaluated only against a reconstructable synthetic order book.
 */
export const FICTIONAL_MESSAGE_DISPOSITION=Object.freeze({
  APPLIED:'SIMULATED_APPLIED',
  QUARANTINED:'QUARANTINED_REQUIRES_REVIEW'
});
export const FICTIONAL_MESSAGE_REASON=Object.freeze({
  APPLIED:'ORDERED_FICTIONAL_EVENT',
  UNKNOWN:'UNKNOWN_OR_DENIED_FICTIONAL_ORDER',
  WRONG_RAIL:'FICTIONAL_RAIL_IDENTITY_MISMATCH',
  FUTURE:'FUTURE_SEQUENCE_HELD_NOT_AUTO_REPLAYED',
  STALE:'STALE_SEQUENCE_REQUIRES_REVIEW',
  INVALID:'FICTIONAL_LIFECYCLE_EVENT_REFUSED'
});
const MESSAGE_KEYS=Object.freeze([
  'schema','scope','source','messageId','intentId','declaredRail',
  'sequence','kind','filledUnits'
]);
const KINDS=Object.freeze(['ACK','FILL','CANCEL','REJECT','RECONCILE']);
const RAILS=Object.freeze(['LISTED_EQUITY','TOKENIZED_SECURITY']);
const messageIdPattern=/^SIM-MSG-[A-Z0-9]{1,12}(?:-[A-Z0-9]{1,12}){0,2}$/;
const intentIdPattern=/^SIM-ORDER-[A-Z0-9]+(?:-[A-Z0-9]+){0,4}$/;
const fail=message=>{throw new TypeError('Offline fictional message refused: '+message);};
const exact=(v,keys)=>v!==null&&typeof v==='object'&&
  Object.getPrototypeOf(v)===Object.prototype&&
  Reflect.ownKeys(v).length===keys.length&&
  keys.every(k=>Object.hasOwn(v,k));

export function validateFictionalExecutionMessage(message){
  if(!exact(message,MESSAGE_KEYS)||message.schema!=='project9-fictional-execution-message-v1'||
     message.scope!=='FICTIONAL_OFFLINE'||message.source!=='ENGINEERED_LOCAL_FIXTURE'||
     typeof message.messageId!=='string'||!messageIdPattern.test(message.messageId)||
     message.messageId.length>56||typeof message.intentId!=='string'||
     !intentIdPattern.test(message.intentId)||message.intentId.length>64||
     !RAILS.includes(message.declaredRail)||!Number.isSafeInteger(message.sequence)||
     message.sequence<1||message.sequence>101||!KINDS.includes(message.kind)||
     !Number.isSafeInteger(message.filledUnits)||message.filledUnits<0||
     message.filledUnits>100||
     (message.kind==='FILL'&&message.filledUnits===0)||
     (message.kind!=='FILL'&&message.filledUnits!==0)){
    fail('exact fabricated-only message fields, identities and event values required');
  }
  return Object.freeze({...message});
}

export function simulatedEventForFictionalMessage(message){
  const checked=validateFictionalExecutionMessage(message);
  const suffix=checked.messageId.slice('SIM-MSG-'.length);
  return Object.freeze({
    schema:'project9-sim-execution-event-v1',
    scope:'FICTIONAL_OFFLINE',
    eventId:'SIM-EVENT-MSG-'+suffix,
    intentId:checked.intentId,
    kind:checked.kind,
    filledUnits:checked.filledUnits
  });
}
function frozenReceipt(message, disposition, reason, eventId){
  return Object.freeze({
    schema:'project9-fictional-message-receipt-v1',
    scope:'FICTIONAL_OFFLINE',
    source:'ENGINEERED_LOCAL_FIXTURE',
    messageId:message.messageId,
    intentId:message.intentId,
    declaredRail:message.declaredRail,
    sequence:message.sequence,
    kind:message.kind,
    disposition,
    reason,
    simulatedEventId:eventId,
    controls:Object.freeze({
      autoReplayHeldMessages:false,
      brokerConnected:false,
      walletConnected:false,
      chainConnected:false,
      realOrdersCreated:0,
      blockchainTransactionsBroadcast:0,
      externalCalls:0,
      productionGate:'NO_GO'
    })
  });
}

/**
 * Mutates ONLY the supplied scratch fictional state-machine instances.
 * The caller must reconstruct fresh scratch state before trying to commit
 * a receipt and the resulting synthetic event as one atomic journal entry.
 * Invalid lifecycle sequencing is quarantined, never silently corrected.
 */
export function deliverFictionalExecutionMessage(message,{port,risk}){
  const checked=validateFictionalExecutionMessage(message);
  if(!port||typeof port.get!=='function'||typeof port.recordEvent!=='function'||
     !risk||typeof risk.getDecision!=='function'||typeof risk.recordEvent!=='function'){
    fail('risk-policy-backed synthetic port required');
  }
  const record=port.get(checked.intentId);
  const decision=risk.getDecision(checked.intentId);
  let reason=null;
  if(!record||!decision||decision.decision!=='APPROVED'){
    reason=FICTIONAL_MESSAGE_REASON.UNKNOWN;
  }else if(record.rail!==checked.declaredRail||decision.rail!==checked.declaredRail){
    reason=FICTIONAL_MESSAGE_REASON.WRONG_RAIL;
  }else if(checked.sequence>record.eventCount+1){
    reason=FICTIONAL_MESSAGE_REASON.FUTURE;
  }else if(checked.sequence<record.eventCount+1){
    reason=FICTIONAL_MESSAGE_REASON.STALE;
  }
  if(reason){
    return frozenReceipt(checked,FICTIONAL_MESSAGE_DISPOSITION.QUARANTINED,reason,null);
  }
  const event=simulatedEventForFictionalMessage(checked);
  try {
    // Both calls operate on disposable reconstructed in-memory copies. If
    // either rejects, the caller discards the entire scratch state.
    risk.recordEvent(event);
    port.recordEvent(event);
  }catch{
    return frozenReceipt(checked,FICTIONAL_MESSAGE_DISPOSITION.QUARANTINED,
      FICTIONAL_MESSAGE_REASON.INVALID,null);
  }
  return frozenReceipt(checked,FICTIONAL_MESSAGE_DISPOSITION.APPLIED,
    FICTIONAL_MESSAGE_REASON.APPLIED,event.eventId);
}

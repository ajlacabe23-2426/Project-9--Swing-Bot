/**
 * Independent, deterministic audit of a CLOSED, FICTIONAL StarNet report.
 *
 * Recomputes cash, inventory and open reservations from each invented event
 * sequence rather than trusting the risk-book totals. It has no IO, clock,
 * account, network, broker, wallet, transaction, or signing capability.
 *
 * PASS means only local fabricated arithmetic matches the journal snapshot.
 * It is NOT evidence of executions, settlement, account holdings or P&L.
 */
import {validateFictionalRiskPolicy} from './starnet-fictional-risk-book.mjs';

const schema = 'project9-fictional-reconciliation-audit-v1';
const fail = reason => {throw new TypeError('Fictional reconciliation refused: '+reason);};
const safe = (x,min=0) => Number.isSafeInteger(x)&&x>=min;
const property = (o,k) => o!==null&&typeof o==='object'&&Object.hasOwn(o,k);
const railKey = (rail,id) => rail+'|'+id;
const validRails = new Set(['LISTED_EQUITY','TOKENIZED_SECURITY']);
const active = new Set(['PREPARED','SIMULATED_ACCEPTED','SIMULATED_PARTIAL']);
const terminal = new Set(['SIMULATED_FILLED','SIMULATED_CANCELLED','SIMULATED_REJECTED','SIMULATED_RECONCILED']);
const allStates = new Set([...active,...terminal]);
const fictionId = x => typeof x==='string'&&/^SIM-[A-Z0-9]+(?:-[A-Z0-9]+){0,5}$/.test(x)&&x.length<=64;
function assertSafe(x, message) {if(!safe(x))fail(message);return x;}
function assertMoney(x,message) {if(!safe(x)||x>1_000_000_000_000)fail(message);return x;}
function exactKeys(value,keys) {
  return value!==null&&typeof value==='object'&&
    Object.getPrototypeOf(value)===Object.prototype&&
    Reflect.ownKeys(value).length===keys.length&&
    keys.every(k=>Object.hasOwn(value,k));
}
function expectEqual(actual,expected,why) {
  if(actual!==expected) fail(why+': expected '+expected+', observed '+actual);
}

/**
 * Read-only arithmetic audit, deliberately requiring a policy-backed
 * journal. Legacy non-risk journals fail closed: do not infer balances.
 */
export function auditFictionalRiskJournalReport(report) {
  if(!report||typeof report!=='object'||Array.isArray(report)||
     report.schema!=='project9-fictional-execution-journal-v1'||
     report.scope!=='FICTIONAL_OFFLINE'||!Array.isArray(report.records)||
     !property(report,'risk')||!property(report,'controls')||
     !safe(report.revision)||typeof report.headHash!=='string'||
     !/^[a-f0-9]{64}$/.test(report.headHash)) fail('invalid or unguarded offline journal report');

  const envelope=report.controls;
  if(envelope.productionGate!=='NO_GO'||envelope.brokerConnected!==false||
     envelope.chainConnected!==false||envelope.walletConnected!==false||
     envelope.actualOrders!==0||envelope.blockchainBroadcasts!==0||
     envelope.operatorAcceptance!=='NOT_RUN')fail('unsafe journal execution claim');

  const r=report.risk;
  if(!r||r.schema!=='project9-fictional-risk-snapshot-v1'||
     r.scope!=='FICTIONAL_OFFLINE'||!Array.isArray(r.holdings)||
     !Array.isArray(r.decisions)||!r.cash||!r.controls||
     !safe(r.orderCount)||!safe(r.eventCount)||
     r.orderCount!==r.decisions.length||
     r.orderCount>100||report.records.length>100) fail('invalid fictional risk snapshot');

  const c=r.controls;
  if(c.productionGate!=='NO_GO'||c.externalCalls!==0||
     c.realOrdersCreated!==0||c.chainTransactionsBroadcast!==0||
     c.fictionalUnitsOnly!==true||c.margin!==false||
     c.shortSelling!==false||c.automaticFill!==false||
     c.feeModel!==false||c.slippageModel!==false)fail('unsafe fictional risk control flags');

  const policy=validateFictionalRiskPolicy(r.policy);
  const expectedPositions=new Map();
  for(const h of policy.initialHoldings){
    expectedPositions.set(railKey(h.rail,h.instrumentId),{
      rail:h.rail,instrumentId:h.instrumentId,totalUnits:h.units,reservedUnits:0
    });
  }
  const position=(rail,instrumentId)=>{
    const k=railKey(rail,instrumentId);
    if(!expectedPositions.has(k)) expectedPositions.set(k,{
      rail,instrumentId,totalUnits:0,reservedUnits:0
    });
    return expectedPositions.get(k);
  };

  const decisions=new Map();
  for(const d of r.decisions){
    if(!d||!fictionId(d.intentId)||decisions.has(d.intentId)||
       !validRails.has(d.rail)||!fictionId(d.instrumentId)||
       !safe(d.filledUnits)||!safe(d.reservedAtProposalTicks)||
       !safe(d.reservedAtProposalUnits)||
       !['APPROVED','REJECTED'].includes(d.decision))fail('bad or repeated fictional decision');
    decisions.set(d.intentId,d);
  }

  let expectedCash=policy.startingCashTicks;
  let expectedCashReserved=0;
  let totalEvents=0;
  const records=new Set();
  const seenEvents=new Set();
  let outstanding=0;
  for(const order of report.records){
    if(!order||!fictionId(order.intentId)||records.has(order.intentId)||
       order.schema!=='project9-sim-execution-record-v1'||order.scope!=='FICTIONAL_OFFLINE'||
       !validRails.has(order.rail)||!fictionId(order.instrumentId)||
       !['BUY','SELL'].includes(order.side)||order.orderType!=='LIMIT'||
       !safe(order.units,1)||order.units>100||
       !safe(order.limitPriceTicks,1)||order.limitPriceTicks>1_000_000_000||
       !safe(order.filledUnits)||!safe(order.remainingUnits)||
       order.filledUnits+order.remainingUnits!==order.units||
       !allStates.has(order.status)||!Array.isArray(order.events)||
       !safe(order.eventCount)||order.eventCount!==order.events.length||
       !order.safety||order.safety.productionGate!=='NO_GO'||
       order.safety.realOrdersCreated!==0||order.safety.chainTransactionsBroadcast!==0||
       order.safety.externalCalls!==0||order.safety.brokerConnected!==false||
       order.safety.walletConnected!==false||order.safety.chainConnected!==false||
       order.safety.independentExecutionOrSettlementConfirmed!==false) {
      fail('unsafe, duplicated or invalid fictional order');
    }
    records.add(order.intentId);
    const decision=decisions.get(order.intentId);
    if(!decision||decision.decision!=='APPROVED'||decision.reason!==null||
       decision.rail!==order.rail||decision.instrumentId!==order.instrumentId||
       decision.filledUnits!==order.filledUnits||decision.status!==order.status) {
      fail('order does not match approved fictional decision');
    }
    const notional=order.units*order.limitPriceTicks;
    if(!safe(notional)||notional>policy.maxOrderNotionalTicks)
      fail('order notional exceeds fictional policy');
    expectEqual(decision.reservedAtProposalTicks,
      order.side==='BUY'?notional:0,'proposal cash reservation mismatch');
    expectEqual(decision.reservedAtProposalUnits,
      order.side==='SELL'?order.units:0,'proposal holdings reservation mismatch');

    let filledFromEvents=0;
    for(const event of order.events){
      if(!event||!fictionId(event.eventId)||seenEvents.has(event.eventId)||
         event.intentId!==order.intentId||!['ACK','FILL','CANCEL','REJECT','RECONCILE'].includes(event.kind)||
         !safe(event.filledUnits)||event.filledUnits>(event.kind==='FILL'?100:0)||
         (event.kind==='FILL'&&event.filledUnits===0)||
         (event.kind!=='FILL'&&event.filledUnits!==0)) {
        fail('invalid or repeated fictional event evidence');
      }
      seenEvents.add(event.eventId);
      if(event.kind==='FILL')filledFromEvents+=event.filledUnits;
    }
    expectEqual(order.filledUnits,filledFromEvents,'fictional fill evidence mismatch');
    totalEvents+=order.events.length;

    const h=position(order.rail,order.instrumentId);
    const amount=order.filledUnits*order.limitPriceTicks;
    if(!safe(amount))fail('unsafe fictional fill multiplication');
    if(order.side==='BUY'){
      expectedCash-=amount;
      h.totalUnits+=order.filledUnits;
      if(active.has(order.status))expectedCashReserved+=order.remainingUnits*order.limitPriceTicks;
    }else{
      expectedCash+=amount;
      h.totalUnits-=order.filledUnits;
      if(active.has(order.status))h.reservedUnits+=order.remainingUnits;
    }
    if(active.has(order.status))outstanding++;
  }
  for(const d of r.decisions){
    if(d.decision==='REJECTED'){
      if(records.has(d.intentId)||d.status!=='POLICY_REJECTED'||d.filledUnits!==0||
         !['ORDER_NOTIONAL_CAP','INSUFFICIENT_AVAILABLE_CASH',
           'INSUFFICIENT_AVAILABLE_HOLDINGS'].includes(d.reason)||
         d.reservedAtProposalTicks!==0||d.reservedAtProposalUnits!==0) {
        fail('denied fictional order produced execution or reservation');
      }
    }else if(!records.has(d.intentId))fail('approved fictional order missing state');
  }
  expectEqual(r.eventCount,totalEvents,'fictional event counter mismatch');
  assertMoney(expectedCash,'fictional cash outside range');
  assertMoney(expectedCashReserved,'fictional reserved cash outside range');
  if(expectedCashReserved>expectedCash)fail('fictional cash oversubscribed');
  const expectedAvailable=expectedCash-expectedCashReserved;
  if(!exactKeys(r.cash,['totalTicks','reservedTicks','availableTicks']))
    fail('unexpected fictional cash fields');
  expectEqual(r.cash.totalTicks,expectedCash,'fictional cash total mismatch');
  expectEqual(r.cash.reservedTicks,expectedCashReserved,'fictional cash reserve mismatch');
  expectEqual(r.cash.availableTicks,expectedAvailable,'fictional cash available mismatch');

  const observedPositions=new Map();
  for(const h of r.holdings){
    if(!h||!validRails.has(h.rail)||!fictionId(h.instrumentId)||
       !safe(h.totalUnits)||!safe(h.reservedUnits)||!safe(h.availableUnits)||
       h.totalUnits>10_000||h.reservedUnits>h.totalUnits||
       observedPositions.has(railKey(h.rail,h.instrumentId))) {
      fail('invalid or duplicate fictional holdings');
    }
    observedPositions.set(railKey(h.rail,h.instrumentId),h);
  }
  if(observedPositions.size!==expectedPositions.size)
    fail('fictional position count mismatch');
  for(const [k,h] of expectedPositions){
    if(!safe(h.totalUnits)||h.totalUnits>10_000||
       !safe(h.reservedUnits)||h.reservedUnits>h.totalUnits)
       fail('fictional computed position invalid');
    const actual=observedPositions.get(k);
    if(!actual)fail('fictional holding missing');
    expectEqual(actual.totalUnits,h.totalUnits,'fictional total holdings mismatch');
    expectEqual(actual.reservedUnits,h.reservedUnits,'fictional reserved holdings mismatch');
    expectEqual(actual.availableUnits,h.totalUnits-h.reservedUnits,
      'fictional available holdings mismatch');
  }

  if(report.revision<1+decisions.size+totalEvents)
    fail('fictional revision undercounts risk record history');
  return Object.freeze({
    schema,
    scope:'FICTIONAL_OFFLINE',
    finding:'PASS_FICTIONAL_ARITHMETIC_ONLY',
    headHash:report.headHash,revision:report.revision,
    checkedDecisions:decisions.size,checkedOrders:records.size,
    checkedEvents:totalEvents,checkedHoldings:expectedPositions.size,
    outstandingFictionalOrders:outstanding,
    expectedCashTicks:expectedCash,
    expectedReservedTicks:expectedCashReserved,
    safety:Object.freeze({
      independentlyObservedProviderExecutions:false,
      authenticatedBrokerStatements:false,
      signedBlockchainFinality:false,
      walletOrBrokerConnected:false,
      realOrdersCreated:0,blockchainTransactionsBroadcast:0,
      productionGate:'NO_GO'
    })
  });
}

/**
 * StarNet deterministic fictional cash/holdings and reservation policy.
 * Pure in-memory arithmetic; never connects to, owns, or modifies accounts,
 * wallets, brokerage orders, chain transactions, prices, or live funds.
 *
 * Only integer fictional price ticks and whole demonstration units.
 * No fractional tokens, fees, margin, shorting, live orders or actual P&L.
 */
import {createSimulatedExecutionPort} from './starnet-simulated-execution-port.mjs';

const POLICY_KEYS=['schema','scope','startingCashTicks','initialHoldings','maxOrderNotionalTicks'];
const HOLDING_KEYS=['rail','instrumentId','units'];
const LIMIT_CASH=1_000_000_000_000;
const LIMIT_HOLDINGS=10_000;
const LIMIT_ORDERS=100;
const DECISIONS=Object.freeze({APPROVED:'APPROVED',REJECTED:'REJECTED'});
const fail=(message)=>{throw new TypeError(message);};
const exact=(value,keys)=>value!==null&&typeof value==='object'&&
  Object.getPrototypeOf(value)===Object.prototype&&
  Reflect.ownKeys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const fixed=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const key=(rail,id)=>rail+'|'+id;
const fictionId=value=>typeof value==='string'&&
  /^SIM-[A-Z0-9]+(?:-[A-Z0-9]+){0,5}$/.test(value)&&value.length<=64;
const rails=['LISTED_EQUITY','TOKENIZED_SECURITY'];
function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object'){
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  }
  return JSON.stringify(value);
}
export function validateFictionalRiskPolicy(policy){
  if(!exact(policy,POLICY_KEYS)||policy.schema!=='project9-fictional-risk-policy-v1'||
     policy.scope!=='FICTIONAL_OFFLINE'||!fixed(policy.startingCashTicks,0,LIMIT_CASH)||
     !fixed(policy.maxOrderNotionalTicks,1,1_000_000_000)||
     !Array.isArray(policy.initialHoldings)||policy.initialHoldings.length>20){
    fail('Invalid fictional-only risk policy');
  }
  const identities=new Set();
  const holdings=[];
  for(const holding of policy.initialHoldings){
    if(!exact(holding,HOLDING_KEYS)||!rails.includes(holding.rail)||
       !fictionId(holding.instrumentId)||!fixed(holding.units,0,LIMIT_HOLDINGS)||
       identities.has(key(holding.rail,holding.instrumentId))){
      fail('Invalid, duplicated or non-fictional initial holding');
    }
    identities.add(key(holding.rail,holding.instrumentId));
    holdings.push(Object.freeze({...holding}));
  }
  return Object.freeze({
    schema:'project9-fictional-risk-policy-v1',scope:'FICTIONAL_OFFLINE',
    startingCashTicks:policy.startingCashTicks,
    initialHoldings:Object.freeze(holdings),
    maxOrderNotionalTicks:policy.maxOrderNotionalTicks
  });
}

export function createFictionalRiskBook(rawPolicy){
  const policy=validateFictionalRiskPolicy(rawPolicy);
  const port=createSimulatedExecutionPort();
  let cash=policy.startingCashTicks;
  let cashReserved=0;
  const holdings=new Map(policy.initialHoldings.map(h=>
    [key(h.rail,h.instrumentId),{rail:h.rail,instrumentId:h.instrumentId,units:h.units,reserved:0}]));
  const decisions=new Map();
  const events=new Map();
  function getHolding(rail,instrumentId){
    const k=key(rail,instrumentId);
    if(!holdings.has(k))holdings.set(k,{rail,instrumentId,units:0,reserved:0});
    return holdings.get(k);
  }
  function getDecision(intentId){
    const d=decisions.get(intentId);
    if(!d)return null;
    const record=d.decision===DECISIONS.APPROVED?port.get(intentId):null;
    return Object.freeze({
      intentId,decision:d.decision,reason:d.reason,
      rail:d.rail,instrumentId:d.instrumentId,
      reservedAtProposalTicks:d.side==='BUY'&&d.decision===DECISIONS.APPROVED?d.notional:0,
      reservedAtProposalUnits:d.side==='SELL'&&d.decision===DECISIONS.APPROVED?d.units:0,
      status:record?.status??(d.decision===DECISIONS.REJECTED?'POLICY_REJECTED':null),
      filledUnits:record?.filledUnits??0
    });
  }
  function prepare(intent){
    // The existing strict order contract validates identities, rails and fields.
    const validated=createSimulatedExecutionPort().submit(intent);
    const id=validated.intentId, sig=canonical(intent);
    if(decisions.has(id)){
      if(decisions.get(id).signature!==sig)fail('Conflicting fictional intent retry');
      return getDecision(id);
    }
    if(decisions.size>=LIMIT_ORDERS)fail('Fictional policy order cap exceeded');
    const notional=validated.units*validated.limitPriceTicks;
    if(!Number.isSafeInteger(notional))fail('Unsafe fictional notional arithmetic');
    const h=holdings.get(key(validated.rail,validated.instrumentId));
    let reason=null;
    if(notional>policy.maxOrderNotionalTicks)reason='ORDER_NOTIONAL_CAP';
    else if(validated.side==='BUY'&&notional>cash-cashReserved)reason='INSUFFICIENT_AVAILABLE_CASH';
    else if(validated.side==='SELL'&&validated.units>(h?.units??0)-(h?.reserved??0))
      reason='INSUFFICIENT_AVAILABLE_HOLDINGS';
    const entry={
      signature:sig,decision:reason?DECISIONS.REJECTED:DECISIONS.APPROVED,reason,
      rail:validated.rail,instrumentId:validated.instrumentId,side:validated.side,
      units:validated.units,price:validated.limitPriceTicks,notional
    };
    if(!reason){
      port.submit(intent);
      if(validated.side==='BUY')cashReserved+=notional;
      else getHolding(validated.rail,validated.instrumentId).reserved+=validated.units;
    }
    decisions.set(id,entry);
    return getDecision(id);
  }
  function recordEvent(event){
    if(!event||typeof event!=='object'||!fictionId(event.intentId)&&event.intentId!==undefined){
      fail('Invalid fictional event payload');
    }
    const decision=decisions.get(event.intentId);
    if(!decision||decision.decision!==DECISIONS.APPROVED)fail('Unknown or rejected fictional order');
    const sig=canonical(event);
    if(typeof event.eventId==='string'&&events.has(event.eventId)){
      if(events.get(event.eventId)!==sig)fail('Conflicting fictional event replay');
      return getDecision(event.intentId);
    }
    const prior=port.get(event.intentId);
    // Evaluate the next event using an isolated replay first so a later
    // numeric or policy failure does not partially commit the main port.
    const h=holdings.get(key(decision.rail,decision.instrumentId));
    if(event.kind==='FILL'){
      if(!fixed(event.filledUnits,1,100))fail('Invalid fictional fill unit count');
      const amount=event.filledUnits*decision.price;
      if(!Number.isSafeInteger(amount))fail('Unsafe fictional fill arithmetic');
      if(decision.side==='SELL'&&cash+amount>LIMIT_CASH)fail('Fictional cash ledger cap exceeded');
      if(decision.side==='BUY'&&(h?.units??0)+event.filledUnits>LIMIT_HOLDINGS)
        fail('Fictional holding cap exceeded');
    }
    // Invalid lifecycle events fail closed before any ledger arithmetic.
    const result=port.recordEvent(event);
    if(event.kind==='FILL'){
      const amount=event.filledUnits*decision.price;
      if(decision.side==='BUY'){
        cash-=amount;cashReserved-=amount;
        getHolding(decision.rail,decision.instrumentId).units+=event.filledUnits;
      } else {
        cash+=amount;
        h.units-=event.filledUnits;
        h.reserved-=event.filledUnits;
      }
    }
    if(['CANCEL','REJECT'].includes(event.kind)){
      const unfilled=prior.remainingUnits;
      if(decision.side==='BUY')cashReserved-=unfilled*decision.price;
      else h.reserved-=unfilled;
    }
    events.set(event.eventId,sig);
    if(!fixed(cash,0,LIMIT_CASH)||cashReserved<0||cashReserved>cash){
      fail('Internal fictional ledger invariant failed');
    }
    return getDecision(event.intentId);
  }
  function snapshot(){
    const positions=Array.from(holdings.values(),h=>Object.freeze({
      rail:h.rail,instrumentId:h.instrumentId,totalUnits:h.units,
      reservedUnits:h.reserved,availableUnits:h.units-h.reserved
    })).sort((a,b)=>key(a.rail,a.instrumentId).localeCompare(key(b.rail,b.instrumentId)));
    if(positions.some(h=>h.reservedUnits<0||h.availableUnits<0))
      fail('Fictional holdings invariant failed');
    return Object.freeze({
      schema:'project9-fictional-risk-snapshot-v1',
      scope:'FICTIONAL_OFFLINE',
      policy:policy,
      cash:Object.freeze({totalTicks:cash,reservedTicks:cashReserved,
        availableTicks:cash-cashReserved}),
      holdings:Object.freeze(positions),
      decisions:Object.freeze(Array.from(decisions.keys(),getDecision)),
      orderCount:decisions.size,eventCount:events.size,
      controls:Object.freeze({
        fictionalUnitsOnly:true,margin:false,shortSelling:false,
        slippageModel:false,feeModel:false,automaticFill:false,
        externalCalls:0,realOrdersCreated:0,chainTransactionsBroadcast:0,
        productionGate:'NO_GO'
      })
    });
  }
  return Object.freeze({prepare,recordEvent,snapshot,getDecision});
}

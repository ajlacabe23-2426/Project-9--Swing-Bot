/**
 * Deliberately fictional, offline, completed-session paper replay.
 *
 * No provider requests, notifications, broker route, order placement or market
 * forecasting. This module only appends to recognized built-in demo fixtures.
 */
import {readFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {buildDemoDataset,DEMO_SYMBOLS} from '../scripts/seed-workstation-demo.mjs';
import {normalizeMarketDataset,evaluateSwingSetup} from './market-intelligence.mjs';
import {syntheticReplayBinding,evaluatePaperTicket} from './workstation-store.mjs';

export const SYNTHETIC_STEP_SCENARIOS=Object.freeze(['HOLD','TARGET','STOP','BOTH']);
const round=value=>Number(value.toFixed(4));
const dateAfterWeekday=date=>{
  const next=new Date(date+'T00:00:00.000Z');
  do{next.setUTCDate(next.getUTCDate()+1);}while(next.getUTCDay()===0||next.getUTCDay()===6);
  return next.toISOString().slice(0,10);
};
const error=(message,status=409)=>Object.assign(new Error(message),{status});

export function appendSyntheticSession(input,{scenario,referenceTicket=null}={}){
  if(!SYNTHETIC_STEP_SCENARIOS.includes(scenario))
    throw error('Unsupported synthetic session scenario',400);
  const dataset=normalizeMarketDataset(input);
  const expected=buildDemoDataset(dataset.symbol);
  if(dataset.schema!==expected.schema||dataset.source!==expected.source||
    dataset.mode!=='HISTORICAL'||dataset.currency!=='USD'||dataset.priceAdjustment!=='RAW'||
    dataset.provenance.adjustmentMethod!=='RAW_UNADJUSTED'||
    JSON.stringify(dataset.bars.slice(0,expected.bars.length))!==JSON.stringify(expected.bars)||
    dataset.bars.length<expected.bars.length)
    throw error('Only intact built-in synthetic demo history may be advanced');
  if(dataset.bars.length>=3000)throw error('Synthetic scenario reached the dataset capacity');
  const previous=dataset.bars.at(-1);
  if(dataset.sourceAsOf!==previous.date)
    throw error('Synthetic source as-of must match the latest saved session');

  const active=referenceTicket&&referenceTicket.outcome?.status==='OPEN_PAPER_OBSERVATION'?
    referenceTicket:null;
  if(scenario!=='HOLD'&&!active)
    throw error('Create one synthetic paper observation before selecting target/stop/both outcomes');
  const date=dateAfterWeekday(previous.date);
  const open=round(previous.close);
  let close,high,low;
  if(scenario==='TARGET'){
    close=round(active.targetReference+0.03);
    high=round(Math.max(open,close,active.targetReference+0.20));
    low=round(Math.min(open,close)-0.08);
  }else if(scenario==='STOP'){
    close=round(active.stopReference-0.03);
    low=round(Math.min(open,close,active.stopReference-0.20));
    high=round(Math.max(open,close)+0.08);
  }else if(scenario==='BOTH'){
    close=open;
    high=round(Math.max(open,active.targetReference+0.20));
    low=round(Math.min(open,active.stopReference-0.20));
  }else{
    close=round(open+0.04);
    if(active){
      close=round(Math.max(active.stopReference+0.20,
        Math.min(active.targetReference-0.20,close)));
    }
    high=round(Math.max(open,close)+0.06);
    low=round(Math.min(open,close)-0.06);
    if(active&&(high>=active.targetReference||low<=active.stopReference))
      throw error('A neutral bar would cross the frozen stop/target; select an explicit scenario');
  }
  const bar={date,open,high,low,close,volume:100_000+dataset.bars.length*25};
  const next={
    ...input,
    sourceAsOf:date,
    provenance:{
      ...input.provenance,
      retrievedAt:input.provenance.retrievedAt.slice(0,10)<date?
        date+'T23:59:59.000Z':input.provenance.retrievedAt
    },
    bars:[...input.bars,bar]
  };
  normalizeMarketDataset(next);
  return {dataset:next,bar};
}

export async function advanceSyntheticPaperSession({
  workstation,dataDir,symbol,scenario,expectedAsOf,now=new Date()
}={}){
  if(!DEMO_SYMBOLS.includes(symbol))throw error('Only SIM09/SIM10 engineered demo symbols can advance',400);
  if(!SYNTHETIC_STEP_SCENARIOS.includes(scenario))
    throw error('Choose a supported synthetic scenario',400);
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw error('Invalid request time',400);
  if(!workstation||typeof workstation.mutate!=='function')
    throw new Error('Workstation storage is required');

  // The original demo file is read-only. New sessions and their observations
  // are committed in a single queued, atomic workstation-state replacement.
  const before=workstation.snapshot();
  let seed=null;
  if(!before.syntheticReplay?.[symbol]){
    const file=join(resolve(dataDir),symbol+'.json');
    let raw;
    try{
      const info=await stat(file);
      if(!info.isFile()||info.size>2_000_000)
        throw error('Demo dataset is missing or exceeds the bounded file size');
      raw=await readFile(file,'utf8');
    }catch(cause){
      if(cause?.code==='ENOENT')throw error('Synthetic dataset missing; run npm run demo:seed first');
      throw cause;
    }
    try{seed=JSON.parse(raw);}catch{throw error('Synthetic dataset JSON is invalid; refusing to modify state');}
  }
  let step;
  const state=await workstation.mutate(current=>{
    if(!current.watchlist.includes(symbol))throw error('Add the demo symbol to the watchlist first');
    const scan=current.lastScans[symbol];
    if(!scan)throw error('Refresh the demo symbol before advancing');
    if(typeof expectedAsOf!=='string'||expectedAsOf!==scan.asOf)
      throw error('Demo session changed since the screen was loaded; refresh before retrying');
    const dataset=current.syntheticReplay?.[symbol]??seed;
    const normal=normalizeMarketDataset(dataset);
    const binding=syntheticReplayBinding(dataset);
    if(!binding)throw error('Only intact built-in synthetic demo history may be advanced');
    if(normal.symbol!==symbol||normal.bars.at(-1).date!==scan.asOf||
       binding!==scan.syntheticReplayBinding)
      throw error('Workstation and demo data identity disagree; Refresh completed bars first');

    const matches=t=>t.symbol===symbol&&!!t.syntheticBinding&&
      t.syntheticBinding===syntheticReplayBinding(dataset,t.openedAsOf);
    const eligible=current.tickets.filter(matches);
    const open=eligible.filter(t=>t.outcome?.status==='OPEN_PAPER_OBSERVATION');
    const next=appendSyntheticSession(dataset,{scenario,referenceTicket:open.at(-1)||null});
    const evaluation=evaluateSwingSetup(next.dataset);
    evaluation.chartBars=next.dataset.bars.slice(-60).map(bar=>({...bar}));
    evaluation.syntheticReplayBinding=syntheticReplayBinding(next.dataset);
    const ids=new Set(eligible.map(t=>t.id));
    current.tickets=current.tickets.map(t=>ids.has(t.id)&&matches(t)?
      {...t,outcome:evaluatePaperTicket(t,next.dataset)}:t);
    current.syntheticReplay={...current.syntheticReplay,[symbol]:next.dataset};
    current.lastScans[symbol]=evaluation;
    current.lastRefresh=now.toISOString();
    current.lastRefreshErrors=current.lastRefreshErrors.filter(e=>e.symbol!==symbol);
    step={
      mode:'ENGINEERED_SYNTHETIC_ONLY',symbol,scenario,session:next.bar.date,
      previousSession:normal.bars.at(-1).date,bar:next.bar,
      ticketsBefore:open.length,
      ticketsStillOpen:current.tickets.filter(t=>ids.has(t.id)&&matches(t)&&
        t.outcome?.status==='OPEN_PAPER_OBSERVATION').length,
      unboundOrMismatchedPreserved:current.tickets.filter(t=>t.symbol===symbol&&!matches(t)).length,
      paperTicketsCreated:0,classificationAlertsCreated:0,realOrdersCreated:0,brokerConnected:false,
      note:'Invented historical exercise only; no executable market prices, actual fills or real trades.'
    };
    return current;
  });
  return {...state,syntheticStep:step};
}

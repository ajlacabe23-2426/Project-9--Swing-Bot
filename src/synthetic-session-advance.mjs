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
import {writeReviewedMarketDataset} from './reviewed-market-write.mjs';

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
  workstation,dataDir,symbol,scenario,now=new Date()
}={}){
  if(!DEMO_SYMBOLS.includes(symbol))throw error('Only SIM09/SIM10 engineered demo symbols can advance',400);
  if(!SYNTHETIC_STEP_SCENARIOS.includes(scenario))
    throw error('Choose a supported synthetic scenario',400);
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw error('Invalid request time',400);
  if(!workstation||typeof workstation.applyRefresh!=='function')
    throw new Error('Workstation storage is required');
  const before=workstation.snapshot();
  if(!before.watchlist.includes(symbol))throw error('Add the demo symbol to the watchlist first');
  if(!before.lastScans[symbol])throw error('Refresh the demo symbol before advancing');

  const file=join(resolve(dataDir),symbol+'.json');
  let raw;
  try{
    const fileInfo=await stat(file);
    if(!fileInfo.isFile()||fileInfo.size>2_000_000)
      throw error('Demo dataset is missing or exceeds the bounded file size');
    raw=await readFile(file,'utf8');
  }catch(cause){
    if(cause?.code==='ENOENT')throw error('Synthetic dataset missing; run npm run demo:seed first');
    throw cause;
  }
  let dataset;
  try{dataset=JSON.parse(raw);}catch{throw error('Synthetic dataset JSON is invalid; refusing to overwrite');}
  const normal=normalizeMarketDataset(dataset);
  if(normal.bars.at(-1).date!==before.lastScans[symbol].asOf)
    throw error('Workstation and demo file disagree on the latest session; Refresh completed bars first');
  const openTickets=before.tickets.filter(t=>t.symbol===symbol&&
    t.outcome?.status==='OPEN_PAPER_OBSERVATION');
  const referenceTicket=openTickets.at(-1)||null;
  const next=appendSyntheticSession(dataset,{scenario,referenceTicket});
  const evaluation=evaluateSwingSetup(next.dataset);
  evaluation.chartBars=next.dataset.bars.slice(-60).map(bar=>({...bar}));

  // Append-only, lock-protected and atomic on disk; never silently revise history.
  await writeReviewedMarketDataset(file,next.dataset);
  // Reuse the same ticket evaluator as regular refresh, but do not generate
  // unverified market classification alerts from this synthetic-only step.
  const state=await workstation.applyRefresh(
    [{dataset:next.dataset,evaluation}],
    {refreshedAt:now.toISOString(),errors:[],suppressAlerts:true});
  return {
    ...state,
    syntheticStep:{
      mode:'ENGINEERED_SYNTHETIC_ONLY',
      symbol,scenario,session:next.bar.date,
      previousSession:normal.bars.at(-1).date,
      bar:next.bar,
      ticketsBefore:openTickets.length,
      ticketsStillOpen:state.tickets.filter(t=>t.symbol===symbol&&
        t.outcome?.status==='OPEN_PAPER_OBSERVATION').length,
      paperTicketsCreated:0,
      classificationAlertsCreated:0,
      realOrdersCreated:0,
      brokerConnected:false,
      note:'Invented historical exercise only; no executable market prices, actual fills or real trades.'
    }
  };
}

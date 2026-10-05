import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {normalizeMarketDataset} from './market-intelligence.mjs';

export const WORKSTATION_VERSION=1;
const SYMBOL=/^[A-Z0-9.\-]{1,15}$/;
const round=(value,places=4)=>Number(value.toFixed(places));

export function normalizeWatchlist(symbols){
  if(!Array.isArray(symbols)||symbols.length>20)throw new Error('Watchlist must contain at most 20 symbols');
  const normalized=symbols.map(value=>String(value||'').trim().toUpperCase()).filter(Boolean);
  if(normalized.some(symbol=>!SYMBOL.test(symbol)))throw new Error('Watchlist contains an invalid symbol');
  if(new Set(normalized).size!==normalized.length)throw new Error('Watchlist symbols must be unique');
  return normalized;
}

export function evaluatePaperTicket(ticket,input){
  const dataset=normalizeMarketDataset(input);
  if(!ticket||ticket.symbol!==dataset.symbol)throw new Error('Paper ticket and dataset symbol must match');
  const start=dataset.bars.findIndex(bar=>bar.date===ticket.openedAsOf);
  if(start<0)throw new Error('Paper ticket opening date is not present in dataset');
  const later=dataset.bars.slice(start+1);
  const riskPerUnit=ticket.entryReference-ticket.stopReference;
  if(!(riskPerUnit>0))throw new Error('Paper ticket has invalid frozen risk');
  for(const bar of later){
    const stopTouched=bar.low<=ticket.stopReference;
    const targetTouched=bar.high>=ticket.targetReference;
    if(stopTouched&&targetTouched){
      return {
        status:'AMBIGUOUS_SAME_BAR',
        observedThrough:bar.date,
        exitReference:null,
        paperPnl:null,
        rMultiple:null,
        note:'Both frozen stop and target references were inside the same completed daily bar; intraday ordering is unknown.'
      };
    }
    if(stopTouched||targetTouched){
      const exitReference=stopTouched?ticket.stopReference:ticket.targetReference;
      const paperPnl=(exitReference-ticket.entryReference)*ticket.paperUnits;
      return {
        status:stopTouched?'STOP_REFERENCE_TOUCHED':'TARGET_REFERENCE_TOUCHED',
        observedThrough:bar.date,
        exitReference:round(exitReference,6),
        paperPnl:round(paperPnl,2),
        rMultiple:round((exitReference-ticket.entryReference)/riskPerUnit,3),
        note:'Outcome is a paper reference derived from completed OHLC bars, not an executable fill.'
      };
    }
  }
  const latest=dataset.bars.at(-1);
  const paperPnl=(latest.close-ticket.entryReference)*ticket.paperUnits;
  return {
    status:'OPEN_PAPER_OBSERVATION',
    observedThrough:latest.date,
    exitReference:null,
    latestReference:round(latest.close,6),
    paperPnl:round(paperPnl,2),
    rMultiple:round((latest.close-ticket.entryReference)/riskPerUnit,3),
    note:'Open paper observation marked to the latest completed close; no real position exists.'
  };
}

function initialState(){
  return {version:WORKSTATION_VERSION,watchlist:[],lastScans:{},alerts:[],tickets:[],lastRefresh:null,lastRefreshErrors:[]};
}
function validTicket(ticket){
  return ticket&&typeof ticket==='object'&&typeof ticket.id==='string'&&SYMBOL.test(ticket.symbol)&&
    typeof ticket.openedAsOf==='string'&&Number.isFinite(ticket.paperUnits)&&ticket.paperUnits>0&&
    Number.isFinite(ticket.entryReference)&&Number.isFinite(ticket.stopReference)&&Number.isFinite(ticket.targetReference)&&
    ticket.stopReference<ticket.entryReference&&ticket.targetReference>ticket.entryReference&&
    typeof ticket.classificationAtOpen==='string'&&Number.isFinite(ticket.scoreAtOpen);
}
export function isValidWorkstationState(state){
  return !!state&&typeof state==='object'&&state.version===WORKSTATION_VERSION&&
    Array.isArray(state.watchlist)&&state.watchlist.length<=20&&state.watchlist.every(symbol=>SYMBOL.test(symbol))&&
    new Set(state.watchlist).size===state.watchlist.length&&state.lastScans&&typeof state.lastScans==='object'&&!Array.isArray(state.lastScans)&&
    Array.isArray(state.alerts)&&state.alerts.length<=100&&Array.isArray(state.tickets)&&state.tickets.length<=500&&
    state.tickets.every(validTicket)&&Array.isArray(state.lastRefreshErrors)&&state.lastRefreshErrors.length<=20;
}

export class WorkstationStore{
  constructor(file=resolve('.data/workstation.json')){this.file=resolve(file);this.state=null;this.queue=Promise.resolve();}
  async init(){
    try{
      const parsed=JSON.parse(await readFile(this.file,'utf8'));
      if(!isValidWorkstationState(parsed))throw new Error('Invalid workstation state: refuse to overwrite');
      this.state=parsed;
    }catch(error){
      if(error.code!=='ENOENT')throw error;
      this.state=initialState();await this.save(this.state);
    }
    return this.snapshot();
  }
  snapshot(){return structuredClone(this.state);}
  async save(state){
    if(!isValidWorkstationState(state))throw new Error('Refusing invalid workstation state');
    await mkdir(dirname(this.file),{recursive:true,mode:0o700});
    const temporary=this.file+'.'+process.pid+'.tmp';
    await writeFile(temporary,JSON.stringify(state,null,2)+'\n',{encoding:'utf8',mode:0o600});
    await rename(temporary,this.file);
  }
  async mutate(updater){
    const operation=this.queue.then(async()=>{
      const next=updater(structuredClone(this.state));
      await this.save(next);this.state=next;return this.snapshot();
    });
    this.queue=operation.catch(()=>{});return operation;
  }
  async setWatchlist(symbols){
    const watchlist=normalizeWatchlist(symbols);
    return this.mutate(state=>{
      state.watchlist=watchlist;
      for(const symbol of Object.keys(state.lastScans))if(!watchlist.includes(symbol))delete state.lastScans[symbol];
      return state;
    });
  }
  async applyRefresh(entries,{refreshedAt,errors=[]}={}){
    if(!Array.isArray(entries))throw new Error('Refresh entries are required');
    if(typeof refreshedAt!=='string'||!refreshedAt)throw new Error('Refresh timestamp is required');
    const normalizedErrors=errors.slice(0,20).map(error=>({symbol:String(error.symbol||''),message:String(error.message||'Market-data refresh failed').slice(0,160)}));
    return this.mutate(state=>{
      const datasets=new Map();
      for(const entry of entries){
        const evaluation=structuredClone(entry.evaluation),dataset=normalizeMarketDataset(entry.dataset);
        if(evaluation.symbol!==dataset.symbol||!state.watchlist.includes(dataset.symbol))throw new Error('Refresh entry is outside watchlist');
        const previous=state.lastScans[dataset.symbol];
        if(previous&&previous.classification!==evaluation.classification){
          state.alerts.unshift({
            id:'A'+(state.alerts.length+1)+'-'+dataset.symbol+'-'+evaluation.asOf,
            symbol:dataset.symbol,
            from:previous.classification,
            to:evaluation.classification,
            scoreFrom:previous.score,
            scoreTo:evaluation.score,
            asOf:evaluation.asOf
          });
        }
        state.lastScans[dataset.symbol]=evaluation;
        datasets.set(dataset.symbol,dataset);
      }
      state.alerts=state.alerts.slice(0,100);
      state.lastRefresh=refreshedAt;
      state.lastRefreshErrors=normalizedErrors;
      state.tickets=state.tickets.map(ticket=>{
        const dataset=datasets.get(ticket.symbol);
        return dataset?{...ticket,outcome:evaluatePaperTicket(ticket,dataset)}:ticket;
      });
      return state;
    });
  }
  async createTicket(symbol,paperUnits,{createdAt}={}){
    const normalized=String(symbol||'').trim().toUpperCase();
    if(!SYMBOL.test(normalized))throw new Error('Invalid paper-ticket symbol');
    if(!Number.isFinite(paperUnits)||paperUnits<=0)throw new Error('Paper units must be positive');
    if(typeof createdAt!=='string'||!createdAt)throw new Error('Paper-ticket timestamp is required');
    return this.mutate(state=>{
      const evaluation=state.lastScans[normalized];
      if(!evaluation)throw new Error('Refresh the symbol before creating a paper ticket');
      if(evaluation.classification==='NO_PAPER_SETUP')throw new Error('Paper ticket requires a watch or strong research classification');
      if(paperUnits>evaluation.paperRiskPlan.maxPaperUnits)throw new Error('Paper units exceed the frozen paper-risk reference');
      const sequence=state.tickets.length+1;
      state.tickets.unshift({
        id:'P9-'+String(sequence).padStart(4,'0'),
        symbol:normalized,
        createdAt,
        openedAsOf:evaluation.asOf,
        paperUnits:round(paperUnits,3),
        entryReference:evaluation.paperRiskPlan.entryReference,
        stopReference:evaluation.paperRiskPlan.stopReference,
        targetReference:evaluation.paperRiskPlan.targetReference,
        classificationAtOpen:evaluation.classification,
        scoreAtOpen:evaluation.score,
        outcome:{
          status:'OPEN_PAPER_OBSERVATION',
          observedThrough:evaluation.asOf,
          exitReference:null,
          latestReference:evaluation.paperRiskPlan.entryReference,
          paperPnl:0,
          rMultiple:0,
          note:'Frozen paper setup. No brokerage order or real position exists.'
        }
      });
      return state;
    });
  }
}

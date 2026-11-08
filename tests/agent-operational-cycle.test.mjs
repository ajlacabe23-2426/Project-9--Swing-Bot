import test from 'node:test';
import assert from 'node:assert/strict';
import {runOperationalCycle,validatePort,paperUnitsFor} from '../scripts/agent-operational-cycle.mjs';

const NOW=new Date('2026-11-08T22:00:00.000Z');
function mockServer({
  asOf='2026-11-06',source='Permitted sample provider',
  classification='PAPER_SETUP_STRONG',maxPaperUnits=0.75,
  existingTickets=[],refreshErrors=[]
}={}){
  const actions=[];
  const state={
    watchlist:['TEST'],lastScans:{TEST:{symbol:'TEST',asOf,source,classification,
      paperRiskPlan:{maxPaperUnits}}},
    tickets:structuredClone(existingTickets),lastRefreshErrors:refreshErrors
  };
  const fetcher=async(url,options)=>{
    const path=new URL(url).pathname;
    actions.push({path,method:options.method,headers:options.headers,body:options.body});
    if(path==='/api/workstation'&&options.method==='GET')
      return {ok:true,status:200,json:async()=>structuredClone(state)};
    if(path==='/api/workstation/refresh'&&options.method==='POST')
      return {ok:true,status:200,json:async()=>structuredClone(state)};
    if(path==='/api/workstation/tickets'&&options.method==='POST'){
      const body=JSON.parse(options.body);
      state.tickets.unshift({id:'P9-0001',symbol:body.symbol,openedAsOf:asOf,
        paperUnits:body.paperUnits,outcome:{status:'OPEN_PAPER_OBSERVATION',paperPnl:0,rMultiple:0}});
      return {ok:true,status:200,json:async()=>structuredClone(state)};
    }
    return {ok:false,status:404,json:async()=>({error:'unexpected path'})};
  };
  return {fetcher,actions,state};
}
test('port is strictly loopback with bounded port; paper sizing cannot exceed one virtual unit',()=>{
  assert.equal(validatePort('4179'),4179);
  assert.throws(()=>validatePort('0'));
  assert.throws(()=>validatePort('65536'));
  assert.equal(paperUnitsFor({maxPaperUnits:0.75}),0.75);
  assert.equal(paperUnitsFor({maxPaperUnits:500}),1);
  assert.equal(paperUnitsFor({maxPaperUnits:0.00001}),null);
});
test('refresh plus explicit opt-in creates one persistent paper ticket',async()=>{
  const m=mockServer();
  const report=await runOperationalCycle({now:NOW,fetcher:m.fetcher,autoPaper:true});
  assert.deepEqual(m.actions.map(x=>x.path),[
    '/api/workstation','/api/workstation/refresh','/api/workstation/tickets']);
  assert.equal(m.actions[2].headers.Origin,'http://127.0.0.1:4179');
  assert.equal(report.mutations.virtualTicketsCreated,1);
  assert.equal(report.actions[0].status,'PAPER_TICKET_CREATED');
  assert.equal(m.state.tickets[0].paperUnits,0.75);
  assert.equal(report.guardrails.realOrdersCreated,false);
});
test('default mode updates workstation but does not open a ticket',async()=>{
  const m=mockServer();
  const report=await runOperationalCycle({now:NOW,fetcher:m.fetcher});
  assert.equal(m.actions.length,2);
  assert.equal(report.actions[0].status,'SCANNED_ONLY');
  assert.equal(report.mutations.virtualTicketsCreated,0);
});
test('synthetic data requires explicit demo opt-in even for paper tickets',async()=>{
  const source='Project 9 ENGINEERED SYNTHETIC DEMO - NOT REAL MARKET DATA';
  const blocked=mockServer({source,asOf:'2025-10-01'});
  const result=await runOperationalCycle({now:NOW,fetcher:blocked.fetcher,autoPaper:true});
  assert.equal(result.actions[0].status,'SYNTHETIC_REQUIRES_DEMO_OPT_IN');
  assert.equal(blocked.state.tickets.length,0);
  const demo=mockServer({source,asOf:'2025-10-01'});
  const allowed=await runOperationalCycle({now:NOW,fetcher:demo.fetcher,
    autoPaper:true,allowSyntheticDemo:true});
  assert.equal(allowed.actions[0].status,'PAPER_TICKET_CREATED');
  assert.equal(allowed.mode,'EXPLICIT_SYNTHETIC_DEMO');
});
test('structured provider source metadata blocks synthetic tickets without demo opt-in',async()=>{
  const structured={name:'Project 9 ENGINEERED SYNTHETIC DEMO - NOT REAL MARKET DATA',
    mode:'HISTORICAL',sourceAsOf:'2026-11-06'};
  const blocked=mockServer({source:structured,asOf:'2026-11-06'});
  const result=await runOperationalCycle({now:NOW,fetcher:blocked.fetcher,autoPaper:true});
  assert.equal(result.actions[0].status,'SYNTHETIC_REQUIRES_DEMO_OPT_IN');
  assert.equal(blocked.state.tickets.length,0);
  const allowed=mockServer({source:structured,asOf:'2026-11-06'});
  const demo=await runOperationalCycle({now:NOW,fetcher:allowed.fetcher,
    autoPaper:true,allowSyntheticDemo:true});
  assert.equal(demo.actions[0].status,'PAPER_TICKET_CREATED');
});

test('stale or future bars do not create paper tickets',async()=>{
  for(const asOf of ['2026-10-01','2026-11-09']){
    const m=mockServer({asOf});
    const r=await runOperationalCycle({now:NOW,fetcher:m.fetcher,autoPaper:true});
    assert.equal(r.actions[0].status,'STALE_OR_FUTURE_BAR');
    assert.equal(m.state.tickets.length,0);
  }
});
test('open or same-bar paper tickets prevent duplicate creation',async()=>{
  const m=mockServer({existingTickets:[{symbol:'TEST',openedAsOf:'2026-11-01',
    outcome:{status:'OPEN_PAPER_OBSERVATION'}}]});
  const report=await runOperationalCycle({now:NOW,fetcher:m.fetcher,autoPaper:true});
  assert.equal(report.actions[0].status,'ALREADY_TRACKED');
  assert.equal(m.state.tickets.length,1);
});
test('refresh failures are reported and never used for paper creation',async()=>{
  const m=mockServer({refreshErrors:[{symbol:'TEST',message:'upstream unavailable'}]});
  const r=await runOperationalCycle({now:NOW,fetcher:m.fetcher,autoPaper:true});
  assert.equal(r.actions[0].status,'REFRESH_FAILED');
  assert.equal(r.mutations.virtualTicketsCreated,0);
});

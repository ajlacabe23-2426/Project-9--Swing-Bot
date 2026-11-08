/**
 * A write-capable, local-only operator for Project 9's existing workstation.
 * It refreshes completed bars, updates the persistent scanner, evaluates paper
 * outcomes and optionally opens bounded virtual tickets. No brokerage APIs.
 */
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const MAX_AGE_DAYS=7;
const SETUP_CLASSES=new Set(['PAPER_SETUP_STRONG','PAPER_SETUP_WATCH']);
const SYNTHETIC_SOURCE=/synthetic|fictitious|simulated|engineered demo/i;

export function validatePort(value){
  const port=Number(value);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT must be 1024–65535');
  return port;
}
export function paperUnitsFor(plan){
  const max=plan?.maxPaperUnits;
  if(typeof max!=='number'||!Number.isFinite(max)||max<0.001)return null;
  const units=Math.floor((Math.min(1,max)+1e-9)*1000)/1000;
  return units>=0.001?units:null;
}
function latestAgeDays(asOf,now){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf||''))return Infinity;
  const day=Date.parse(asOf+'T00:00:00Z');
  if(!Number.isFinite(day))return Infinity;
  return Math.floor((Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())-day)/86400000);
}
async function callLocal(fetcher,base,path,method='GET',body){
  const response=await fetcher(base+path,{
    method,
    headers:method==='POST'?{'Content-Type':'application/json','Origin':base}:{},
    ...(method==='POST'?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(120000)
  });
  let result;
  try{result=await response.json();}catch{throw new Error('Project 9 returned invalid JSON');}
  if(!response.ok)throw new Error('Project 9 '+path+': '+String(result.error||response.status).slice(0,180));
  return result;
}
export async function runOperationalCycle({
  port=4179,autoPaper=false,allowSyntheticDemo=false,
  now=new Date(),fetcher=fetch
}={}){
  const base='http://127.0.0.1:'+validatePort(port);
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new Error('Invalid run date');
  const before=await callLocal(fetcher,base,'/api/workstation');
  if(!Array.isArray(before.watchlist)||!before.watchlist.length)
    throw new Error('Add at least one symbol to the Project 9 workstation watchlist first');
  // The workstation server is the sole writer of its state file. Never open a
  // competing WorkstationStore process from an agent or CLI.
  let state=await callLocal(fetcher,base,'/api/workstation/refresh','POST',{});
  const refreshErrors=Array.isArray(state.lastRefreshErrors)?state.lastRefreshErrors:[];
  const failed=new Set(refreshErrors.map(item=>item.symbol));
  const actions=[];
  for(const symbol of before.watchlist){
    const scan=state.lastScans?.[symbol];
    if(failed.has(symbol)){actions.push({symbol,status:'REFRESH_FAILED'});continue;}
    if(!scan){actions.push({symbol,status:'NO_SCAN'});continue;}
    if(!autoPaper){actions.push({symbol,status:'SCANNED_ONLY',classification:scan.classification});continue;}
    if(!SETUP_CLASSES.has(scan.classification)){
      actions.push({symbol,status:'NO_ELIGIBLE_PAPER_SETUP',classification:scan.classification});continue;
    }
    const sourceName=typeof scan.source==='object'&&scan.source!==null?String(scan.source.name||''):String(scan.source||'');
    const synthetic=SYNTHETIC_SOURCE.test(sourceName);
    if(synthetic&&!allowSyntheticDemo){
      actions.push({symbol,status:'SYNTHETIC_REQUIRES_DEMO_OPT_IN'});continue;
    }
    const age=latestAgeDays(scan.asOf,now);
    if(!synthetic||!allowSyntheticDemo){
      if(age<0||age>MAX_AGE_DAYS){
        actions.push({symbol,status:'STALE_OR_FUTURE_BAR',asOf:scan.asOf});continue;
      }
    }
    if(state.tickets?.some(ticket=>ticket.symbol===symbol&&
        (ticket.openedAsOf===scan.asOf||ticket.outcome?.status==='OPEN_PAPER_OBSERVATION'))){
      actions.push({symbol,status:'ALREADY_TRACKED'});continue;
    }
    if((state.tickets?.length||0)>=500){
      actions.push({symbol,status:'TICKET_CAP_REACHED'});continue;
    }
    const paperUnits=paperUnitsFor(scan.paperRiskPlan);
    if(paperUnits===null){actions.push({symbol,status:'NO_PAPER_CAPACITY'});continue;}
    state=await callLocal(fetcher,base,'/api/workstation/tickets','POST',{symbol,paperUnits});
    actions.push({symbol,status:'PAPER_TICKET_CREATED',paperUnits,asOf:scan.asOf,
      ticketId:state.tickets?.[0]?.id||null});
  }
  const outcomes=(state.tickets||[]).map(ticket=>({
    ticketId:ticket.id,symbol:ticket.symbol,openedAsOf:ticket.openedAsOf,
    paperUnits:ticket.paperUnits,status:ticket.outcome?.status||'UNKNOWN',
    paperPnl:ticket.outcome?.paperPnl??null,rMultiple:ticket.outcome?.rMultiple??null
  }));
  return {
    schema:'project9-operational-cycle-v1',generatedAt:now.toISOString(),
    mode:allowSyntheticDemo?'EXPLICIT_SYNTHETIC_DEMO':'LOCAL_PAPER_RESEARCH',
    workstation:'http://127.0.0.1:'+validatePort(port)+'/workstation.html',
    refreshedSymbols:before.watchlist.length-refreshErrors.length,
    refreshErrors,actions,outcomes,
    mutations:{marketRefresh:true,virtualTicketsCreated:actions.filter(x=>x.status==='PAPER_TICKET_CREATED').length},
    guardrails:{localOnly:true,brokerConnected:false,realOrdersCreated:false,
      automatedRealMoneyExecution:false,simulationNotForecast:true}
  };
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2);
  if(args.some(arg=>!['--paper-auto','--demo'].includes(arg))){
    console.error('Usage: npm run agent:cycle -- [--paper-auto] [--demo]');
    process.exitCode=2;
  }else{
    runOperationalCycle({port:process.env.PORT||4179,
      autoPaper:args.includes('--paper-auto'),
      allowSyntheticDemo:args.includes('--demo')}).then(report=>{
      process.stdout.write(JSON.stringify(report,null,2)+'\n');
    }).catch(error=>{console.error('Operational cycle failed:',error.message);process.exitCode=1;});
  }
}

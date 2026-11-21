import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {generateScenario,historicalExperiment,initialState,report,run,step} from './src/engine.mjs';
import {PaperStore} from './src/store.mjs';
import {modelCommentary} from './src/ai.mjs';
import {evaluateSwingSetup} from './src/market-intelligence.mjs';
import {fetchMassiveDailyDataset} from './src/providers/massive.mjs';
import {WorkstationStore,REPLAY_SYMBOLS,syntheticReplayBinding} from './src/workstation-store.mjs';
import {advanceSyntheticPaperSession} from './src/synthetic-session-advance.mjs';
import {readFictionalContractStatus} from './src/simulation-evidence.mjs';
import {buildSyntheticAlertPreview} from './src/synthetic-alert-preview.mjs';
import {loadSessionPolicy} from './src/completed-market-session.mjs';
import {assertPatchedNodeRuntime} from './src/runtime-security.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const staticFiles=new Map([
  ['/','index.html'],['/index.html','index.html'],['/styles.css','styles.css'],['/app.js','app.js'],
  ['/research.html','research.html'],['/research.js','research.js'],['/research-core.mjs','research-core.mjs'],
  ['/workstation.html','workstation.html'],['/workstation.js','workstation.js'],
  ['/alert-preview.html','alert-preview.html'],['/alert-preview.js','alert-preview.js'],['/alert-preview.css','alert-preview.css'],
  ['/decision-map.js','decision-map.js'],['/decision-map-core.mjs','decision-map-core.mjs']
]);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8'};
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
const json=(res,status,data)=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
async function parseBody(req){
  if((req.headers['content-type']||'').split(';')[0].trim()!=='application/json')throw Object.assign(new Error('JSON required'),{status:415});
  let text='';for await(const chunk of req){text+=chunk;if(text.length>1000)throw Object.assign(new Error('Request too large'),{status:413});}
  try{return JSON.parse(text);}catch{throw Object.assign(new Error('Invalid JSON'),{status:400});}
}
const allowedHost=(value,port)=>value==='127.0.0.1:'+port||value==='localhost:'+port;
const allowedOrigin=(origin,port)=>origin==='http://127.0.0.1:'+port||origin==='http://localhost:'+port;
const isoDate=date=>date.toISOString().slice(0,10);
function completedMarketWindow(){
  const end=new Date();
  end.setUTCDate(end.getUTCDate()-1);
  const start=new Date(end);
  start.setUTCDate(start.getUTCDate()-420);
  return {from:isoDate(start),to:isoDate(end)};
}
export async function fetchWorkstationDataset({
  symbol,
  from,
  to,
  dataDir=resolve(root,'.data'),
  apiKey=process.env.MASSIVE_API_KEY
}){
  if(apiKey)return fetchMassiveDailyDataset({symbol,from,to,apiKey});
  const file=resolve(dataDir,symbol+'.json');
  try{
    const contents=await readFile(file,'utf8');
    return JSON.parse(contents);
  }catch(error){
    if(error?.code==='ENOENT')throw new Error('No local dataset for '+symbol+' and MASSIVE_API_KEY is not configured. Fetch '+symbol+' to .data/'+symbol+'.json or configure a local read-only market-data key.');
    if(error instanceof SyntaxError)throw new Error('Cached market dataset for '+symbol+' is not valid JSON.');
    throw new Error('Cached market dataset for '+symbol+' could not be read.');
  }
}
async function defaultMarketFetcher(args){
  return fetchWorkstationDataset(args);
}

export async function createApp({
  port=4179,
  store=new PaperStore(resolve(root,'.data/paper.json')),
  workstationStore=null,
  marketFetcher=defaultMarketFetcher,
  sessionPolicy=null,
  requireSessionEvidence=marketFetcher===defaultMarketFetcher,
  now=()=>new Date()
}={}){
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Port must be between 1024 and 65535');
  await store.init();
  const workstation=workstationStore||new WorkstationStore(resolve(dirname(store.file),'workstation.json'));
  await workstation.init();
  let lastModelRequestAt=0;
  const server=http.createServer(async(req,res)=>{
    try{
      if(!allowedHost(req.headers.host,port))return json(res,403,{error:'Host not allowed'});
      const url=new URL(req.url,'http://127.0.0.1:'+port);
      if(req.method==='GET'&&url.pathname==='/api/simulation-contracts'){
        if(url.search)return json(res,400,{error:'Contract status accepts no parameters'});
        return json(res,200,readFictionalContractStatus(store.state,workstation.snapshot()));
      }
      if(req.method==='GET'&&url.pathname==='/api/state')return json(res,200,report(store.state,generateScenario(store.state.seed)));
      if(req.method==='GET'&&url.pathname==='/api/experiment')return json(res,200,historicalExperiment(store.state.seed));
      if(req.method==='GET'&&url.pathname==='/api/workstation')return json(res,200,workstation.snapshot());
      // Synthetic read-only preview: never creates notifications, paper tickets, market fetches or orders.
      if(req.method==='GET'&&url.pathname==='/api/alerts/preview'){
        if(url.search)return json(res,400,{error:'Preview does not accept parameters'});
        return json(res,200,buildSyntheticAlertPreview());
      }
      if(req.method==='GET'&&staticFiles.has(url.pathname)){
        const file=staticFiles.get(url.pathname),contents=await readFile(join(root,'public',file));
        res.writeHead(200,{...headers,'Content-Type':types[file.slice(file.lastIndexOf('.'))]});return res.end(contents);
      }
      const postRoutes=[
        '/api/step','/api/run','/api/reset','/api/ai-report',
        '/api/workstation/watchlist','/api/workstation/refresh','/api/workstation/tickets',
        '/api/workstation/demo/advance'
      ];
      if(req.method==='POST'&&postRoutes.includes(url.pathname)){
        if(!allowedOrigin(req.headers.origin,port)||
          (req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site'])))
          return json(res,403,{error:'Local same-origin request required'});
        const body=await parseBody(req);
        if(!body||typeof body!=='object'||Array.isArray(body))return json(res,400,{error:'JSON object required'});

        if(url.pathname==='/api/workstation/watchlist'){
          if(Object.keys(body).length!==1||!('symbols' in body)||!Array.isArray(body.symbols))
            return json(res,400,{error:'symbols array required'});
          return json(res,200,await workstation.setWatchlist(body.symbols));
        }
        if(url.pathname==='/api/workstation/refresh'){
          if(Object.keys(body).length)return json(res,400,{error:'Refresh accepts no parameters'});
          const current=workstation.snapshot();
          if(!current.watchlist.length)return json(res,400,{error:'Add at least one watchlist symbol before refreshing'});
          const demoWindow=completedMarketWindow(),entries=[],errors=[];
          let marketWindow;
          for(const symbol of current.watchlist){
            try{
              const synthetic=REPLAY_SYMBOLS.includes(symbol);
              const gated=requireSessionEvidence&&!synthetic;
              if(gated&&!sessionPolicy)throw new Error('Configure a reviewed exchange calendar and data source first');
              const window=gated?sessionPolicy.window(now(),symbol):demoWindow;
              if(gated)marketWindow=window;
              // Reserved symbols always use the local fixture or committed replay.
              const dataset=synthetic
                ? current.syntheticReplay?.[symbol]??await fetchWorkstationDataset({
                    symbol,...window,dataDir:dirname(workstation.file),apiKey:null
                  })
                : await marketFetcher({symbol,...window});
              if(synthetic&&(dataset.symbol!==symbol||!syntheticReplayBinding(dataset)))
                throw new Error('Invalid local synthetic fixture for '+symbol);
              const sessionEvidence=gated?sessionPolicy.inspect(dataset,symbol,window,now()):null;
              const evaluation=evaluateSwingSetup(dataset);
              if(sessionEvidence)evaluation.sessionEvidence=sessionEvidence;
              evaluation.chartBars=dataset.bars.slice(-60).map(bar=>({
                date:bar.date,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume
              }));
              entries.push({dataset,evaluation});
            }catch(error){
              errors.push({symbol,message:String(error.message||'Market-data refresh failed')});
            }
          }
          const next=await workstation.applyRefresh(entries,{refreshedAt:now().toISOString(),errors,suppressAlerts:requireSessionEvidence});
          return json(res,200,{...next,refreshWindow:marketWindow??demoWindow});
        }
        if(url.pathname==='/api/workstation/demo/advance'){
          if(Object.keys(body).length!==3||!('symbol' in body)||!('scenario' in body)||!('expectedAsOf' in body))
            return json(res,400,{error:'Demo session step requires symbol, scenario and expectedAsOf'});
          // Local-only explicit demo route: works on built-in SIM09/SIM10 files,
          // never invokes the provider, ticket creator, trade execution or alert delivery.
          return json(res,200,await advanceSyntheticPaperSession({
            workstation,dataDir:dirname(workstation.file),
            symbol:body.symbol,scenario:body.scenario,expectedAsOf:body.expectedAsOf
          }));
        }
        if(url.pathname==='/api/workstation/tickets'){
          const allowed=['symbol','paperUnits','reviewedScan'];
          if(Object.keys(body).some(key=>!allowed.includes(key))||!Object.hasOwn(body,'symbol')||!Object.hasOwn(body,'paperUnits'))
            return json(res,400,{error:'Invalid observation parameters'});
          return json(res,200,await workstation.createTicket(body.symbol,body.paperUnits,
            {createdAt:now().toISOString(),reviewedScan:body.reviewedScan,
              checkScan:requireSessionEvidence?(scan,symbol)=>{
                if(REPLAY_SYMBOLS.includes(symbol))return;
                try{
                  if(!sessionPolicy)throw new Error('Configure a reviewed exchange calendar and data source first');
                  sessionPolicy.checkTicket(scan,now());
                }catch(error){throw Object.assign(error,{status:409});}
              }:undefined}));
        }

        const keys=Object.keys(body),expected=url.pathname==='/api/reset'?['seed']:url.pathname==='/api/run'?['count']:[];
        if(keys.some(key=>!expected.includes(key))||expected.some(key=>!keys.includes(key)))
          return json(res,400,{error:'Invalid request parameters'});
        if(url.pathname==='/api/reset'&&(!Number.isSafeInteger(body.seed)||body.seed<1||body.seed>1_000_000))
          return json(res,400,{error:'Seed must be an integer from 1 to 1,000,000'});
        if(url.pathname==='/api/run'&&(!Number.isInteger(body.count)||body.count<1||body.count>60))
          return json(res,400,{error:'Count must be an integer from 1 to 60'});
        if(url.pathname==='/api/ai-report'){
          if(!process.env.OPENAI_API_KEY)return json(res,409,{error:'Optional AI provider not configured. The deterministic research desk remains available.'});
          if(Date.now()-lastModelRequestAt<60_000)return json(res,429,{error:'AI commentary is limited to one request per minute.'});
          lastModelRequestAt=Date.now();
          const output=await modelCommentary(report(store.state,generateScenario(store.state.seed)));
          return json(res,200,output);
        }
        const state=await store.mutate(previous=>url.pathname==='/api/reset'?initialState(body.seed):
          url.pathname==='/api/step'?step(previous).state:run(previous,body.count).state);
        return json(res,200,report(state,generateScenario(state.seed)));
      }
      return json(res,404,{error:'Not found'});
    }catch(error){
      const status=error.status||500;
      if(status>=500)console.error('Local request failed:',error.message);
      return json(res,status,{error:status>=500?'Local research request failed; inspect server console.':error.message});
    }
  });return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    assertPatchedNodeRuntime();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const port=Number(process.env.PORT||4179);
  const store=new PaperStore(process.env.PROJECT9_DATA_FILE||resolve(root,'.data/paper.json'));
  const sessionPolicy=await loadSessionPolicy();
  createApp({port,store,sessionPolicy}).then(server=>server.listen(port,'127.0.0.1',()=>console.log('Project 9 local-only research platform at http://127.0.0.1:'+port))).catch(error=>{console.error(error);process.exitCode=1;});
}

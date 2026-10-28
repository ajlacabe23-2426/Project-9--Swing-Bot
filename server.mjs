import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {generateScenario,historicalExperiment,initialState,report,run,step} from './src/engine.mjs';
import {PaperStore} from './src/store.mjs';
import {modelCommentary} from './src/ai.mjs';
import {evaluateSwingSetup} from './src/market-intelligence.mjs';
import {fetchMassiveDailyDataset} from './src/providers/massive.mjs';
import {MarketCache} from './src/market-cache.mjs';
import {loadMarketDataKey,saveMarketDataKey,validateMassiveKey} from './src/market-credentials.mjs';
import {parseHistoricalCsv} from './src/historical-csv.mjs';
import {WorkstationStore} from './src/workstation-store.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const staticFiles=new Map([
  ['/','workstation.html'],['/index.html','index.html'],['/simulator.html','index.html'],['/styles.css','styles.css'],['/app.js','app.js'],
  ['/research.html','research.html'],['/research.js','research.js'],['/research-core.mjs','research-core.mjs'],
  ['/workstation.html','workstation.html'],['/workstation.js','workstation.js'],
  ['/decision-map.js','decision-map.js'],['/decision-map-core.mjs','decision-map-core.mjs']
]);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8'};
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
const json=(res,status,data)=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
async function parseBody(req,maxBytes=1000){
  if((req.headers['content-type']||'').split(';')[0].trim()!=='application/json')throw Object.assign(new Error('JSON required'),{status:415});
  let text='',size=0;for await(const chunk of req){size+=chunk.length;if(size>maxBytes)throw Object.assign(new Error('Request too large'),{status:413});text+=chunk.toString('utf8');}
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
  const configuredKey=apiKey||await loadMarketDataKey({dataDir});
  if(configuredKey)return fetchMassiveDailyDataset({symbol,from,to,apiKey:configuredKey});
  const cached=await new MarketCache(resolve(dataDir,'market-cache')).read(symbol);
  if(cached)return cached;
  const file=resolve(dataDir,symbol+'.json');
  try{
    const contents=await readFile(file,'utf8');
    return JSON.parse(contents);
  }catch(error){
    if(error?.code==='ENOENT')throw new Error('No market data for '+symbol+'. Run npm run setup:market to connect the free Massive Stocks historical feed, or import a permitted v2 JSON dataset using npm run import:market.');
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
  marketVerifier=fetchMassiveDailyDataset,
  marketDataDir=null
}={}){
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Port must be between 1024 and 65535');
  await store.init();
  const workstation=workstationStore||new WorkstationStore(resolve(dirname(store.file),'workstation.json'));
  await workstation.init();
  const dataDirectory=resolve(marketDataDir||dirname(store.file));
  const marketCache=new MarketCache(resolve(dataDirectory,'market-cache'));
  const scopedMarketFetcher=marketFetcher===defaultMarketFetcher
    ?args=>fetchWorkstationDataset({...args,dataDir:dataDirectory}):marketFetcher;
  let lastModelRequestAt=0,lastMarketVerificationAt=0;
  const server=http.createServer(async(req,res)=>{
    try{
      if(!allowedHost(req.headers.host,port))return json(res,403,{error:'Host not allowed'});
      const url=new URL(req.url,'http://127.0.0.1:'+port);
      if(req.method==='GET'&&url.pathname==='/api/state')return json(res,200,report(store.state,generateScenario(store.state.seed)));
      if(req.method==='GET'&&url.pathname==='/api/experiment')return json(res,200,historicalExperiment(store.state.seed));
      if(req.method==='GET'&&url.pathname==='/api/workstation')return json(res,200,workstation.snapshot());
      if(req.method==='GET'&&url.pathname==='/api/market/status'){
        const key=await loadMarketDataKey({dataDir:dataDirectory});
        const scans=Object.values(workstation.snapshot().lastScans).map(scan=>({symbol:scan.symbol,asOf:scan.asOf,mode:scan.source.mode,source:scan.source.name}));
        return json(res,200,{connected:!!key,provider:'Massive Stocks',dataMode:'HISTORICAL',scans});
      }
      if(req.method==='GET'&&staticFiles.has(url.pathname)){
        const file=staticFiles.get(url.pathname),contents=await readFile(join(root,'public',file));
        res.writeHead(200,{...headers,'Content-Type':types[file.slice(file.lastIndexOf('.'))]});return res.end(contents);
      }
      const postRoutes=[
        '/api/step','/api/run','/api/reset','/api/ai-report',
        '/api/workstation/watchlist','/api/workstation/refresh','/api/workstation/tickets',
        '/api/market/connect','/api/market/import'
      ];
      if(req.method==='POST'&&postRoutes.includes(url.pathname)){
        if(!allowedOrigin(req.headers.origin,port)||
          (req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site'])))
          return json(res,403,{error:'Local same-origin request required'});
        const body=await parseBody(req,url.pathname==='/api/market/import'?450_000:1000);
        if(!body||typeof body!=='object'||Array.isArray(body))return json(res,400,{error:'JSON object required'});

        if(url.pathname==='/api/market/connect'){
          if(Object.keys(body).length!==1||typeof body.apiKey!=='string')
            return json(res,400,{error:'Enter only a Massive Stocks API key.'});
          if(Date.now()-lastMarketVerificationAt<12_000)
            return json(res,429,{error:'Connection verification is limited to one attempt every 12 seconds.'});
          lastMarketVerificationAt=Date.now();
          let key;
          try{key=validateMassiveKey(body.apiKey);}
          catch(error){return json(res,400,{error:error.message});}
          const {from,to}=completedMarketWindow();
          let dataset;
          try{dataset=await marketVerifier({symbol:'AAPL',from,to,apiKey:key});}
          catch(error){return json(res,422,{error:'Market connection could not be verified: '+String(error.message||'Provider unavailable').replaceAll(key,'[REDACTED]').slice(0,180)});}
          if(dataset.symbol!=='AAPL'||dataset.bars?.length<60)
            return json(res,422,{error:'Market-data verification returned an invalid symbol or incomplete history.'});
          await saveMarketDataKey(key,{dataDir:dataDirectory});
          if(!workstation.snapshot().watchlist.length)await workstation.setWatchlist(['AAPL']);
          const evaluation=evaluateSwingSetup(dataset);
          evaluation.chartBars=dataset.bars.slice(-60);
          const refreshed=await workstation.applyRefresh([{dataset,evaluation}],{refreshedAt:new Date().toISOString(),errors:[]});
          return json(res,200,{connected:true,provider:'Massive Stocks',symbol:'AAPL',asOf:evaluation.asOf,workstation:refreshed});
        }
        if(url.pathname==='/api/market/import'){
          const allowed=['csv','symbol','source','priceAdjustment','confirmedRights'];
          if(Object.keys(body).some(key=>!allowed.includes(key))||allowed.some(key=>!(key in body)))
            return json(res,400,{error:'Missing or unexpected historical CSV fields.'});
          const dataset=parseHistoricalCsv(body);
          const current=workstation.snapshot();
          if(!current.watchlist.includes(dataset.symbol)&&current.watchlist.length>=20)
            return json(res,409,{error:'Watchlist has 20 symbols; remove one before importing another.'});
          try{await marketCache.save(dataset);}
          catch(error){return json(res,409,{error:'Historical dataset not accepted: '+error.message});}
          if(!current.watchlist.includes(dataset.symbol))
            await workstation.setWatchlist([...current.watchlist,dataset.symbol]);
          const evaluation=evaluateSwingSetup(dataset);
          evaluation.chartBars=dataset.bars.slice(-60);
          const refreshed=await workstation.applyRefresh([{dataset,evaluation}],{refreshedAt:new Date().toISOString(),errors:[]});
          return json(res,200,{symbol:dataset.symbol,bars:dataset.bars.length,asOf:evaluation.asOf,workstation:refreshed});
        }
        if(url.pathname==='/api/workstation/watchlist'){
          if(Object.keys(body).length!==1||!('symbols' in body)||!Array.isArray(body.symbols))
            return json(res,400,{error:'symbols array required'});
          return json(res,200,await workstation.setWatchlist(body.symbols));
        }
        if(url.pathname==='/api/workstation/refresh'){
          if(Object.keys(body).length)return json(res,400,{error:'Refresh accepts no parameters'});
          const current=workstation.snapshot();
          if(!current.watchlist.length)return json(res,400,{error:'Add at least one watchlist symbol before refreshing'});
          const {from,to}=completedMarketWindow(),entries=[],errors=[];
          for(const symbol of current.watchlist){
            try{
              const dataset=await scopedMarketFetcher({symbol,from,to});
              const evaluation=evaluateSwingSetup(dataset);
              evaluation.chartBars=dataset.bars.slice(-60).map(bar=>({
                date:bar.date,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume
              }));
              entries.push({dataset,evaluation});
            }catch(error){
              errors.push({symbol,message:String(error.message||'Market-data refresh failed')});
            }
          }
          const next=await workstation.applyRefresh(entries,{refreshedAt:new Date().toISOString(),errors});
          return json(res,200,{...next,refreshWindow:{from,to}});
        }
        if(url.pathname==='/api/workstation/tickets'){
          if(Object.keys(body).length!==2||!('symbol' in body)||!('paperUnits' in body))
            return json(res,400,{error:'symbol and paperUnits required'});
          return json(res,200,await workstation.createTicket(body.symbol,body.paperUnits,{createdAt:new Date().toISOString()}));
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
  const port=Number(process.env.PORT||4179);
  const store=new PaperStore(process.env.PROJECT9_DATA_FILE||resolve(root,'.data/paper.json'));
  createApp({port,store}).then(server=>server.listen(port,'127.0.0.1',()=>console.log('Project 9 local-only research platform at http://127.0.0.1:'+port))).catch(error=>{console.error(error);process.exitCode=1;});
}

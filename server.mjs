import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {generateScenario,historicalExperiment,initialState,report,run,step} from './src/engine.mjs';
import {PaperStore} from './src/store.mjs';
import {modelCommentary} from './src/ai.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const staticFiles=new Map([['/','index.html'],['/index.html','index.html'],['/styles.css','styles.css'],['/app.js','app.js'],['/research.html','research.html'],['/research.js','research.js'],['/research-core.mjs','research-core.mjs']]);
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
export async function createApp({port=4179,store=new PaperStore(resolve(root,'.data/paper.json'))}={}){
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Port must be between 1024 and 65535');
  await store.init();let lastModelRequestAt=0;
  const server=http.createServer(async(req,res)=>{
    try{
      if(!allowedHost(req.headers.host,port))return json(res,403,{error:'Host not allowed'});
      const url=new URL(req.url,'http://127.0.0.1:'+port);
      if(req.method==='GET'&&url.pathname==='/api/state')return json(res,200,report(store.state,generateScenario(store.state.seed)));
      if(req.method==='GET'&&url.pathname==='/api/experiment')return json(res,200,historicalExperiment(store.state.seed));
      if(req.method==='GET'&&staticFiles.has(url.pathname)){
        const file=staticFiles.get(url.pathname),contents=await readFile(join(root,'public',file));
        res.writeHead(200,{...headers,'Content-Type':types[file.slice(file.lastIndexOf('.'))]});return res.end(contents);
      }
      if(req.method==='POST'&&['/api/step','/api/run','/api/reset','/api/ai-report'].includes(url.pathname)){
        if(!allowedOrigin(req.headers.origin,port)||
          (req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site'])))
          return json(res,403,{error:'Local same-origin request required'});
        const body=await parseBody(req);
        if(!body||typeof body!=='object'||Array.isArray(body))return json(res,400,{error:'JSON object required'});
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
      return json(res,status,{error:status>=500?'Local simulation failed; inspect server console.':error.message});
    }
  });return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||4179);
  const store=new PaperStore(process.env.PROJECT9_DATA_FILE||resolve(root,'.data/paper.json'));
  createApp({port,store}).then(server=>server.listen(port,'127.0.0.1',()=>console.log('Project 9 local-only synthetic research at http://127.0.0.1:'+port))).catch(error=>{console.error(error);process.exitCode=1;});
}

/**
 * One-command local Project 9 operator: boot server, refresh completed market
 * research, optionally create bounded paper tickets, then serve workstation.
 * The server is still loopback-only and there are no broker routes.
 */
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createApp,fetchWorkstationDataset} from '../server.mjs';
import {PaperStore} from '../src/store.mjs';
import {WorkstationStore} from '../src/workstation-store.mjs';
import {seedWorkstationDemo} from './seed-workstation-demo.mjs';
import {runOperationalCycle,validatePort} from './agent-operational-cycle.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

export async function launchLocalOperator({
  port=4179,
  dataDir=join(root,'.data'),
  demo=false,
  autoPaper=false,
  now=new Date(),
  apiKey=process.env.MASSIVE_API_KEY
}={}){
  port=validatePort(port);
  dataDir=resolve(dataDir);
  if(demo)await seedWorkstationDemo({dataDir});
  const store=new PaperStore(join(dataDir,'paper.json'));
  const workstationStore=new WorkstationStore(join(dataDir,'workstation.json'));
  // Demo mode MUST ignore real provider credentials even if configured in
  // the host environment. The demo makes no external market-data requests.
  const marketFetcher=({symbol,from,to})=>fetchWorkstationDataset({
    symbol,from,to,dataDir,apiKey:demo?null:apiKey
  });
  const server=await createApp({port,store,workstationStore,marketFetcher});
  try{
    await new Promise((done,fail)=>{
      const onError=error=>{server.off('listening',onListening);fail(error);};
      const onListening=()=>{server.off('error',onError);done();};
      server.once('error',onError);
      server.once('listening',onListening);
      server.listen(port,'127.0.0.1');
    });
    const report=await runOperationalCycle({
      port,autoPaper,allowSyntheticDemo:demo,now
    });
    return {server,report,url:'http://127.0.0.1:'+port+'/workstation.html'};
  }catch(error){
    if(server.listening)await new Promise(resolve=>server.close(resolve));
    throw error;
  }
}

export function parseOperatorOptions(args){
  const allowed=new Set(['--demo','--paper-auto']);
  if(!Array.isArray(args)||args.some(arg=>!allowed.has(arg))||
     new Set(args).size!==args.length)
    throw new Error('Usage: npm run agent:launch -- [--demo] [--paper-auto]');
  return {demo:args.includes('--demo'),autoPaper:args.includes('--paper-auto')};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  let options;
  try{options=parseOperatorOptions(process.argv.slice(2));}
  catch(error){console.error(error.message);process.exit(2);}
  launchLocalOperator({...options,port:process.env.PORT||4179}).then(({server,report,url})=>{
    console.log(JSON.stringify(report,null,2));
    console.log('Project 9 operator running at '+url);
    console.log('Press Ctrl+C to stop the local server. Paper state persists in .data.');
    const stop=()=>server.close(()=>process.exit(0));
    process.once('SIGINT',stop);
    process.once('SIGTERM',stop);
  }).catch(error=>{console.error('Project 9 operator failed:',error.message);process.exitCode=1;});
}

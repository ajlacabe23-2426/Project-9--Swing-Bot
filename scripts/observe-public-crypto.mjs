/**
 * One bounded public WebSocket market-data observation session.
 * Uses no account, key, order endpoint, strategy, signal or persisted data.
 * Not a brokerage connection, quote validator or trading application.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {KRAKEN_SPOT_PUBLIC_WSS,krakenPublicTickerSubscription,parseKrakenPublicTickerFrame}
  from '../src/providers/kraken-public-crypto.mjs';

export async function observePublicCrypto({
  WebSocketImpl=globalThis.WebSocket,
  durationMs=15_000,
  maxObservations=12,
  emit=x=>process.stdout.write(JSON.stringify(x)+'\n')
}={}){
  if(typeof WebSocketImpl!=='function')throw new TypeError('WebSocket runtime unavailable');
  if(!Number.isSafeInteger(durationMs)||durationMs<1000||durationMs>30_000||
     !Number.isSafeInteger(maxObservations)||maxObservations<1||maxObservations>50||
     typeof emit!=='function')
    throw new TypeError('Invalid bounded public research monitor settings');

  const socket=new WebSocketImpl(KRAKEN_SPOT_PUBLIC_WSS);
  return new Promise((resolvePromise,rejectPromise)=>{
    let finished=false,observations=0,snapshotCount=0,stale=0;
    const finish=error=>{
      if(finished)return;
      finished=true;clearTimeout(timer);
      try{socket.close()}catch{}
      if(error)rejectPromise(error);
      else resolvePromise({
        provider:'KRAKEN_PUBLIC_SPOT',observations,snapshotCount,stale,
        brokerageConnected:false,ordersCreated:0,productionGate:'NO_GO'
      });
    };
    const timer=setTimeout(()=>finish(null),durationMs);
    socket.addEventListener('open',()=>{
      if(finished)return;
      try{socket.send(JSON.stringify(krakenPublicTickerSubscription()));}
      catch{finish(new Error('Public research subscription failed'));}
    });
    socket.addEventListener('message',event=>{
      if(finished)return;
      try{
        const observationsInFrame=parseKrakenPublicTickerFrame(event.data,{
          receivedAt:new Date().toISOString()
        });
        for(const x of observationsInFrame){
          if(x.eventType==='snapshot')snapshotCount++;
          if(x.status!=='RECENT_RECEIPT_UNVERIFIED')stale++;
          emit(x);
          if(++observations>=maxObservations){finish(null);return;}
        }
      }catch{finish(new Error('Public research market-data validation failed closed'));}
    });
    socket.addEventListener('error',()=>finish(new Error('Public research market-data connection failed')));
    socket.addEventListener('close',()=>{
      if(!finished)finish(observations?null:new Error('Public research connection closed without observations'));
    });
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.argv.length!==2){
    process.stderr.write('Usage: node scripts/observe-public-crypto.mjs (no arguments or credentials)\n');
    process.exitCode=1;
  }else{
    observePublicCrypto().then(report=>{
      process.stdout.write(JSON.stringify({type:'SESSION_END',...report})+'\n');
    }).catch(error=>{
      process.stderr.write('Public research observation stopped: '+error.message+'\n');
      process.exitCode=1;
    });
  }
}

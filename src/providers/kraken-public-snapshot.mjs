/**
 * Bounded, user-initiated Kraken PUBLIC WebSocket snapshot.
 * Read-only observation, never an authenticated executable quote.
 * NO private channels, API keys, exchange accounts, order methods or signals.
 */
import {
  KRAKEN_PUBLIC_PAIRS,KRAKEN_SPOT_PUBLIC_WSS,
  krakenPublicTickerSubscription,parseKrakenPublicTickerFrame
} from './kraken-public-crypto.mjs';

export async function readKrakenPublicSnapshot({
  pair='BTC/USD',
  WebSocketImpl=globalThis.WebSocket,
  now=()=>new Date(),
  timeoutMs=6500
}={}){
  if(!KRAKEN_PUBLIC_PAIRS.includes(pair))throw new TypeError('Unsupported crypto market pair');
  if(typeof WebSocketImpl!=='function'||typeof now!=='function')
    throw new TypeError('Public observation transport unavailable');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<500||timeoutMs>8000)
    throw new TypeError('Bounded source timeout required');

  return new Promise((resolve,reject)=>{
    let finished=false;
    let socket=null;
    let timer;
    function finish(error,observation){
      if(finished)return;
      finished=true;
      clearTimeout(timer);
      try{socket?.close();}catch{}
      if(error)reject(error);
      else resolve({
        ...observation,
        // The observer only knows it received a documented public frame.
        independentlyAuthenticated:false,
        tradeExecutionEnabled:false,
        ordersCreated:0,
        productionGate:'NO_GO'
      });
    }
    timer=setTimeout(()=>finish(new Error('Public market observation timed out')),timeoutMs);
    try{
      socket=new WebSocketImpl(KRAKEN_SPOT_PUBLIC_WSS);
      socket.addEventListener('open',()=>{
        if(finished)return;
        try{socket.send(JSON.stringify(krakenPublicTickerSubscription()));}
        catch{finish(new Error('Public market subscription failed'));}
      });
      socket.addEventListener('message',event=>{
        if(finished)return;
        try{
          const timestamp=now();
          if(!(timestamp instanceof Date)||!Number.isFinite(timestamp.getTime()))
            throw new Error('Invalid observation clock');
          const result=parseKrakenPublicTickerFrame(event.data,{
            receivedAt:timestamp.toISOString(),maxAgeMs:60_000
          });
          const selected=result.find(x=>x.symbol===pair);
          if(!selected)return;
          if(selected.status!=='RECENT_RECEIPT_UNVERIFIED'){
            finish(new Error('Public market observation was stale'));
            return;
          }
          finish(null,selected);
        }catch{finish(new Error('Public market observation rejected by validation'));}
      });
      socket.addEventListener('error',()=>finish(new Error('Public market WebSocket failed')));
      socket.addEventListener('close',()=>finish(new Error('Public market WebSocket closed without valid observation')));
    }catch{finish(new Error('Public market WebSocket could not open'));}
  });
}

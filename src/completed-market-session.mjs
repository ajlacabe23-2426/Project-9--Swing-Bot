import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isStrictISODate,normalizeMarketDataset} from './market-intelligence.mjs';

const exchangeDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',dateStyle:'short'});

export async function loadSessionPolicy(file=process.env.PROJECT9_SESSION_POLICY){
  return file?compileSessionPolicy(JSON.parse(await readFile(file,'utf8'))):null;
}

export function compileSessionPolicy({source,symbols,from,through,sessions}={}){
  if(typeof source!=='string'||!source.trim()||!Array.isArray(symbols)||!symbols.length||
     symbols.some(symbol=>typeof symbol!=='string'||!/^[A-Z0-9.\-]{1,15}$/.test(symbol))||
     !isStrictISODate(from)||!isStrictISODate(through)||from>=through||
     !Array.isArray(sessions)||!sessions.length||sessions.length>3000)
    throw new Error('Invalid completed-session policy');
  const dates=new Map();
  let previous='';
  for(const row of sessions){
    const {date,closeAt}=row??{};
    const instant=new Date(closeAt);
    if(!isStrictISODate(date)||date<from||date>through||date<=previous||
       !Number.isFinite(instant.getTime())||instant.toISOString()!==closeAt||
       exchangeDate.format(instant)!==date)
      throw new Error('Invalid or unordered exchange session');
    dates.set(date,closeAt);
    previous=date;
  }
  const revision=createHash('sha256').update(JSON.stringify([source,symbols,from,through,[...dates]])).digest('hex');

  function latest(now){
    const today=exchangeDate.format(now);
    if(today<=from||today>through)throw new Error('Exchange calendar does not cover today');
    const cutoff=now.toISOString();
    const completed=[...dates].filter(([date,close])=>date<=today&&close<=cutoff).at(-1)?.[0];
    if(!completed)throw new Error('No completed exchange session in calendar');
    return completed;
  }

  return {
    window(now,symbol){
      if(!symbols.includes(symbol))throw new Error('Symbol is outside the reviewed calendar policy');
      const to=latest(now);
      // The first date is inclusive and must be within reviewed coverage.
      const lookback=new Date(Date.parse(to+'T00:00:00Z')-420*86400000).toISOString().slice(0,10);
      return {from:lookback<from?from:lookback,to};
    },
    inspect(input,symbol,window,now){
      const dataset=normalizeMarketDataset(input);
      const asOf=latest(now);
      const retrieved=dataset.provenance.retrievedAt;
      if(!symbols.includes(symbol)||dataset.symbol!==symbol||dataset.source!==source||
         /synthetic|fictitious|invented|\bdemo\b|\bgenerated\b|\bsimulated\b/i.test(source)||
         dataset.mode!=='HISTORICAL'||!retrieved||retrieved<dates.get(asOf)||retrieved>now.toISOString()||
         dataset.sourceAsOf!==asOf||window.to!==asOf)
        throw new Error('Dataset source or completed-session evidence does not match policy');
      const expected=[...dates.keys()].filter(date=>date>=window.from&&date<=asOf);
      if(expected.length!==dataset.bars.length||expected.some((date,index)=>date!==dataset.bars[index].date))
        throw new Error('Dataset does not contain exactly the expected completed sessions');
      return {asOf,revision};
    },
    checkTicket(scan,now){
      if(scan?.sessionEvidence?.revision!==revision||scan.sessionEvidence.asOf!==latest(now)||
         scan.asOf!==scan.sessionEvidence.asOf)
        throw new Error('Refresh and review the latest completed exchange session');
    }
  };
}

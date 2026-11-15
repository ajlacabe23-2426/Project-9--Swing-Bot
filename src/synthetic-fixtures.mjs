/** Built-in invented classroom fixtures. Pure generation; no filesystem, network or provider. */
const round=(n,p=6)=>Number(n.toFixed(p));
function rng(seed){let x=seed>>>0;return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
export function generateScenario(seed=73,length=190){
  if(!Number.isSafeInteger(seed)||seed<1||seed>1_000_000||!Number.isInteger(length)||length<50||length>1000)throw new Error('Invalid scenario parameters');
  const random=rng(seed),bars=[];let previous=100;const date=new Date('2024-01-01T00:00:00.000Z');
  while(bars.length<length){
    date.setUTCDate(date.getUTCDate()+1);
    if([0,6].includes(date.getUTCDay()))continue;
    const t=bars.length,regime=t<55?0.003:t<104?-0.0035:t<144?0.0015:-0.0008,cycle=0.006*Math.sin(t/5.3);
    const open=previous*(1+(random()-0.5)*0.009);
    const close=Math.max(10,open*(1+regime+cycle+(random()-0.5)*0.024));
    const high=Math.max(open,close)*(1+0.002+random()*0.009),low=Math.min(open,close)*(1-0.002-random()*0.009);
    bars.push({date:date.toISOString().slice(0,10),open:round(open),high:round(high),low:round(low),close:round(close),volume:Math.round(90000+random()*110000)});
    previous=close;
  }return bars;
}

export const LABEL='Project 9 ENGINEERED SYNTHETIC DEMO - NOT REAL MARKET DATA';
export const DEMO_SYMBOLS=Object.freeze(['SIM09','SIM10']);

export function buildDemoFixture(symbol,{retrievedAt='2026-10-24T00:00:00.000Z',schema='project9-market-data-v2'}={}){
  if(!DEMO_SYMBOLS.includes(symbol))throw new Error('Unknown demo symbol');
  const upward=symbol==='SIM09';
  const bars=[],date=new Date('2025-09-01T00:00:00.000Z');
  while(bars.length<120){
    date.setUTCDate(date.getUTCDate()+1);
    if([0,6].includes(date.getUTCDay()))continue;
    const index=bars.length;
    const close=Number((upward?100+index*0.22:145-index*0.18).toFixed(4));
    const open=Number((close+(upward?-0.08:0.08)).toFixed(4));
    bars.push({date:date.toISOString().slice(0,10),open,
      high:Number((Math.max(open,close)+0.12).toFixed(4)),
      low:Number((Math.min(open,close)-0.12).toFixed(4)),
      close,volume:100_000+index*20});
  }
  if(upward){
    const last=bars.at(-1),previous=bars.at(-2);
    last.open=Number((previous.close+0.03).toFixed(4));
    last.close=Number((Math.max(...bars.slice(-21,-1).map(b=>b.high))*1.025).toFixed(4));
    last.high=Number((last.close+0.15).toFixed(4));
    last.low=Number((last.open-0.15).toFixed(4));
    last.volume=350_000;
  }
  const dataset={
    schema,symbol,currency:'USD',
    source:LABEL,mode:'HISTORICAL',sourceAsOf:bars.at(-1).date,
    priceAdjustment:'RAW',
    provenance:{retrievedAt,adjustmentMethod:'RAW_UNADJUSTED',
      corporateActions:'NOT_VERIFIED',survivorship:'NOT_ASSESSED',
      licensing:'NOT_VERIFIED'},
    bars
  };
  return dataset;
}


// @ts-check
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,rm,stat,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {CURRENT_MARKET_DATA_SCHEMA,normalizeMarketDataset} from './market-intelligence.mjs';

export const MARKET_CACHE_SCHEMA='project9-market-cache-v1';
const SYMBOL=/^[A-Z0-9.\-]{1,15}$/;
const MAX_CACHE_BYTES=3_000_000;

/** @typedef {{schema:string,symbol:string,currency:string,source:string,mode:string,sourceAsOf:string,priceAdjustment:string,provenance:object,bars:Array<{date:string,open:number,high:number,low:number,close:number,volume:number}>}} Dataset */

/** @param {string} value */
function assertSymbol(value){
  if(typeof value!=='string'||!SYMBOL.test(value))throw new Error('Invalid market-cache symbol');
  return value;
}

/** @param {Dataset} dataset */
function digest(dataset){
  return createHash('sha256').update(JSON.stringify(dataset)).digest('hex');
}

/**
 * Local, integrity-checked, versioned store for validated historical datasets.
 * One local process must own the cache directory. This is NOT a data-provider
 * authenticity signature, a database transaction across processes, or a broker.
 */
export class MarketCache{
  /** @param {string} [directory] */
  constructor(directory=resolve('.data/market-cache')){
    this.directory=resolve(directory);
    /** @type {Promise<unknown>} */
    this.queue=Promise.resolve();
  }

  /** @param {string} symbol */
  pathFor(symbol){return join(this.directory,assertSymbol(symbol)+'.json');}

  /** @param {string} symbol */
  async inspect(symbol){
    const stored=await this.readEnvelope(symbol);
    if(!stored)return null;
    return {
      symbol:stored.dataset.symbol,
      source:stored.dataset.source,
      dataMode:stored.dataset.mode,
      sourceAsOf:stored.dataset.sourceAsOf,
      latestBar:stored.dataset.bars.at(-1).date,
      bars:stored.dataset.bars.length,
      savedAt:stored.savedAt,
      sha256:stored.sha256,
      integrity:'LOCAL_DIGEST_MATCH_ONLY'
    };
  }

  /** @param {string} symbol */
  async read(symbol){
    const stored=await this.readEnvelope(symbol);
    return stored?structuredClone(stored.dataset):null;
  }

  /** @param {string} symbol */
  async readEnvelope(symbol){
    const file=this.pathFor(symbol);
    let raw;
    try{
      if((await stat(file)).size>MAX_CACHE_BYTES)throw new Error('Cached market dataset exceeds size limit');
      raw=await readFile(file,'utf8');
    }catch(error){
      if(error?.code==='ENOENT')return null;
      throw error;
    }
    let envelope;
    try{envelope=JSON.parse(raw);}catch{throw new Error('Market cache is not valid JSON: '+symbol);}
    if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||
       Object.keys(envelope).sort().join(',')!=='dataset,savedAt,schema,sha256'||
       envelope.schema!==MARKET_CACHE_SCHEMA||
       typeof envelope.savedAt!=='string'||!Number.isFinite(Date.parse(envelope.savedAt))||
       typeof envelope.sha256!=='string'||!/^[0-9a-f]{64}$/.test(envelope.sha256))
      throw new Error('Market cache envelope is invalid: '+symbol);
    const dataset=normalizeMarketDataset(envelope.dataset);
    if(dataset.schema!==CURRENT_MARKET_DATA_SCHEMA||dataset.symbol!==symbol)
      throw new Error('Market cache has a mismatched symbol or schema: '+symbol);
    if(digest(dataset)!==envelope.sha256)
      throw new Error('Market cache integrity check failed: '+symbol);
    return {schema:MARKET_CACHE_SCHEMA,savedAt:envelope.savedAt,sha256:envelope.sha256,dataset};
  }

  /** @param {Dataset} input */
  async save(input){
    const dataset=normalizeMarketDataset(input);
    if(dataset.schema!==CURRENT_MARKET_DATA_SCHEMA)
      throw new Error('Import requires the explicit v2 market-data provenance contract');
    const operation=this.queue.then(async()=>{
      const old=await this.readEnvelope(dataset.symbol);
      const sha256=digest(dataset);
      if(old){
        const previous=old.dataset.bars.at(-1).date;
        const next=dataset.bars.at(-1).date;
        if(next<previous)throw new Error('Refusing a stale market dataset rollback');
        if(next===previous){
          const withoutRetrieval=(value)=>({
            ...value,provenance:{...value.provenance,retrievedAt:null}
          });
          // A file may be reimported at a new retrieval time without changing
          // the previously verified market observations or source declaration.
          const unchanged=JSON.stringify(withoutRetrieval(old.dataset))===
            JSON.stringify(withoutRetrieval(dataset));
          if(!unchanged)
            throw new Error('Conflicting same-date market history requires explicit provenance review');
          return this.inspect(dataset.symbol);
        }
      }
      const envelope={schema:MARKET_CACHE_SCHEMA,savedAt:new Date().toISOString(),sha256,dataset};
      const file=this.pathFor(dataset.symbol);
      const temporary=file+'.'+process.pid+'.'+randomUUID()+'.tmp';
      await mkdir(dirname(file),{recursive:true,mode:0o700});
      try{
        await writeFile(temporary,JSON.stringify(envelope,null,2)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
        await rename(temporary,file);
      }finally{
        await rm(temporary,{force:true});
      }
      return this.inspect(dataset.symbol);
    });
    this.queue=operation.catch(()=>undefined);
    return operation;
  }
}

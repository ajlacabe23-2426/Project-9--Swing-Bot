import {createHash,randomUUID} from 'node:crypto';
import {mkdir,open,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {normalizeMarketDataset} from './market-intelligence.mjs';

/**
 * Persist only canonical input datasets. normalizeMarketDataset adds an
 * internal inspection field; never write the normalized object as input JSON.
 * Existing source records can only be extended, not silently revised or
 * replaced with older observations. This is a local paper-research cache.
 */
export async function writeReviewedMarketDataset(outputFile,input){
  const validated=normalizeMarketDataset(input);
  const output=resolve(outputFile);
  const lockPath=output+'.lock';
  const tempPath=output+'.'+process.pid+'.'+randomUUID()+'.tmp';
  await mkdir(dirname(output),{recursive:true,mode:0o700});

  let lock;
  try{
    lock=await open(lockPath,'wx',0o600);
  }catch(error){
    if(error?.code==='EEXIST')throw new Error('Research file is locked by another writer; inspect before retrying');
    throw error;
  }
  try{
    let previous=null,hasPreviousFile=false;
    try{
      const existingText=await readFile(output,'utf8');
      hasPreviousFile=true;
      previous=JSON.parse(existingText);
    }catch(error){
      if(error?.code!=='ENOENT')throw new Error('Existing market file is unreadable or invalid; refusing replacement');
    }
    if(hasPreviousFile){
      const old=normalizeMarketDataset(previous);
      if(old.symbol!==validated.symbol||old.source!==validated.source||
         old.currency!==validated.currency||old.mode!==validated.mode||
         old.priceAdjustment!==validated.priceAdjustment||
         old.provenance.adjustmentMethod!==validated.provenance.adjustmentMethod)
        throw new Error('Dataset identity or adjustment method changed; refusing replacement');
      if(validated.bars.at(-1).date<=old.bars.at(-1).date)
        throw new Error('Market data is unchanged or older; refusing stale overwrite');
      if(validated.bars.length<old.bars.length||
         old.bars.some((bar,index)=>{
           const newer=validated.bars[index];
           return !newer||['date','open','high','low','close','volume']
             .some(key=>bar[key]!==newer[key]);
         }))
        throw new Error('Existing historical bars were revised or removed; preserve the earlier dataset for manual review');
    }
    const bytes=JSON.stringify(input,null,2)+'\n';
    await writeFile(tempPath,bytes,{encoding:'utf8',mode:0o600,flag:'wx'});
    await rename(tempPath,output);
    return {
      path:output,
      symbol:validated.symbol,
      latestCompletedBar:validated.bars.at(-1).date,
      barCount:validated.bars.length,
      previousBarCount:hasPreviousFile?previous.bars.length:0,
      sha256:createHash('sha256').update(bytes).digest('hex'),
      paperResearchOnly:true
    };
  }finally{
    await rm(tempPath,{force:true}).catch(()=>{});
    await lock.close();
    await rm(lockPath,{force:true});
  }
}

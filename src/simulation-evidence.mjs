// Read-only evidence identity for built-in fictional classroom fixtures.
// No provider access, user-supplied market input, financial calculations or persistence.
import {createHash} from 'node:crypto';
import {generateScenario} from './synthetic-fixtures.mjs';
import {buildDemoDataset} from './synthetic-demo-fixture.mjs';
import {syntheticReplayBinding} from './workstation-store.mjs';
import {ACCOUNTING_MODE,validateSimulationContract} from './simulation-contract.mjs';

const fields=['date','open','high','low','close','volume'];
const demoSymbols=Object.freeze(['SIM09','SIM10']);
function canonicalBar(bar){
  if(!bar||Object.getPrototypeOf(bar)!==Object.prototype||
    Reflect.ownKeys(bar).length!==fields.length||
    fields.some(k=>!Object.hasOwn(bar,k)))throw new TypeError('Invalid fictional fixture bar');
  return fields.map(k=>bar[k]);
}
function fixture(sourceId,seed){
  if(sourceId==='SIM-01'){
    if(!Number.isSafeInteger(seed)||seed<1||seed>1_000_000)throw new TypeError('Explicit fictional seed required');
    return {bars:generateScenario(seed),exerciseVersion:'generated-v1-seed-'+seed};
  }
  if(demoSymbols.includes(sourceId))return {bars:buildDemoDataset(sourceId).bars,exerciseVersion:'seeded-demo-v1'};
  throw new TypeError('Unrecognized fictional fixture');
}
export function verifyBuiltInPrefix({sourceId,seed,asOf,cursor,bars}){
  const expected=fixture(sourceId,seed);
  if(!Number.isSafeInteger(cursor)||cursor<0||cursor>=expected.bars.length||
    !Array.isArray(bars)||bars.length<=cursor||expected.bars[cursor].date!==asOf)
    throw new TypeError('Invalid fictional fixture cursor or date');
  const prefix=[];
  for(let i=0;i<=cursor;i++){
    const bar=canonicalBar(bars[i]),known=canonicalBar(expected.bars[i]);
    if(bar.some((value,j)=>value!==known[j]))throw new TypeError('Fictional prefix does not match built-in fixture');
    prefix.push(bar);
  }
  const mode=sourceId==='SIM-01'?ACCOUNTING_MODE.FILLED_SIMULATION:ACCOUNTING_MODE.OBSERVATION_REFERENCE;
  return validateSimulationContract({
    version:1,mode,scope:'FICTIONAL_OFFLINE',sourceId,
    prefixDigest:createHash('sha256').update(JSON.stringify({sourceId,exerciseVersion:expected.exerciseVersion,bars:prefix})).digest('hex'),
    exerciseVersion:expected.exerciseVersion,asOf,cursor,currency:'USD',
    precision:mode===ACCOUNTING_MODE.FILLED_SIMULATION?'VIRTUAL_LEDGER_DEFERRED':'REFERENCE_DISPLAY_ONLY',
    costs:mode===ACCOUNTING_MODE.FILLED_SIMULATION?'VIRTUAL_COST_POLICY_DEFERRED':'NOT_APPLICABLE',
    capitalBasis:mode===ACCOUNTING_MODE.FILLED_SIMULATION?'FICTIONAL_LEDGER':'NO_LEDGER',
    visibility:'COMPLETED_PREFIX_ONLY'
  });
}
export function readFictionalContractStatus(paper,workstation){
  const bars=generateScenario(paper.seed);
  const simulation=verifyBuiltInPrefix({sourceId:'SIM-01',seed:paper.seed,
    asOf:bars[paper.cursor]?.date,cursor:paper.cursor,bars});
  const observations=demoSymbols.map(sourceId=>{
    const scan=Object.hasOwn(workstation.lastScans,sourceId)?workstation.lastScans[sourceId]:null;
    const base=buildDemoDataset(sourceId);
    // No scan, missing identity, or engineered extension is never inferred to be verified.
    // Extensions need separately audited, durable scenario lineage.
    if(!scan)return {sourceId,status:'NO_SAVED_SCAN',contract:null};
    if(scan.asOf!==base.sourceAsOf||scan.syntheticReplayBinding!==syntheticReplayBinding(base))
      return {sourceId,status:'UNVERIFIED_SAVED_PREFIX',contract:null};
    return {sourceId,status:'SEED_IDENTITY_MATCH',contract:verifyBuiltInPrefix({
      sourceId,asOf:base.sourceAsOf,cursor:base.bars.length-1,bars:base.bars
    })};
  });
  // Metadata projection only: never aggregate, recompute or expose monetary amounts.
  // Legacy/extended observations are not silently assigned verified contracts.
  const observationRecords=(workstation.tickets??[]).filter(t=>demoSymbols.includes(t.symbol)).map(t=>{
    const base=buildDemoDataset(t.symbol);
    const matched=t.openedAsOf===base.sourceAsOf&&t.syntheticBinding===syntheticReplayBinding(base);
    return {id:t.id,sourceId:t.symbol,accountingMode:ACCOUNTING_MODE.OBSERVATION_REFERENCE,
      openingEvidenceStatus:matched?'SEED_IDENTITY_MATCH':'UNVERIFIED_OPENING_PREFIX',
      openingContract:matched?verifyBuiltInPrefix({sourceId:t.symbol,asOf:base.sourceAsOf,
        cursor:base.bars.length-1,bars:base.bars}):null,
      outcomeVerification:'NOT_CERTIFIED_BY_METADATA'};
  });
  return {scope:'FICTIONAL_OFFLINE',simulation:{status:'BUILT_IN_PREFIX_VERIFIED',accountingMode:ACCOUNTING_MODE.FILLED_SIMULATION,contract:simulation},
    observations,observationRecords,notes:'Metadata only. Seed identity is not proof of observation arithmetic, extended scenario lineage or actual market provenance.'};
}

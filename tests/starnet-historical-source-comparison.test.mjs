import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateScenario} from '../src/synthetic-fixtures.mjs';
import {
  compareLocalHistoricalSources,renderLocalHistoricalComparisonMarkdown
} from '../src/starnet-historical-source-comparison.mjs';
import {parseEvidenceArgs,runEvidenceCli} from '../scripts/starnet-three-level-evidence.mjs';

function input(source='FIRST DECLARED ENGINEERED SOURCE'){
  const bars=generateScenario(73,190),asOf=bars.at(-1).date;
  return {
    schema:'project9-market-data-v2',
    symbol:'SIM09',currency:'USD',source,
    mode:'HISTORICAL',sourceAsOf:asOf,priceAdjustment:'RAW',
    provenance:{
      retrievedAt:asOf+'T00:00:00.000Z',
      adjustmentMethod:'RAW_UNADJUSTED',
      corporateActions:'INDEPENDENTLY_REVIEWED',
      survivorship:'INDEPENDENTLY_REVIEWED',
      licensing:'COMMERCIAL_REDISTRIBUTION_VERIFIED'
    },bars
  };
}
const bytes=data=>Buffer.from(JSON.stringify(data));
const compare=(a,b,cutoff=a.sourceAsOf)=>compareLocalHistoricalSources({
  primaryBytes:bytes(a),witnessBytes:bytes(b),asOf:cutoff
});

test('two matching local histories and two distinct labels do not establish independent authenticity',()=>{
  const a=input(),b=input('ANOTHER CLAIMED PROVIDER');
  const r=compare(a,b);
  assert.equal(r.schema,'project9-offline-cross-source-provenance-audit-v1');
  assert.equal(r.status,'LOCAL_RECORDS_AGREE_AUTHENTICITY_UNVERIFIED');
  assert.equal(r.overlap.commonDates,190);
  assert.equal(r.overlap.priceDiscrepancyDates,0);
  assert.equal(r.overlap.volumeDiscrepancyDates,0);
  assert.equal(r.overlap.onlyPrimaryDates,0);
  assert.equal(r.overlap.onlyWitnessDates,0);
  assert.equal(r.verification.sourceIndependenceAuthenticated,false);
  assert.equal(r.verification.historicalAuthenticityIndependentlyVerified,false);
  assert.equal(r.verification.pointInTimeAvailabilityIndependentlyVerified,false);
  assert.equal(r.verification.dataLicensingIndependentlyVerified,false);
  assert.equal(r.verification.productionGate,'NO_GO');
  assert.equal(r.verification.externalCalls,0);
  assert.equal(r.verification.realOrdersCreated,0);
  assert.ok(r.reviewReasons.includes('SOURCE_INDEPENDENCE_AND_AUTHENTICITY_NOT_ESTABLISHED'));
  assert.notEqual(r.primary.byteSha256,r.witness.byteSha256);
  assert.match(renderLocalHistoricalComparisonMarkdown(r),/NOT independently authenticated history/);
});

test('identical bytes cannot be passed off as independent source evidence',()=>{
  const a=input(),r=compare(a,structuredClone(a));
  assert.equal(r.status,'DUPLICATE_INPUT_NOT_INDEPENDENT');
  assert.equal(r.primary.byteSha256,r.witness.byteSha256);
  assert.ok(r.reviewReasons.includes('IDENTICAL_INPUT_BYTES_NOT_INDEPENDENT'));
  assert.ok(r.reviewReasons.includes('IDENTICAL_DECLARED_SOURCE_LABELS'));
  assert.equal(r.verification.sourceIndependenceAuthenticated,false);
});

test('aligned source differences are reported with counts, bounded samples and raw input hashes',()=>{
  const a=input(),b=input('SECOND ENGINEERED LABEL');
  b.bars[88].close=Number((b.bars[88].close*1.025).toFixed(6));
  b.bars[88].high=Math.max(b.bars[88].high,b.bars[88].close);
  b.bars[100].volume=Math.floor(b.bars[100].volume*1.1);
  b.bars.splice(120,1);
  const original=JSON.stringify(a),witness=JSON.stringify(b);
  const r=compare(a,b);
  assert.equal(r.status,'DISCREPANCIES_REQUIRE_MANUAL_REVIEW');
  assert.equal(r.overlap.commonDates,189);
  assert.equal(r.overlap.onlyPrimaryDates,1);
  assert.equal(r.overlap.onlyWitnessDates,0);
  assert.equal(r.overlap.priceDiscrepancyDates,1);
  assert.equal(r.overlap.volumeDiscrepancyDates,1);
  assert.ok(r.overlap.maxOhlcDifferenceBps>1);
  assert.ok(r.reviewReasons.includes('OHLC_PRICE_DISCREPANCIES'));
  assert.ok(r.reviewReasons.includes('VOLUME_DISCREPANCIES'));
  assert.ok(r.reviewReasons.includes('MISSING_DATES_BETWEEN_LOCAL_INPUTS'));
  assert.ok(r.discrepancySamples.length>=3&&r.discrepancySamples.length<=12);
  assert.equal(r.primary.byteSha256,createHash('sha256').update(original).digest('hex'));
  assert.equal(r.witness.byteSha256,createHash('sha256').update(witness).digest('hex'));
  assert.equal(JSON.stringify(a),original);
  assert.equal(JSON.stringify(b),witness);
});

test('missing overlap, differences in price adjustment and post-cutoff retrieval are separately flagged',()=>{
  const a=input(),b=input('UNVERIFIED SECOND SOURCE');
  a.bars=a.bars.slice(0,90);
  b.bars=b.bars.slice(90);
  const noOverlap=compare(a,b);
  assert.equal(noOverlap.status,'INSUFFICIENT_OVERLAP');
  assert.equal(noOverlap.overlap.commonDates,0);
  assert.ok(noOverlap.reviewReasons.includes('FEWER_THAN_60_MATCHED_DATES'));

  const fresh=input(),adjusted=input('ADJUSTED PROVIDER');
  adjusted.priceAdjustment='VENDOR_ADJUSTED';
  adjusted.provenance.adjustmentMethod='PROVIDER_ADJUSTED_DOCUMENTED';
  const conflict=compare(fresh,adjusted);
  assert.equal(conflict.status,'DISCREPANCIES_REQUIRE_MANUAL_REVIEW');
  assert.ok(conflict.reviewReasons.includes('PRICE_ADJUSTMENT_OR_METHODOLOGY_CONFLICT'));
  assert.equal(conflict.overlap.priceDiscrepancyDates,0);

  const later=input('DECLARED LATER RETRIEVAL');
  const date=new Date(later.sourceAsOf+'T00:00:00Z');
  date.setUTCDate(date.getUTCDate()+2);
  later.provenance.retrievedAt=date.toISOString().slice(0,10)+'T00:00:00Z';
  const after=compare(fresh,later);
  assert.ok(after.reviewReasons.includes('RETRIEVAL_DECLARED_AFTER_COMPARISON_CUTOFF'));
  assert.equal(after.verification.pointInTimeAvailabilityIndependentlyVerified,false);
});

test('future bars, mismatched identities and malformed source records fail closed',()=>{
  const a=input(),b=input('DIFFERENT NAME');
  assert.throws(()=>compare(a,{...b,symbol:'OTHER'}),/different instrument/i);
  assert.throws(()=>compare(a,{...b,currency:'EUR'}),/different instrument/i);
  const prev=new Date(a.sourceAsOf+'T00:00:00Z');
  prev.setUTCDate(prev.getUTCDate()-1);
  assert.throws(()=>compare(a,b,prev.toISOString().slice(0,10)),/future-dated/i);
  const bad=structuredClone(b);
  bad.bars[14].low=100000;
  assert.throws(()=>compare(a,bad),/inconsistent OHLC/);
  bad.bars[14]=structuredClone(b.bars[14]);
  bad.bars[14].date=bad.bars[13].date;
  assert.throws(()=>compare(a,bad),/strictly ascending/);
  const unsafe=structuredClone(b);
  unsafe.accountId='real-account';
  assert.throws(()=>compare(a,unsafe),/unsupported fields/);
  const withBytes={primaryBytes:bytes(a),witnessBytes:Buffer.from('{'),asOf:a.sourceAsOf};
  assert.throws(()=>compareLocalHistoricalSources(withBytes),/not JSON/);
  assert.throws(()=>compareLocalHistoricalSources({primaryBytes:bytes(a),witnessBytes:bytes(b),asOf:'2026-02-30'}),/valid explicit/);
});

test('separate local witness file extends the unified evidence report without permitting a research GO',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-provenance-fixture-'));
  try{
    const a=input(),b=input('LOCAL WITNESS LABEL');
    b.bars[88].close=Number((b.bars[88].close*1.02).toFixed(6));
    b.bars[88].high=Math.max(b.bars[88].high,b.bars[88].close);
    const p=join(dir,'primary.json'),w=join(dir,'witness.json');
    const raw=JSON.stringify(a,null,2)+'\n',witness=JSON.stringify(b);
    await writeFile(p,raw);await writeFile(w,witness);
    const args=['--as-of',a.sourceAsOf,p,'--compare',w];
    assert.deepEqual(parseEvidenceArgs(args),{
      mode:'LOCAL_FILE',asOf:a.sourceAsOf,path:p,witnessPath:w,markdown:false
    });
    const report=await runEvidenceCli(args);
    const comparison=report.levels.research.crossSourceComparison;
    assert.equal(comparison.status,'DISCREPANCIES_REQUIRE_MANUAL_REVIEW');
    assert.equal(comparison.primary.byteSha256,createHash('sha256').update(raw).digest('hex'));
    assert.equal(comparison.witness.byteSha256,createHash('sha256').update(witness).digest('hex'));
    assert.equal(report.levels.research.historicalAuthenticityIndependentlyVerified,false);
    assert.equal(report.levels.research.testedOutOfSampleEfficacy,false);
    assert.equal(report.levels.operations.status,'NOT_VERIFIED');
    assert.equal(report.overall.productionGate,'NO_GO');
    const markdown=await runEvidenceCli([...args,'--markdown']);
    assert.match(markdown,/DISCREPANCIES_REQUIRE_MANUAL_REVIEW/);
    assert.match(markdown,/NO_GO/);
    assert.deepEqual(await readFile(p,'utf8'),raw);
    assert.deepEqual(await readFile(w,'utf8'),witness);
    for(const invalid of [
      ['--as-of',a.sourceAsOf,p,'--compare','--live'],
      ['--as-of',a.sourceAsOf,p,'--compare',w,'--broker'],
      ['--live','--as-of',a.sourceAsOf,p,'--compare',w]
    ])assert.throws(()=>parseEvidenceArgs(invalid),/Usage/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('engineered --demo intentionally reveals source mismatch without any false authentication',async()=>{
  const json=await runEvidenceCli(['--demo']);
  const compare=json.levels.research.crossSourceComparison;
  assert.equal(compare.status,'DISCREPANCIES_REQUIRE_MANUAL_REVIEW');
  assert.equal(compare.overlap.commonDates,189);
  assert.equal(compare.overlap.onlyPrimaryDates,1);
  assert.equal(compare.overlap.priceDiscrepancyDates,1);
  assert.equal(compare.overlap.volumeDiscrepancyDates,0);
  assert.equal(compare.verification.sourceIndependenceAuthenticated,false);
  assert.equal(compare.verification.historicalAuthenticityIndependentlyVerified,false);
  assert.equal(json.overall.productionGate,'NO_GO');
  const md=await runEvidenceCli(['--demo','--markdown']);
  assert.match(md,/Cross-source local evidence: DISCREPANCIES_REQUIRE_MANUAL_REVIEW/);
});

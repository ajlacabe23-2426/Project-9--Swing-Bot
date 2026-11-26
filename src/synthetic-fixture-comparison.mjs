import {createHash} from 'node:crypto';

// Offline educational evidence only. No network or financial account access.
const fingerprint = bytes => createHash('sha256').update(bytes).digest('hex');
const FIELDS = ['open','high','low','close'];
function parseFixture(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length===0 || bytes.length>512000)
    throw new TypeError('Expected bounded fixture bytes');
  const data=JSON.parse(bytes.toString('utf8'));
  if(data?.schema!=='synthetic-candle-fixture-v1' || data?.fictional!==true ||
     typeof data.source!=='string' || !/^[a-z0-9-]{1,64}$/.test(data.source) ||
     !Array.isArray(data.rows) || data.rows.length<1 || data.rows.length>1000)
    throw new TypeError('Invalid synthetic fixture');
  const rows=new Map();
  let previous=-Infinity;
  for(const row of data.rows){
    if(!row || !Number.isSafeInteger(row.timestamp) || row.timestamp<0 ||
       row.timestamp%3600!==0 || row.timestamp<=previous ||
       !FIELDS.every(k=>typeof row[k]==='number' && Number.isFinite(row[k]) && row[k]>0) ||
       row.high<Math.max(row.open,row.close) || row.low>Math.min(row.open,row.close))
      throw new TypeError('Invalid or unordered fixture record');
    previous=row.timestamp;
    rows.set(row.timestamp,row);
  }
  return {source:data.source,rows,sha256:fingerprint(bytes)};
}
export function compareSyntheticFixtures(leftBytes,rightBytes){
  const left=parseFixture(leftBytes), right=parseFixture(rightBytes);
  if(left.source===right.source)throw new TypeError('Distinct fixture labels required');
  const timestamps=[...new Set([...left.rows.keys(),...right.rows.keys()])].sort((a,b)=>a-b);
  const differences=[];
  let matched=0;
  for(const timestamp of timestamps){
    const a=left.rows.get(timestamp), b=right.rows.get(timestamp);
    if(!a || !b){differences.push({timestamp,kind:a?'MISSING_RIGHT':'MISSING_LEFT'});continue;}
    const fields=FIELDS.filter(k=>a[k]!==b[k]);
    if(fields.length)differences.push({timestamp,kind:'VALUE_DISAGREEMENT',fields});
    else matched++;
  }
  return {schema:'synthetic-fixture-comparison-v1',fictional:true,intervalSeconds:3600,
    sources:[{label:left.source,sha256:left.sha256},{label:right.source,sha256:right.sha256}],
    comparedTimestamps:timestamps.length,matched,differences,
    status:differences.length?'REVIEW_REQUIRED':'FIXTURES_AGREE',
    independentlyAuthenticated:false,realMarketEvidence:false};
}

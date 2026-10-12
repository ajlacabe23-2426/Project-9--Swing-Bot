import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDecisionMap,projectPoint} from '../public/decision-map-core.mjs';
import {evaluateSwingSetup,MARKET_DATA_SCHEMA} from '../src/market-intelligence.mjs';
function dataset(){
  const bars=[],date=new Date('2026-01-01T00:00:00.000Z');
  while(bars.length<90){
    date.setUTCDate(date.getUTCDate()+1);if([0,6].includes(date.getUTCDay()))continue;
    const close=100+bars.length*.2+Math.sin(bars.length)*.3;
    bars.push({date:date.toISOString().slice(0,10),open:close-.1,high:close+1,low:close-1,close,volume:100000});
  }
  return {schema:MARKET_DATA_SCHEMA,symbol:'TEST',currency:'USD',source:'Synthetic map test',mode:'HISTORICAL',sourceAsOf:bars.at(-1).date,priceAdjustment:'RAW',bars};
}
const scan=()=>evaluateSwingSetup(dataset());
test('map uses exact scanner references without changing inputs or deriving additional signals',()=>{
  const input=scan(),before=structuredClone(input),model=buildDecisionMap(input);
  assert.deepEqual(model.references,{entry:input.paperRiskPlan.entryReference,stop:input.paperRiskPlan.stopReference,target:input.paperRiskPlan.targetReference});
  assert.deepEqual(input,before);assert.match(model.summary,/not executable/);
  assert.ok(model.nodes.every(n=>n.code.startsWith('src/')));
});
test('frozen ticket levels and outcome do not drift when current scan changes',()=>{
  const input=scan(),ticket={id:'P9-0001',symbol:'TEST',openedAsOf:'2026-02-02',entryReference:100,stopReference:95,targetReference:110,scoreAtOpen:80,classificationAtOpen:'PAPER_SETUP_STRONG',outcome:{status:'AMBIGUOUS_SAME_BAR',observedThrough:'2026-02-03'}};
  const before=structuredClone(ticket),model=buildDecisionMap(input,ticket);
  assert.deepEqual(model.references,{entry:100,stop:95,target:110});assert.equal(model.referenceDate,ticket.openedAsOf);
  assert.match(model.nodes.find(n=>n.id==='risk').detail,/At-open ATR.*were not stored/);
  assert.match(model.nodes.find(n=>n.id==='journal').detail,/AMBIGUOUS_SAME_BAR/);
  input.paperRiskPlan.entryReference=999;assert.deepEqual(buildDecisionMap(input,ticket).references,model.references);
  assert.deepEqual(ticket,before);
});
test('invalid frozen levels or symbol mismatch cannot silently fall back to a fresh plan',()=>{
  const input=scan();
  for(const ticket of [
    {symbol:'OTHER',entryReference:100,stopReference:90,targetReference:120},
    {symbol:'TEST',entryReference:100,stopReference:100,targetReference:120},
    {symbol:'TEST',entryReference:100,stopReference:90,targetReference:null}
  ]){
    const model=buildDecisionMap(input,ticket);assert.equal(model.references,null);
    assert.ok(model.nodes.filter(n=>['entry','stop','target'].includes(n.id)).every(n=>n.tone==='blocked'));
  }
});
test('empty map and blocked setup never imply eligibility',()=>{
  assert.equal(buildDecisionMap(null).references,null);
  const input=scan();input.classification='NO_PAPER_SETUP';
  const gate=buildDecisionMap(input).nodes.find(n=>n.id==='gate');assert.equal(gate.value,'Blocked');
  input.classification='PAPER_SETUP_STRONG';input.paperRiskPlan.maxPaperUnits=0;
  assert.equal(buildDecisionMap(input).nodes.find(n=>n.id==='gate').value,'Blocked');
});
test('map at an earlier as-of is unaffected by later prices and volumes',()=>{
  const input=dataset(),earlier=evaluateSwingSetup(input,{asOfIndex:65});
  const before=buildDecisionMap(earlier);
  for(const bar of input.bars.slice(66)){bar.open*=2;bar.high*=2;bar.low*=2;bar.close*=2;bar.volume*=3;}
  assert.deepEqual(buildDecisionMap(evaluateSwingSetup(input,{asOfIndex:65})),before);
});
test('3D projection keeps nodes finite and selectable; flat view removes depth',()=>{
  for(const node of buildDecisionMap(scan()).nodes){
    const flat=projectPoint(node.position,{flat:true});assert.equal(flat.depth,0);
    for(const yaw of [-.6,0,.6])for(const pitch of [-.35,0,.35]){
      const p=projectPoint(node.position,{yaw,pitch});assert.ok(Number.isFinite(p.depth));
      assert.ok(p.x>0&&p.x<1000&&p.y>0&&p.y<460);
    }
  }
});

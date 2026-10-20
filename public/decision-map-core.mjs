// Read-only projection of existing scanner/ticket outputs; never generates a signal.
export const MAP_EDGES=[['source','trend'],['source','momentum'],['source','breakout'],['trend','gate'],['momentum','gate'],['breakout','gate'],['source','risk'],['gate','entry'],['risk','stop'],['risk','target'],['entry','journal'],['stop','journal'],['target','journal']];
const price=value=>Number.isFinite(value)?value.toFixed(4):'unavailable';
const date=value=>typeof value==='string'?value:'unknown';

export function buildDecisionMap(scan,ticket=null){
  if(!scan)return {nodes:[],edges:[],references:null,summary:'Select a scanned symbol to explore its decision path.'};
  const frozen=!!ticket;
  const p=frozen?ticket:scan.paperRiskPlan;
  // Never fall back to fresh scan levels when a selected frozen ticket is invalid.
  const valid=(!frozen||ticket.symbol===scan.symbol)&&p&&
    [p.entryReference,p.stopReference,p.targetReference].every(v=>Number.isFinite(v)&&v>0)&&
    p.stopReference<p.entryReference&&p.targetReference>p.entryReference;
  const references=valid?{entry:p.entryReference,stop:p.stopReference,target:p.targetReference}:null;
  const refDate=date(frozen?ticket.openedAsOf:scan.asOf);
  const refLabel=frozen?'Frozen '+ticket.id+' · '+refDate:'Current scan · '+refDate;
  const o=scan.observed||{},checks=scan.checks||{};
  const eligible=['PAPER_SETUP_WATCH','PAPER_SETUP_STRONG'].includes(scan.classification)&&
    Number.isFinite(scan.paperRiskPlan?.maxPaperUnits)&&scan.paperRiskPlan.maxPaperUnits>=0.001;
  const make=(id,label,value,position,code,detail,tone='evidence')=>({id,label,value,position,code,detail,tone});
  const nodes=[
    make('source','Completed bars',date(scan.asOf),[-370,0,-40],'src/market-intelligence.mjs · normalizeMarketDataset',
      'Latest scan: '+scan.symbol+' as of '+date(scan.asOf)+'. Source: '+(scan.source?.name||'unknown')+' / '+(scan.source?.mode||'unknown')+'. Source as of '+date(scan.source?.sourceAsOf)+'. Data quality: '+(scan.dataQuality?.status||'unknown')+'. Provenance review: '+(scan.dataQuality?.provenanceReview?.status||'unknown')+'. Structural validation does not verify market-data authenticity.'),
    make('trend','Trend checks',(checks.above20&&checks.trendAligned)?'Both pass':'Incomplete',[-200,-130,-65],'src/market-intelligence.mjs · evaluateSwingSetup',
      'Current scan '+date(scan.asOf)+': close '+price(o.close)+' > SMA20 '+price(o.sma20)+' contributes 20 points when true; SMA20 > SMA50 '+price(o.sma50)+' contributes 25. Checks use completed bars through this scan date.'),
    make('momentum','Momentum',Number.isFinite(o.rsi14)?'RSI '+o.rsi14:'Unavailable',[-200,0,0],'src/engine.mjs · rsi',
      'Current scan '+date(scan.asOf)+': RSI14 '+price(o.rsi14)+'. Scanner research band: 50–72 inclusive, worth 20 points. RSI alone does not authorize an entry.'),
    make('breakout','Breakout / volume',(checks.breakout?'Breakout pass':'No breakout'),[-200,130,65],'src/market-intelligence.mjs · evaluateSwingSetup',
      'Current scan '+date(scan.asOf)+': close must exceed prior 20-session high '+price(o.prior20High)+' for 25 points. Relative volume '+price(o.relativeVolume)+' must be at least 1.2 for 10 points. The prior-high window excludes the current bar.'),
    make('gate','Paper eligibility',eligible?'Eligible for review':'Blocked',[-15,-70,-35],'src/workstation-store.mjs · createTicket',
      'Current scan '+date(scan.asOf)+': score '+scan.score+'/100; '+scan.classification+'. Watch requires at least 60 points, strong at least 80, and a positive virtual-unit allowance. '+(frozen?'The selected ticket opened '+refDate+' at score '+ticket.scoreAtOpen+' with '+ticket.classificationAtOpen+'. Current indicators are not an at-open snapshot.':'Eligibility permits a hypothetical ticket; it does not mean buy now.'),eligible?'entry':'blocked'),
    make('risk','Risk basis',frozen?'Frozen references':'2 × ATR14',[-15,110,65],'src/market-intelligence.mjs · evaluateSwingSetup',
      frozen?'Frozen '+ticket.id+' opened '+refDate+'. Its entry/stop/target are preserved exactly. At-open ATR and individual indicator checks were not stored, so current ATR is not used to reconstruct them.':
      'Current ATR14 '+price(o.atr14)+'. Nominal risk distance = 2 × ATR14; stop = max(0.01, entry − distance); target = entry + 2 × distance. Budget '+price(scan.paperRiskPlan?.paperRiskBudget)+' / nominal distance sets maximum units (floored to 0.001). References omit fees, slippage and gap fills.'),
    make('entry','Entry reference',references?price(references.entry):'Unavailable',[180,-130,45],'src/workstation-store.mjs · createTicket',
      refLabel+'. '+(frozen?'Saved hypothetical entry '+price(references?.entry)+'.':'Entry reference '+price(references?.entry)+' is the completed close; it is not a next-session fill or breakout trigger.')+' '+(!eligible&&!frozen?'Current scan is blocked: no paper ticket can be created.':'Paper research only.'),'entry'),
    make('stop','Stop reference',references?price(references.stop):'Unavailable',[180,0,-30],'src/workstation-store.mjs · evaluatePaperTicket',
      refLabel+'. Lower reference '+price(references?.stop)+'. Subsequent completed bars with low at or below this level mark a paper stop touch. Gaps/slippage can produce a different executable price; this level is not a guaranteed fill.','stop'),
    make('target','Target reference',references?price(references.target):'Unavailable',[180,130,45],'src/workstation-store.mjs · evaluatePaperTicket',
      refLabel+'. Upper reference '+price(references?.target)+'. Subsequent completed bars with high at or above this level mark a paper target touch. A displayed target does not forecast that it will be reached.','target'),
    make('journal','Outcome',frozen?(ticket.outcome?.status||'Unknown').replaceAll('_',' '):'Ticket not selected',[370,0,0],'src/workstation-store.mjs · evaluatePaperTicket',
      frozen?'Frozen '+ticket.id+': '+(ticket.outcome?.status||'unknown')+'; observed through '+date(ticket.outcome?.observedThrough)+'. '+(ticket.outcome?.note||'')+' Opening-day bars are excluded. Stop and target touched in one daily bar remain ambiguous; no exit ordering is invented.':
      'Choose a frozen ticket to inspect its outcome. Future outcomes are evaluated only after the opening date. No paper ticket is created by rotating, selecting, or changing map views.')
  ];
  if(!references){
    for(const node of nodes.filter(n=>['entry','stop','target'].includes(n.id))){node.tone='blocked';node.detail='Reference levels are incomplete or inconsistent. No marker is drawn. '+refLabel;}
  }
  return {nodes,edges:MAP_EDGES.map(pair=>[...pair]),references,referenceDate:refDate,referenceLabel:refLabel,
    summary:refLabel+'. '+(frozen?'Indicators show the current scan; frozen levels show the selected ticket.':'These are hypothetical close/ATR references, not executable buy/sell signals.')};
}

export function projectPoint([x,y,z],{yaw=0.18,pitch=-0.12,flat=false}={}){
  if(flat)return {x:500+x,y:230+y,depth:0};
  const rx=x*Math.cos(yaw)+z*Math.sin(yaw),rz=-x*Math.sin(yaw)+z*Math.cos(yaw);
  const ry=y*Math.cos(pitch)-rz*Math.sin(pitch),depth=y*Math.sin(pitch)+rz*Math.cos(pitch);
  const scale=1100/(1100+depth);
  return {x:500+rx*scale,y:230+ry*scale,depth};
}

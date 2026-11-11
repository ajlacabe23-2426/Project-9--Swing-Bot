/** Per-unit retrospective references, not fills, portfolio NAV or total returns. */
export const RETURN_CONTRACT=Object.freeze({
  version:'P9_CASH_OUTLAY_RETURN_V2',
  basis:'ENTRY_CASH_OUTLAY',
  capitalConvention:'One independent notional unit per observation; no portfolio compounding',
  costs:'Proportional fee and adverse slippage each side; no minimum fee, dividends or gap-fill model',
  precision:'Raw IEEE-754 numbers retained; display aliases use Number(toFixed(4)); means use raw returns',
  sign:'Positive net PL is positive; exactly zero is not a positive outcome',
  referenceBasis:'Slippage-adjusted entry price excluding entry fee'
});

export function modeledReturns(open,close,{feeBps,slippageBps}){
  const fee=feeBps/10000,slippage=slippageBps/10000;
  const entryReference=open*(1+slippage),exitReference=close*(1-slippage);
  const entryFee=entryReference*fee,exitFee=exitReference*fee;
  const entryCashOutlay=entryReference*(1+fee);
  const exitCashProceeds=exitReference*(1-fee);
  const netPLPerUnit=exitCashProceeds-entryCashOutlay;
  return {rawEntryOpen:open,rawExitClose:close,entryReference,exitReference,
    entryFee,exitFee,entryCashOutlay,exitCashProceeds,netPLPerUnit,
    cashOutlayReturnPct:100*netPLPerUnit/entryCashOutlay,
    referenceReturnPct:100*netPLPerUnit/entryReference};
}

export function observationWindow(bars,i,holdingBars){
  return {signalIndex:i,entryIndex:i+1,exitIndex:i+holdingBars,
    signalDate:bars[i].date,entryDate:bars[i+1].date,
    exitDate:bars[i+holdingBars].date,holdingBars};
}

export function windowDefinition(firstSignalIndex,holdingBars){
  return {version:'P9_COMPLETED_SESSION_WINDOW_V1',firstSignalIndex,holdingBars,
    entryReference:'Open at signal index i + 1',
    exitReference:`Close at signal index i + ${holdingBars} (${holdingBars} completed sessions after signal)`,
    nonOverlap:'Next eligible signal may occur at the previous exit close; next entry is a later open',
    censoredTail:'Signals without a completed exit through reviewDate are excluded'};
}

export function meanReturn(outcomes,key){
  return outcomes.length?outcomes.reduce((sum,o)=>sum+o.returns[key],0)/outcomes.length:null;
}
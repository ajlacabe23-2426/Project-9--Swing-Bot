/**
 * Offline example only. Does not read user datasets, send traffic,
 * inspect accounts, modify workstations, or create transactions.
 */
import {pathToFileURL} from 'node:url';
import {
  MARKET_RAIL, EVIDENCE_DECLARATION, reviewMarketRail, compareRailIdentities
} from '../src/starnet-market-rails.mjs';

const M = EVIDENCE_DECLARATION.MISSING;
export function makeFictionalRailDemo() {
  const equity = {
    schema: 'project9-market-rail-descriptor-v1', scope: 'FICTIONAL_OFFLINE',
    rail: MARKET_RAIL.LISTED_EQUITY,
    instrumentId: 'SIM-EQUITY-ONE', referenceInstrument: null,
    declaredEvidence: {
      listingIdentity: M, dataRights: M, exchangeCalendar: M,
      corporateActions: M, custodyAndOwnership: M
    }
  };
  const tokenized = {
    schema: 'project9-market-rail-descriptor-v1', scope: 'FICTIONAL_OFFLINE',
    rail: MARKET_RAIL.TOKENIZED_SECURITY,
    instrumentId: 'SIM-TOKEN-ONE', referenceInstrument: 'SIM-EQUITY-ONE',
    declaredEvidence: {
      issuerAndLegalForm: M, underlyingRights: M, custodyOrBacking: M,
      networkAndGovernance: M, transferRestrictions: M,
      redemptionAndReconciliation: M, dataRights: M
    }
  };
  return {
    schema: 'project9-starnet-rail-demo-v1',
    scope: 'ENGINEERED_FICTIONAL_RESEARCH_ONLY',
    instruments: [reviewMarketRail(equity), reviewMarketRail(tokenized)],
    comparison: compareRailIdentities(equity, tokenized),
    productionGate: 'NO_GO'
  };
}

export function runRailDemo(argv) {
  if (argv.length !== 1 || argv[0] !== '--demo') {
    throw new TypeError('Usage: npm run research:rails -- --demo (offline only)');
  }
  return makeFictionalRailDemo();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(JSON.stringify(runRailDemo(process.argv.slice(2)), null, 2) + '\n');
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}

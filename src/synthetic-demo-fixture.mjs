/** Validated built-in fictional fixture adapter, independent of the CLI. */
import {CURRENT_MARKET_DATA_SCHEMA,normalizeMarketDataset} from './market-intelligence.mjs';
import {buildDemoFixture,DEMO_SYMBOLS,LABEL} from './synthetic-fixtures.mjs';
export {DEMO_SYMBOLS,LABEL};
export function buildDemoDataset(symbol,{retrievedAt='2026-10-24T00:00:00.000Z'}={}){
  const dataset=buildDemoFixture(symbol,{retrievedAt,schema:CURRENT_MARKET_DATA_SCHEMA});
  normalizeMarketDataset(dataset);
  return dataset;
}

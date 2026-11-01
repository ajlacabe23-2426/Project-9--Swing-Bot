export interface MarketDailyBar {
  readonly date: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export type MarketDataMode = 'HISTORICAL' | 'DELAYED' | 'REALTIME';
export type PriceAdjustment = 'RAW' | 'VENDOR_ADJUSTED' | 'UNKNOWN';

export interface MarketProvenanceV2 {
  readonly retrievedAt: string;
  readonly adjustmentMethod:
    | 'RAW_UNADJUSTED'
    | 'PROVIDER_ADJUSTED_UNVERIFIED'
    | 'PROVIDER_ADJUSTED_DOCUMENTED'
    | 'UNKNOWN';
  readonly corporateActions:
    | 'NOT_VERIFIED'
    | 'PROVIDER_ADJUSTED_NOT_INDEPENDENTLY_VERIFIED'
    | 'INDEPENDENTLY_REVIEWED';
  readonly survivorship:
    | 'NOT_ASSESSED'
    | 'POINT_IN_TIME_UNIVERSE_DECLARED'
    | 'INDEPENDENTLY_REVIEWED';
  readonly licensing:
    | 'NOT_VERIFIED'
    | 'USER_ASSERTED_PERMITTED'
    | 'PROVIDER_TERMS_REVIEW_REQUIRED'
    | 'COMMERCIAL_REDISTRIBUTION_VERIFIED';
  readonly contract?: 'V2_DECLARED';
}

export interface HistoricalMarketDatasetV2 {
  readonly schema: 'project9-market-data-v2';
  readonly symbol: string;
  readonly currency: string;
  readonly source: string;
  readonly mode: MarketDataMode;
  readonly sourceAsOf: string;
  readonly priceAdjustment: PriceAdjustment;
  readonly provenance: MarketProvenanceV2;
  readonly bars: ReadonlyArray<MarketDailyBar>;
}

export interface MarketCacheInspection {
  readonly symbol: string;
  readonly source: string;
  readonly dataMode: MarketDataMode;
  readonly sourceAsOf: string;
  readonly latestBar: string;
  readonly bars: number;
  readonly savedAt: string;
  readonly sha256: string;
  readonly integrity: 'LOCAL_DIGEST_MATCH_ONLY';
}

export declare const MARKET_CACHE_SCHEMA: 'project9-market-cache-v1';

/** Local-only, one-process historical-research persistence. */
export declare class MarketCache {
  constructor(directory?: string);
  readonly directory: string;
  pathFor(symbol: string): string;
  inspect(symbol: string): Promise<MarketCacheInspection | null>;
  read(symbol: string): Promise<HistoricalMarketDatasetV2 | null>;
  save(input: HistoricalMarketDatasetV2): Promise<MarketCacheInspection>;
}

// ---------------------------------------------------------------------------
// Core API Data Types
// ---------------------------------------------------------------------------

/** A single NAV data point, with the date parsed from the API string. */
export interface NavPoint {
  date: Date;
  nav: number;
}

/** Fund metadata returned by mfapi.in */
export interface FundMeta {
  fund_house: string;
  scheme_type: string;
  scheme_category: string;
  scheme_code: number;
  scheme_name: string;
}

/** Full fund details: metadata + chronologically-sorted NAV history */
export interface FundDetails {
  meta: FundMeta;
  /** Sorted ascending by date, NAV already parsed to number */
  data: NavPoint[];
}

/** An entry from the /mf (all schemes) endpoint */
export interface SchemeListItem {
  schemeCode: number;
  schemeName: string;
}

// ---------------------------------------------------------------------------
// Financial Calculation Result Types
// ---------------------------------------------------------------------------

/** Rolling CAGR data point */
export interface RollingPoint {
  date: Date;
  cagrPct: number;
}

/** Statistics over a rolling CAGR series */
export interface RollingStats {
  avg: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
  pctPositive: number | null;
  count: number;
}

/** Best or worst historical window */
export interface WindowResult {
  pct: number;
  start: Date;
  end: Date;
}

/** Output of the best/worst windows analysis */
export interface BestWorstResult {
  best: WindowResult;
  worst: WindowResult;
  median: number;
  count: number;
}

/** Annual return + intra-year volatility */
export interface AnnualReturn {
  year: number;
  returnPct: number;
  /** Annualised daily-log-return volatility for the year */
  volatilityPct: number;
  /** True if the year is not yet complete */
  incomplete: boolean;
}

/** A single cashflow (negative = outflow, positive = inflow) */
export interface Cashflow {
  date: Date;
  amount: number;
}

/** Snapshot of portfolio value at a point in time for charting */
export interface SipSnapshot {
  date: Date;
  net: number;
  gross: number;
  invested: number;
}

/** Full output of simulateSip() */
export interface SipResult {
  startDate: Date;
  endDate: Date;
  actualYears: number;

  lumpInvested: number;
  finalLumpGross: number;
  finalLumpNet: number;
  lumpFees: number;
  lumpCagrGross: number | null;
  lumpCagrNet: number | null;

  sipInvested: number;
  sipInstalments: number;
  finalSipGross: number;
  finalSipNet: number;
  sipFees: number;
  sipXirrGross: number | null;
  sipXirrNet: number | null;

  totalInvested: number;
  combinedGross: number;
  combinedNet: number;
  combinedXirrGross: number | null;
  combinedXirrNet: number | null;
  totalFees: number;

  snapshots: SipSnapshot[];
  expenseRatio: number;
}

/** MPT risk metric results */
export interface RiskMetrics {
  /** Annualised Sharpe Ratio */
  sharpe: number | null;
  /** Annualised Sortino Ratio */
  sortino: number | null;
  /** Maximum drawdown as a negative percentage */
  maxDrawdownPct: number;
  /** Annualised volatility % */
  annualisedVolatilityPct: number | null;
}

/** Beta/Alpha/R² vs benchmark */
export interface BetaAlphaResult {
  /** Annualised Alpha % */
  alphaAnnualisedPct: number;
  /** Beta */
  beta: number;
  /** R-squared */
  rSquared: number;
}

/** Upside/Downside capture + Tracking Error + IR */
export interface CaptureResult {
  upsidePct: number | null;
  downsidePct: number | null;
  trackingErrorPct: number;
  informationRatio: number | null;
}

/** A single entry in the rankings list */
export interface RankingEntry {
  schemeCode: number;
  schemeName: string;
  sipXirrPct: number | null;
  lumpsumCagrPct: number | null;
}

/** A fund in the portfolio builder */
export interface PortfolioFund {
  schemeCode: number;
  schemeName: string;
  weightPct: number;
}

// ---------------------------------------------------------------------------
// Period Return Descriptor
// ---------------------------------------------------------------------------

export type PeriodKind = 'abs' | 'ytd' | 'cagr' | 'inception';

export interface PeriodDef {
  key: string;
  label: string;
  kind: PeriodKind;
  days?: number;
  years?: number;
}

export const PERIODS: PeriodDef[] = [
  { key: '1d',  label: '1D',  kind: 'abs',  days: 1 },
  { key: '1w',  label: '1W',  kind: 'abs',  days: 7 },
  { key: '1m',  label: '1M',  kind: 'abs',  days: 30 },
  { key: '3m',  label: '3M',  kind: 'abs',  days: 91 },
  { key: '6m',  label: '6M',  kind: 'abs',  days: 182 },
  { key: 'ytd', label: 'YTD', kind: 'ytd' },
  { key: '1y',  label: '1Y',  kind: 'abs',  days: 365 },
  { key: '3y',  label: '3Y',  kind: 'cagr', days: 1095, years: 3 },
  { key: '5y',  label: '5Y',  kind: 'cagr', days: 1825, years: 5 },
  { key: '7y',  label: '7Y',  kind: 'cagr', days: 2555, years: 7 },
  { key: '10y', label: '10Y', kind: 'cagr', days: 3650, years: 10 },
  { key: '15y', label: '15Y', kind: 'cagr', days: 5475, years: 15 },
  { key: 'si',  label: 'SI',  kind: 'inception' },
];

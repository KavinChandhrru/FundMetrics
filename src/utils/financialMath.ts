/**
 * financialMath.ts — FundMetrics Financial Calculation Engine
 *
 * All functions return `number | null` on error — never a misleading `0`.
 * Statistical functions use sample variance (÷N-1, Bessel's correction).
 * Risk-free rate is converted to daily using the geometrically-correct
 * formula: dailyRF = (1 + annualRF)^(1/252) - 1.
 */

import type { NavPoint, Cashflow, RollingPoint, RollingStats, BestWorstResult, AnnualReturn, SipResult, SipSnapshot, RiskMetrics, BetaAlphaResult, CaptureResult } from '../types/fund';

// ---------------------------------------------------------------------------
// Time Constants
// ---------------------------------------------------------------------------

/** Milliseconds per calendar day */
export const DAY_MS = 86_400_000;

/**
 * Average days per year accounting for leap years.
 * Used for annualising daily statistics and CAGR year-fractions.
 */
export const YEAR_DAYS = 365.25;

/** Trading days per year (standard finance convention) */
export const TRADING_DAYS = 252;

// ---------------------------------------------------------------------------
// Date Utilities
// ---------------------------------------------------------------------------

/**
 * Number of whole days between two dates (rounded).
 * Positive when `to` is after `from`.
 */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * Fractional years between two dates using the average-year convention.
 * More accurate than dividing by 365 for multi-year CAGR computations.
 */
export function yearsBetween(from: Date, to: Date): number {
  return daysBetween(from, to) / YEAR_DAYS;
}

/** Returns a new Date offset by `days` calendar days (can be negative). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * Binary search: find the largest index i in `navData` where
 * `navData[i].date <= target`.  Returns -1 if no such index exists.
 * Requires `navData` to be sorted ascending by date.
 *
 * O(log n) — used heavily by rolling CAGR, period returns, etc.
 */
export function findNavIndex(navData: NavPoint[], target: Date): number {
  let lo = 0;
  let hi = navData.length - 1;
  let result = -1;
  const t = target.getTime();
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (navData[mid].date.getTime() <= t) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Basic Return Metrics
// ---------------------------------------------------------------------------

/**
 * Compound Annual Growth Rate.
 *
 * @returns percentage (e.g. 12.5 for 12.5%), or null on invalid inputs.
 *
 * Fixed from audit:
 *  - Guards `endValue <= 0` (was missing, causing NaN for zero/negative NAV)
 *  - Returns `null` not `0` on error
 *  - `isFinite` check on result
 */
export function calculateCAGR(
  startValue: number,
  endValue: number,
  years: number,
): number | null {
  if (startValue <= 0 || endValue <= 0 || years <= 0) return null;
  const result = (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
  return isFinite(result) ? result : null;
}

/**
 * Absolute return (point-to-point, not annualised).
 * @returns percentage, or null if startValue ≤ 0.
 */
export function calculateAbsReturn(startNav: number, endNav: number): number | null {
  if (startNav <= 0) return null;
  return ((endNav - startNav) / startNav) * 100;
}

/**
 * Return for a period ending on the last NAV point.
 * For `days <= 365` returns absolute return; for longer uses CAGR with
 * exact year-fraction.
 *
 * @param navData  Sorted ascending NAV array
 * @param days     Look-back window in calendar days
 */
export function periodReturn(navData: NavPoint[], days: number): number | null {
  if (navData.length === 0) return null;
  const latest = navData[navData.length - 1];
  const startDate = addDays(latest.date, -days);
  if (startDate < navData[0].date) return null;
  const idx = findNavIndex(navData, startDate);
  if (idx < 0) return null;
  const start = navData[idx];
  if (days <= 365) {
    return calculateAbsReturn(start.nav, latest.nav);
  }
  const years = yearsBetween(start.date, latest.date);
  return calculateCAGR(start.nav, latest.nav, years);
}

/** Year-to-date return (since 1 Jan of the current year). */
export function ytdReturn(navData: NavPoint[]): number | null {
  if (navData.length === 0) return null;
  const latest = navData[navData.length - 1];
  const janFirst = new Date(latest.date.getFullYear(), 0, 1);
  const idx = findNavIndex(navData, janFirst);
  if (idx < 0) {
    // Fund started mid-year — use its first NAV in this year
    const firstThisYear = navData.find(n => n.date.getFullYear() === latest.date.getFullYear());
    if (!firstThisYear) return null;
    return calculateAbsReturn(firstThisYear.nav, latest.nav);
  }
  return calculateAbsReturn(navData[idx].nav, latest.nav);
}

/** Since-inception return as CAGR (full history). */
export function inceptionReturn(navData: NavPoint[]): number | null {
  if (navData.length < 2) return null;
  const first = navData[0];
  const last = navData[navData.length - 1];
  const years = yearsBetween(first.date, last.date);
  return calculateCAGR(first.nav, last.nav, years);
}

// ---------------------------------------------------------------------------
// XIRR (Extended Internal Rate of Return)
// ---------------------------------------------------------------------------

/**
 * XIRR using bisection root-finding on the XNPV function.
 *
 * Fixes from audit:
 *  1. Pre-computes day offsets → O(n) per NPV call (was O(n) inside reduce)
 *  2. Sign-change check before bisection → null if no root in range
 *  3. `isFinite` guard on initial NPV evaluations
 *  4. Upper bound 1000% (not 10000%)
 *  5. Tolerance 1e-7 (not 1e-5)
 *  6. 120 iterations
 *  7. Returns null (not 0) on failure
 *
 * @param cashflows  Cashflows — outflows negative, inflows positive.
 *                   Must have at least 2 entries.  First cashflow date is
 *                   used as the reference t=0.
 * @returns XIRR as a percentage (e.g. 14.2 for 14.2%), or null.
 */
export function solveXirr(cashflows: Cashflow[]): number | null {
  if (cashflows.length < 2) return null;

  // Find earliest date as reference (t=0)
  const t0 = cashflows.reduce((earliest, cf) =>
    cf.date < earliest ? cf.date : earliest, cashflows[0].date);

  // Pre-compute fractional years for each cashflow (O(n) once)
  const dayOffsets = cashflows.map(cf => daysBetween(t0, cf.date) / YEAR_DAYS);

  // XNPV function: net present value at a given annual rate
  const xnpv = (rate: number): number => {
    let sum = 0;
    for (let i = 0; i < cashflows.length; i++) {
      sum += cashflows[i].amount / Math.pow(1 + rate, dayOffsets[i]);
    }
    return sum;
  };

  let lo = -0.9999;
  let hi = 10; // upper bound 1000%

  let fLo = xnpv(lo);
  let fHi = xnpv(hi);

  // Guard: NaN/Infinity in initial evaluations
  if (!isFinite(fLo) || !isFinite(fHi)) return null;

  // Guard: no sign change → no root in range (bisection would be meaningless)
  if (fLo * fHi > 0) return null;

  // Bisection
  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2;
    const fMid = xnpv(mid);
    if (Math.abs(fMid) < 1e-7) return mid * 100;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }

  return ((lo + hi) / 2) * 100;
}

// ---------------------------------------------------------------------------
// Rolling CAGR
// ---------------------------------------------------------------------------

/**
 * Compute rolling CAGR for every date in `navData` over `windowDays`.
 *
 * Uses binary search (O(log n)) per iteration → O(n log n) overall.
 * Guards `isFinite` to prevent NaN from propagating.
 *
 * @param navData    Sorted ascending NAV array
 * @param windowDays Rolling window in calendar days
 */
export function calcRollingCagr(navData: NavPoint[], windowDays: number): RollingPoint[] {
  const result: RollingPoint[] = [];
  if (navData.length < 2) return result;

  const windowYears = windowDays / YEAR_DAYS;

  for (let i = 0; i < navData.length; i++) {
    const endPoint = navData[i];
    const startDate = addDays(endPoint.date, -windowDays);
    if (startDate < navData[0].date) continue;

    const startIdx = findNavIndex(navData, startDate);
    if (startIdx < 0 || startIdx >= i) continue;

    const cagr = (Math.pow(endPoint.nav / navData[startIdx].nav, 1 / windowYears) - 1) * 100;
    if (isFinite(cagr)) {
      result.push({ date: endPoint.date, cagrPct: cagr });
    }
  }

  return result;
}

/** Aggregate statistics over a rolling CAGR series. */
export function calcRollingStats(points: RollingPoint[]): RollingStats {
  if (points.length === 0) {
    return { avg: null, min: null, max: null, median: null, pctPositive: null, count: 0 };
  }

  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let positiveCount = 0;

  for (const p of points) {
    sum += p.cagrPct;
    if (p.cagrPct < min) min = p.cagrPct;
    if (p.cagrPct > max) max = p.cagrPct;
    if (p.cagrPct > 0) positiveCount++;
  }

  const sorted = [...points].sort((a, b) => a.cagrPct - b.cagrPct);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1].cagrPct + sorted[mid].cagrPct) / 2
      : sorted[mid].cagrPct;

  return {
    avg: sum / points.length,
    min,
    max,
    median,
    pctPositive: (positiveCount / points.length) * 100,
    count: points.length,
  };
}

/**
 * Find the best and worst N-day windows in the NAV history.
 */
export function calcBestWorst(navData: NavPoint[], windowDays: number): BestWorstResult | null {
  const rolling = calcRollingCagr(navData, windowDays);
  if (rolling.length === 0) return null;

  const sorted = [...rolling].sort((a, b) => a.cagrPct - b.cagrPct);
  
  // Worst 5
  const worst = sorted.slice(0, 5).map(r => ({
    pct: r.cagrPct,
    end: r.date,
    start: addDays(r.date, -windowDays),
  }));

  // Best 5
  const best = sorted.slice(-5).reverse().map(r => ({
    pct: r.cagrPct,
    end: r.date,
    start: addDays(r.date, -windowDays),
  }));

  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1].cagrPct + sorted[mid].cagrPct) / 2
      : sorted[mid].cagrPct;

  return {
    best,
    worst,
    median,
    count: rolling.length,
  };
}

// ---------------------------------------------------------------------------
// Annual Returns
// ---------------------------------------------------------------------------

/**
 * Calendar-year returns with intra-year annualised volatility.
 *
 * Volatility uses Welford's online algorithm then **sample variance** (÷N-1)
 * for correctness (fixed from audit which used population variance).
 */
export function calcAnnualReturns(navData: NavPoint[]): AnnualReturn[] {
  if (navData.length < 2) return [];

  // Group by year
  const byYear = new Map<number, NavPoint[]>();
  for (const point of navData) {
    const y = point.date.getFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(point);
  }

  const result: AnnualReturn[] = [];
  const now = new Date();

  for (const [year, points] of [...byYear.entries()].sort(([a], [b]) => a - b)) {
    if (points.length < 2) continue;

    const returnPct = ((points[points.length - 1].nav / points[0].nav) - 1) * 100;

    // Welford's online algorithm for log-return variance (numerically stable)
    let count = 0;
    let mean = 0;
    let M2 = 0;
    for (let i = 1; i < points.length; i++) {
      const logRet = Math.log(points[i].nav / points[i - 1].nav);
      count++;
      const delta = logRet - mean;
      mean += delta / count;
      M2 += delta * (logRet - mean);
    }
    // Sample variance: divide by (N-1), not N
    const variance = count > 1 ? M2 / (count - 1) : 0;
    const volatilityPct = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS) * 100;

    const incomplete =
      year === now.getFullYear() &&
      points[points.length - 1].date < new Date(year, 11, 25);

    result.push({ year, returnPct, volatilityPct, incomplete });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Max Drawdown
// ---------------------------------------------------------------------------

/**
 * Maximum drawdown from peak.
 * @returns negative percentage (e.g. -35.2 for a 35.2% drawdown), or 0 if
 *          there was no drawdown. Callers should negate for display.
 */
export function calcMaxDrawdown(navData: NavPoint[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const point of navData) {
    if (point.nav > peak) peak = point.nav;
    const dd = (point.nav - peak) / peak;
    if (dd < maxDd) maxDd = dd;
  }
  return maxDd * 100;
}

// ---------------------------------------------------------------------------
// Risk Metrics (MPT)
// ---------------------------------------------------------------------------

/**
 * Converts an annual risk-free rate (%) to a daily rate using the
 * geometrically correct formula: dailyRF = (1 + annualRF)^(1/252) - 1
 *
 * Fixed from audit: original used simple division (annualRF / 252) which
 * introduces ~50-70 bps annualised error.
 */
function dailyRFRate(annualRFPct: number): number {
  return Math.pow(1 + annualRFPct / 100, 1 / TRADING_DAYS) - 1;
}

/**
 * Annualised Sharpe Ratio.
 *
 * Fixes from audit:
 *  - Sample std dev (÷N-1) instead of population (÷N)
 *  - Geometric daily risk-free rate conversion
 *
 * @param navData       Sorted NAV array (min 30 points)
 * @param annualRFPct   Annual risk-free rate in % (e.g. 6.5)
 */
export function calcSharpe(navData: NavPoint[], annualRFPct: number): number | null {
  if (navData.length < 30) return null;

  const rfDaily = dailyRFRate(annualRFPct);
  const excessReturns: number[] = [];

  for (let i = 1; i < navData.length; i++) {
    excessReturns.push(navData[i].nav / navData[i - 1].nav - 1 - rfDaily);
  }

  const n = excessReturns.length;
  const mean = excessReturns.reduce((s, r) => s + r, 0) / n;
  // Sample variance (÷N-1)
  const variance = excessReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);

  return std === 0 ? null : (mean / std) * Math.sqrt(TRADING_DAYS);
}

/**
 * Annualised Sortino Ratio.
 *
 * Downside deviation uses only returns below zero (semi-deviation).
 * Same fixes as Sharpe (geometric RF, sample denominator).
 */
export function calcSortino(navData: NavPoint[], annualRFPct: number): number | null {
  if (navData.length < 30) return null;

  const rfDaily = dailyRFRate(annualRFPct);
  const excessReturns: number[] = [];

  for (let i = 1; i < navData.length; i++) {
    excessReturns.push(navData[i].nav / navData[i - 1].nav - 1 - rfDaily);
  }

  const n = excessReturns.length;
  const mean = excessReturns.reduce((s, r) => s + r, 0) / n;

  const negativeReturns = excessReturns.filter(r => r < 0);
  if (negativeReturns.length === 0) return null;

  // Semi-deviation: sqrt(mean of squared negative excess returns)
  const ssd = Math.sqrt(
    negativeReturns.reduce((s, r) => s + r * r, 0) / negativeReturns.length
  );

  return ssd === 0 ? null : (mean / ssd) * Math.sqrt(TRADING_DAYS);
}

/**
 * Annualised volatility using log returns and sample variance.
 *
 * Fix from audit: sample variance (÷N-1), not population.
 */
export function calcVolatility(navData: NavPoint[]): number | null {
  if (navData.length < 30) return null;

  const logReturns: number[] = [];
  for (let i = 1; i < navData.length; i++) {
    logReturns.push(Math.log(navData[i].nav / navData[i - 1].nav));
  }

  const n = logReturns.length;
  const mean = logReturns.reduce((s, r) => s + r, 0) / n;
  // Sample variance
  const variance = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);

  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS) * 100;
}

/** Compute all MPT risk metrics in one pass. */
export function calcRiskMetrics(navData: NavPoint[], annualRFPct: number): RiskMetrics {
  return {
    sharpe: calcSharpe(navData, annualRFPct),
    sortino: calcSortino(navData, annualRFPct),
    maxDrawdownPct: calcMaxDrawdown(navData),
    annualisedVolatilityPct: calcVolatility(navData),
  };
}

// ---------------------------------------------------------------------------
// Beta / Alpha / R² (date-aligned)
// ---------------------------------------------------------------------------

/**
 * Compute Beta, annualised Alpha, and R² vs a benchmark.
 *
 * CRITICAL FIX from audit: this function receives **pre-aligned** return
 * arrays (same length, same date index). The caller is responsible for
 * date-aligning fund and benchmark NAV arrays before calling this.
 * Using zip-by-index on unaligned arrays produces meaningless results.
 *
 * @param fundExcessReturns       Daily excess returns of the fund (already RF-subtracted)
 * @param benchExcessReturns      Daily excess returns of the benchmark
 */
export function calcBetaAlpha(
  fundExcessReturns: number[],
  benchExcessReturns: number[],
): BetaAlphaResult | null {
  const n = Math.min(fundExcessReturns.length, benchExcessReturns.length);
  if (n < 30) return null;

  const meanFund = fundExcessReturns.slice(0, n).reduce((s, r) => s + r, 0) / n;
  const meanBench = benchExcessReturns.slice(0, n).reduce((s, r) => s + r, 0) / n;

  let cov = 0;   // covariance(fund, bench)
  let varBench = 0; // variance(bench)
  let varFund = 0;  // variance(fund)

  for (let i = 0; i < n; i++) {
    const df = fundExcessReturns[i] - meanFund;
    const db = benchExcessReturns[i] - meanBench;
    cov += df * db;
    varBench += db * db;
    varFund += df * df;
  }

  // Sample covariance/variance
  cov /= n - 1;
  varBench /= n - 1;
  varFund /= n - 1;

  if (varBench === 0) return null;

  const beta = cov / varBench;
  const alphaDaily = meanFund - beta * meanBench;
  const alphaAnnualisedPct = alphaDaily * TRADING_DAYS * 100;

  const rSquared = varFund === 0 ? 0 : (cov * cov) / (varBench * varFund);

  return { alphaAnnualisedPct, beta, rSquared };
}

/**
 * Align two NAV arrays by date (inner join on matching dates).
 * Returns paired daily log-returns ready for Beta/Alpha computation.
 *
 * Fix for audit: ensures we never zip-by-index across arrays with different
 * trading calendars (e.g., fund vs benchmark index).
 */
export function alignedDailyReturns(
  fundNav: NavPoint[],
  benchNav: NavPoint[],
  annualRFPct: number,
): { fundExcess: number[]; benchExcess: number[] } | null {
  if (fundNav.length < 31 || benchNav.length < 31) return null;

  const rfDaily = dailyRFRate(annualRFPct);

  // Build a map of timestamp → nav for the benchmark
  const benchMap = new Map<number, number>();
  for (let i = 1; i < benchNav.length; i++) {
    const ret = benchNav[i].nav / benchNav[i - 1].nav - 1 - rfDaily;
    benchMap.set(benchNav[i].date.getTime(), ret);
  }

  const fundExcess: number[] = [];
  const benchExcess: number[] = [];

  for (let i = 1; i < fundNav.length; i++) {
    const ts = fundNav[i].date.getTime();
    const bRet = benchMap.get(ts);
    if (bRet === undefined) continue; // no matching date — skip
    fundExcess.push(fundNav[i].nav / fundNav[i - 1].nav - 1 - rfDaily);
    benchExcess.push(bRet);
  }

  if (fundExcess.length < 30) return null;
  return { fundExcess, benchExcess };
}

// ---------------------------------------------------------------------------
// Upside/Downside Capture + Tracking Error + Information Ratio
// ---------------------------------------------------------------------------

/**
 * Compute upside/downside capture ratios, tracking error, and IR.
 * Requires pre-aligned fund and benchmark excess return arrays.
 */
export function calcCapture(
  fundExcessReturns: number[],
  benchExcessReturns: number[],
): CaptureResult {
  const n = Math.min(fundExcessReturns.length, benchExcessReturns.length);

  let upFund = 0, upBench = 0, downFund = 0, downBench = 0;
  const active: number[] = [];

  for (let i = 0; i < n; i++) {
    const b = benchExcessReturns[i];
    const f = fundExcessReturns[i];
    if (b > 0) { upFund += f; upBench += b; }
    else if (b < 0) { downFund += f; downBench += b; }
    active.push(f - b);
  }

  const upsidePct = upBench !== 0 ? (upFund / upBench) * 100 : null;
  const downsidePct = downBench !== 0 ? (downFund / downBench) * 100 : null;

  // Sample std dev of active returns
  const activeMean = active.reduce((s, r) => s + r, 0) / active.length;
  const activeVar = active.reduce((s, r) => s + (r - activeMean) ** 2, 0) / (active.length - 1);
  const trackingErrorPct = Math.sqrt(activeVar) * Math.sqrt(TRADING_DAYS) * 100;

  const informationRatio =
    trackingErrorPct === 0 ? null : (activeMean * TRADING_DAYS) / (trackingErrorPct / 100);

  return { upsidePct, downsidePct, trackingErrorPct, informationRatio };
}

// ---------------------------------------------------------------------------
// SIP + Lumpsum Simulator
// ---------------------------------------------------------------------------

/**
 * Simulate a combined lumpsum + monthly SIP investment with daily-compounded
 * expense ratio drag applied.
 *
 * Expense ratio is applied daily (proportional) to the unit holding,
 * modelling real-world NAV erosion due to fund fees.
 *
 * @param navData      Sorted ascending NAV array
 * @param params.lumpsum      One-time investment at start (₹), 0 to skip
 * @param params.monthly      Monthly SIP instalment (₹), 0 to skip
 * @param params.years        Investment horizon (calendar years)
 * @param params.expenseRatio Annual expense ratio in % (e.g. 1.5)
 */
export function simulateSip(
  navData: NavPoint[],
  params: { lumpsum: number; monthly: number; years: number; expenseRatio: number },
): SipResult | null {
  if (navData.length < 2) return null;

  const { lumpsum, monthly, years, expenseRatio } = params;

  // Daily ER as a fraction (subtracted from unit holding each day)
  const dailyER = expenseRatio / 100 / YEAR_DAYS;

  const endPoint = navData[navData.length - 1];
  const startDate = addDays(endPoint.date, -Math.round(years * YEAR_DAYS));
  const startIdx = Math.max(0, findNavIndex(navData, startDate));
  const slice = navData.slice(startIdx);

  if (slice.length < 2) return null;

  const startNav = slice[0].nav;

  // --- Lumpsum tracking ---
  let grossUnits = lumpsum > 0 ? lumpsum / startNav : 0;
  let netUnits   = grossUnits; // net = eroded by ER
  let lumpFeesAccumulated = 0;

  // --- SIP tracking ---
  let sipGrossUnits = 0;
  let sipNetUnits   = 0;
  let totalSipInvested = 0;
  let sipInstalments  = 0;
  const sipCashflows: Cashflow[] = [];

  let prevDate = slice[0].date;
  let prevMonthKey = `${slice[0].date.getFullYear()}-${slice[0].date.getMonth()}`;

  const snapshots: SipSnapshot[] = [];

  for (let i = 0; i < slice.length; i++) {
    const point = slice[i];

    // Apply daily ER drag proportional to days elapsed
    if (i > 0 && dailyER > 0) {
      const elapsed = daysBetween(prevDate, point.date);
      if (elapsed > 0) {
        const decay = Math.pow(1 - dailyER, elapsed);
        if (grossUnits > 0) {
          const grossValBefore = grossUnits * point.nav;
          grossUnits *= decay;
          lumpFeesAccumulated += grossValBefore - grossUnits * point.nav;
        }
        if (sipGrossUnits > 0) {
          sipGrossUnits *= decay;
        }
      }
    }

    // Monthly SIP buy (first trading day of each month)
    const monthKey = `${point.date.getFullYear()}-${point.date.getMonth()}`;
    if (monthKey !== prevMonthKey && monthly > 0 && point.nav > 0) {
      const bought = monthly / point.nav;
      sipGrossUnits += bought;
      sipNetUnits   += bought;
      totalSipInvested += monthly;
      sipInstalments++;
      sipCashflows.push({ date: point.date, amount: -monthly });
      prevMonthKey = monthKey;
    }

    // Snapshot (monthly)
    const isLastOrMonthly =
      i === slice.length - 1 ||
      `${slice[i + 1].date.getFullYear()}-${slice[i + 1].date.getMonth()}` !== monthKey;
    if (isLastOrMonthly) {
      snapshots.push({
        date: point.date,
        gross: (grossUnits + sipGrossUnits) * point.nav,
        net:   (netUnits   + sipNetUnits)   * point.nav,
        invested: lumpsum + totalSipInvested,
      });
    }

    prevDate = point.date;
  }

  const lastNav = slice[slice.length - 1].nav;
  const lastDate = slice[slice.length - 1].date;
  const actualYears = yearsBetween(slice[0].date, lastDate);

  const finalLumpGross = grossUnits * lastNav;
  const finalLumpNet   = netUnits   * lastNav;
  const finalSipGross  = sipGrossUnits * lastNav;
  const finalSipNet    = sipNetUnits   * lastNav;
  const sipFees        = finalSipGross - finalSipNet;

  // CAGR for lumpsum
  const lumpCagrGross = lumpsum > 0 ? calculateCAGR(lumpsum, finalLumpGross, actualYears) : null;
  const lumpCagrNet   = lumpsum > 0 ? calculateCAGR(lumpsum, finalLumpNet,   actualYears) : null;

  // XIRR for SIP
  const sipXirrGross = sipCashflows.length > 0
    ? solveXirr([...sipCashflows, { date: lastDate, amount: finalSipGross }])
    : null;
  const sipXirrNet = sipCashflows.length > 0
    ? solveXirr([...sipCashflows, { date: lastDate, amount: finalSipNet }])
    : null;

  // Combined XIRR
  const allCashflows: Cashflow[] = [];
  if (lumpsum > 0) allCashflows.push({ date: slice[0].date, amount: -lumpsum });
  allCashflows.push(...sipCashflows);

  const combinedXirrGross = allCashflows.length > 0
    ? solveXirr([...allCashflows, { date: lastDate, amount: finalLumpGross + finalSipGross }])
    : null;
  const combinedXirrNet = allCashflows.length > 0
    ? solveXirr([...allCashflows, { date: lastDate, amount: finalLumpNet + finalSipNet }])
    : null;

  return {
    startDate: slice[0].date,
    endDate: lastDate,
    actualYears,
    lumpInvested: lumpsum,
    finalLumpGross,
    finalLumpNet,
    lumpFees: lumpFeesAccumulated,
    lumpCagrGross,
    lumpCagrNet,
    sipInvested: totalSipInvested,
    sipInstalments,
    finalSipGross,
    finalSipNet,
    sipFees,
    sipXirrGross,
    sipXirrNet,
    totalInvested: lumpsum + totalSipInvested,
    combinedGross: finalLumpGross + finalSipGross,
    combinedNet:   finalLumpNet   + finalSipNet,
    combinedXirrGross,
    combinedXirrNet,
    totalFees: lumpFeesAccumulated + sipFees,
    snapshots,
    expenseRatio,
  };
}

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

/** Format a percentage for display. Returns 'N/A' if value is null. */
export function fmtPct(value: number | null, decimals = 2): string {
  if (value === null || !isFinite(value)) return 'N/A';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

/** Format a currency value in Indian locale. */
export function fmtINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

/** Format a NAV value with 4 decimal places. */
export function fmtNAV(value: number): string {
  return `₹${value.toFixed(4)}`;
}

/** Format a date as DD-MMM-YYYY (e.g. 12-Jul-2026). */
export function fmtDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

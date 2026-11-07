import { DAYS_PER_YEAR, P } from "./config";
import type { Rng } from "./rng";
import type { Economy } from "./types";

export const DT = 1 / DAYS_PER_YEAR;
const SQ = Math.sqrt(DT);

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Monthly payment per $1 borrowed on a 30-year fixed mortgage. */
function mortgagePaymentFactor(ratePct: number): number {
  const r = Math.max(ratePct, 0.1) / 100 / 12;
  return r / (1 - Math.pow(1 + r, -360));
}

/** Price/earnings a rational market would pay given yields and risk. */
function fairPE(e: Economy): number {
  const recessionRisk = Math.max(0, -e.outputGap) * 0.3;
  const premium = P.equityRiskPremium + recessionRisk + P.stressEquityPremium * e.financialStress;
  return 100 / Math.max(e.yield10y + premium, 2);
}

/** House price consistent with incomes and mortgage affordability. */
function fairHomePrice(e: Economy, k: number): number {
  return (k * e.nominalIncome) / mortgagePaymentFactor(e.mortgageRate);
}

/** Calibrated so the initial housing market is at fair value. */
export function housingConstant(e: Economy): number {
  return (e.homePrice * mortgagePaymentFactor(e.mortgageRate)) / e.nominalIncome;
}

/** Trading hours per day: ticks at 10:00, 11:00 … 16:00 (close). */
export const HOURS_PER_DAY = 7;

/**
 * Advance the economy by one full trading day (macro step + a day of markets).
 * Used by tests and anywhere hourly detail isn't needed. Mutates `e`.
 */
export function stepDay(e: Economy, rng: Rng, housingK: number, expectedPath: number): void {
  stepMacro(e, rng, housingK);
  for (let h = 0; h < HOURS_PER_DAY; h++) stepMarkets(e, rng, expectedPath, 1 / HOURS_PER_DAY);
}

/**
 * The slow-moving real economy: one step per trading day, at the open.
 * Increments `e.day`. Mutates `e`.
 */
export function stepMacro(e: Economy, rng: Rng, housingK: number): void {
  const target = P.inflationTarget;

  // --- Shocks (mean-reverting random processes) ---
  e.demandShock +=
    (-e.demandShock / P.demandShockPersistence) * DT + P.demandShockVol * SQ * rng.normal();
  e.supplyShock +=
    (-e.supplyShock / P.supplyShockPersistence) * DT + P.supplyShockVol * SQ * rng.normal();
  e.rStar = clamp(e.rStar + P.rStarVol * SQ * rng.normal(), -1, 2.5);
  e.financialStress = Math.max(0, e.financialStress * (1 - DT / P.stressPersistence));
  e.guidance *= Math.exp(-DT / P.guidanceDecay);
  e.balanceSheet = clamp(e.balanceSheet + e.qePace * P.qeSpeed * DT, 3, 14);

  // --- Monetary transmission: effective real rate vs neutral, felt with a lag ---
  const effectiveRate =
    (1 - P.longRateWeight) * e.policyRate +
    P.longRateWeight * (e.yield10y - P.normalTermSpread) +
    P.stressSpread * e.financialStress;
  const rateGap = effectiveRate - e.inflationExp - e.rStar;
  e.stance += ((rateGap - e.stance) * DT) / P.transmissionLag;

  // --- Output gap (IS curve) ---
  const wealth = P.wealthEffect * e.stockMomentum;
  const dGap =
    (-P.gapReversion * e.outputGap -
      P.rateSensitivity * e.stance +
      e.demandShock +
      wealth -
      P.stressDrag * e.financialStress) *
      DT +
    P.gapNoise * SQ * rng.normal();
  e.outputGap = clamp(e.outputGap + dGap, -12, 8);

  // Real GDP growth = potential + change in gap, smoothed over ~a quarter
  e.gdpGrowth += (e.potentialGrowth + dGap / DT - e.gdpGrowth) / 65;

  // --- Labor market (Okun's law) ---
  const uTarget = e.naturalUnemployment - P.okun * e.outputGap;
  e.unemployment = clamp(
    e.unemployment + ((uTarget - e.unemployment) * DT) / P.unemploymentAdjust,
    2,
    25,
  );

  // --- Inflation (expectations-augmented Phillips curve) ---
  const piPressure = e.inflationExp + P.phillipsSlope * e.outputGap + e.supplyShock;
  e.inflation +=
    ((piPressure - e.inflation) * DT) / P.inflationAdjust + P.inflationNoise * SQ * rng.normal();

  // --- Inflation expectations: anchored by credibility, otherwise adaptive ---
  e.inflationExp +=
    ((0.3 + 0.7 * e.credibility) * P.anchorSpeed * (target - e.inflationExp) +
      (1 - e.credibility * 0.7) * P.adaptSpeed * (e.inflation - e.inflationExp)) *
    DT;

  // --- Credibility: erodes while trend inflation/expectations stray, rebuilds slowly ---
  e.inflationTrend += (e.inflation - e.inflationTrend) / 130;
  const miss = Math.abs(e.inflationTrend - target);
  const over =
    Math.max(0, miss - P.credibilityInflationBand) +
    Math.max(0, Math.abs(e.inflationExp - target) - P.credibilityExpBand);
  const fightingInflation = e.inflationTrend > target + 0.5 && e.policyRate - e.inflationTrend > 0.5;
  const dCred =
    (over > 0 ? -P.credibilityLossRate * over : P.credibilityGainRate) +
    (fightingInflation ? P.credibilityResolveBonus : 0);
  e.credibility = clamp(e.credibility + dCred * DT, 0, 1);

  // --- Nominal income & earnings ---
  const nominalGrowth = (e.potentialGrowth + e.inflation) / 100;
  e.nominalIncome *= Math.exp(nominalGrowth * DT + dGap / 100);
  e.earnings *= Math.exp(nominalGrowth * DT + (P.earningsLeverage * dGap) / 100);

  // --- Term premium: credibility, inflation risk, QE/QT, stress ---
  const tpTarget =
    0.3 +
    1.5 * (1 - e.credibility) +
    0.1 * miss -
    P.qeTermPremium * (e.balanceSheet - P.neutralBalanceSheet) +
    0.4 * e.financialStress;
  e.termPremium += (tpTarget - e.termPremium) * DT * 2;

  // --- Housing: slow drift toward affordability-based fair value ---
  const homeRet =
    P.housingMeanReversion * Math.log(fairHomePrice(e, housingK) / e.homePrice) * DT +
    P.housingVol * SQ * rng.normal();
  e.homePrice *= Math.exp(homeRet);

  e.day += 1;
}

/**
 * Fast-moving markets (bonds, mortgages, stocks) for a fraction of a trading day.
 * Variance scales with `frac`, so 7 hourly steps ≈ one daily step.
 * `expectedPath` is the market-implied policy rate (committee median + guidance).
 */
export function stepMarkets(e: Economy, rng: Rng, expectedPath: number, frac: number): void {
  const dt = DT * frac;
  const sq = Math.sqrt(dt);

  // --- Bonds: expected short-rate path + long-run neutral + term premium ---
  const shortPath = 0.5 * e.policyRate + 0.5 * expectedPath;
  const longRun = e.rStar + e.inflationExp;
  const y10Target =
    P.yieldShortWeight * shortPath + (1 - P.yieldShortWeight) * longRun + e.termPremium;
  e.yield10y += (y10Target - e.yield10y) * dt * 8 + P.yieldVol * sq * rng.normal();
  e.mortgageRate = e.yield10y + P.mortgageSpread + P.stressSpread * e.financialStress;

  // --- Stocks: drift toward fair value with noise (more volatile under stress) ---
  const fair = e.earnings * fairPE(e);
  const vol = P.stockVol * (1 + e.financialStress);
  const logRet = P.stockMeanReversion * Math.log(fair / e.stockIndex) * dt + vol * sq * rng.normal();
  e.stockIndex *= Math.exp(logRet);
  // Smoothed annualized return (~6-month window), feeds the wealth effect
  e.stockMomentum += ((logRet * 100) / dt - e.stockMomentum) * (dt / 0.5);
  e.stockHigh = Math.max(e.stockHigh, e.stockIndex);
}

/** Instant market move (data surprise, speech, announcement). */
export function applyMarketJump(e: Economy, stockPct: number, yieldChg: number): void {
  e.stockIndex *= Math.exp(stockPct / 100);
  e.stockHigh = Math.max(e.stockHigh, e.stockIndex);
  e.yield10y += yieldChg;
  e.mortgageRate = e.yield10y + P.mortgageSpread + P.stressSpread * e.financialStress;
}

/** Market reaction to a policy surprise at an FOMC announcement. */
export function applyPolicySurprise(e: Economy, surprise: number): void {
  applyMarketJump(e, P.surpriseStockImpact * surprise, P.surpriseYieldImpact * surprise);
}

export const drawdown = (e: Economy) => 1 - e.stockIndex / e.stockHigh;

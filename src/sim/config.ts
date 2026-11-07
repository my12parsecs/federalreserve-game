import type { Economy } from "./types";

/**
 * Model parameters. This is the main balancing surface.
 * Time units are years unless noted; the engine steps daily (dt = 1/260).
 */
export const P = {
  inflationTarget: 2,

  // --- Demand side (IS curve) ---
  /** How fast the output gap closes on its own (1/yr) */
  gapReversion: 0.5,
  /** Output-gap pressure per 1pp of restrictive stance (pp/yr) */
  rateSensitivity: 0.4,
  /** Years for a rate change to be fully "felt" (monetary policy lags) */
  transmissionLag: 0.75,
  /** Share of the effective policy rate that comes from long rates (QE/guidance channel) */
  longRateWeight: 0.3,
  /** Normal 10y-minus-short spread, removed so long rates are comparable to the policy rate */
  normalTermSpread: 0.5,
  /** pp/yr of demand push per 1pp of annualized stock momentum */
  wealthEffect: 0.03,
  gapNoise: 0.5,

  // --- Supply side (Phillips curve) ---
  phillipsSlope: 0.3,
  inflationAdjust: 0.5,
  inflationNoise: 0.4,

  // --- Expectations ---
  anchorSpeed: 0.4,
  adaptSpeed: 0.9,

  // --- Labor (Okun's law) ---
  okun: 0.5,
  unemploymentAdjust: 0.25,
  /** Monthly job gains needed to hold unemployment steady (thousands) */
  trendPayrolls: 100,
  /** Jobs (thousands) per 1pp of unemployment */
  jobsPerPoint: 1650,

  // --- Shocks (Ornstein–Uhlenbeck) + random events ---
  demandShockPersistence: 1.0,
  demandShockVol: 1.1,
  supplyShockPersistence: 0.7,
  supplyShockVol: 0.9,
  rStarVol: 0.15,
  shockChancePerDay: 0.03,

  // --- Financial stress ---
  stressPersistence: 0.25,
  stressDrag: 0.8, // pp/yr demand drag per unit of stress
  stressSpread: 0.5, // credit spread (pp) per unit of stress
  stressEquityPremium: 2,

  // --- Bonds & balance sheet ---
  yieldShortWeight: 0.35,
  yieldVol: 0.6,
  mortgageSpread: 1.8,
  neutralBalanceSheet: 7,
  qeSpeed: 1.0, // $T per year at full QE/QT pace
  qeTermPremium: 0.3, // term-premium pp per $1T of bonds held above neutral

  // --- Stocks ---
  equityRiskPremium: 1.5,
  earningsLeverage: 3,
  stockMeanReversion: 1.5,
  stockVol: 0.15,
  surpriseStockImpact: -4, // % per 1pp policy surprise
  surpriseYieldImpact: 0.3, // pp per 1pp policy surprise

  // --- Housing ---
  housingMeanReversion: 0.5,
  housingVol: 0.03,

  // --- Credibility ---
  credibilityInflationBand: 0.95,
  credibilityExpBand: 0.5,
  credibilityLossRate: 0.075,
  credibilityGainRate: 0.06,
  /** Bonus recovery (1/yr) for visibly fighting inflation with a positive real rate */
  credibilityResolveBonus: 0.05,
  failedVoteCredibilityHit: 0.03,
  reversalCredibilityHit: 0.04,

  // --- Actions ---
  speechGuidance: 0.25,
  maxGuidance: 0.75,
  guidanceDecay: 0.12, // years
  speechCooldown: 8, // days
  needlessEmergencyCredibilityHit: 0.06,
  lendingCredibilityHit: 0.02,
  lendingCooldown: 40,

  // --- Game over thresholds ---
  maxInflation: 10,
  minInflation: -2,
  maxUnemployment: 11,
  minCredibility: 0.08,
} as const;

export const DAYS_PER_YEAR = 260;

/** The Chair's personal finances (Executive Schedule Level I pay). */
export const CHAIR = {
  salary: 246_400, // per year
  taxRate: 0.33,
  livingCosts: 7_200, // per month at today's prices
  mortgageRate: 3.1, // locked in years ago
  mortgagePayment: 4_300, // per month
  dividendYield: 1.5, // % per year, reinvested
  bondDuration: 6.5, // years: −6.5% value per +1pt in yields
  start: { cash: 160_000, stocks: 1_350_000, bonds: 620_000, home: 1_150_000, mortgage: 430_000 },
};
/** Trading days between FOMC meetings: 8 meetings a year. */
export const CYCLE_DAYS = [32, 33, 32, 33, 32, 33, 32, 33];

export const START_DATE = new Date(Date.UTC(2027, 0, 4)); // a Monday

/** Opening scenario: a mildly overheated economy, inflation above target. */
export function initialEconomy(): Economy {
  return {
    day: 0,
    policyRate: 3.5,
    balanceSheet: 7,
    qePace: 0,
    guidance: 0,
    inflation: 3.4,
    inflationTrend: 3.4,
    inflationExp: 2.6,
    outputGap: 0.8,
    unemployment: 3.8,
    naturalUnemployment: 4.2,
    gdpGrowth: 2.2,
    potentialGrowth: 1.8,
    rStar: 0.75,
    stance: 0.1,
    lastJobsU: 3.8,
    yield10y: 4.1,
    termPremium: 0.5,
    mortgageRate: 5.9,
    earnings: 280,
    stockIndex: 5000,
    stockHigh: 5000,
    stockMomentum: 8,
    homePrice: 100,
    nominalIncome: 100,
    financialStress: 0,
    credibility: 0.8,
    demandShock: 0.2,
    supplyShock: 0.5,
  };
}

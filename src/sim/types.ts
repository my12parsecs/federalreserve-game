/**
 * All rates/percentages are in percentage points (4.5 = 4.5%).
 * Indexes (stocks, housing, earnings, income) are levels.
 * Time unit: one trading day (260 per year).
 */
export interface Economy {
  day: number;

  // Policy
  policyRate: number; // fed funds target
  balanceSheet: number; // $ trillions of bonds held by the Fed
  qePace: QePace; // −1 = QT (shrinking), 0 = hold, 1 = QE (buying)
  guidance: number; // pp the market adds to the expected path because of Fed-speak

  // Macro (true values — the player only sees them through data releases)
  inflation: number; // core inflation, annualized
  inflationTrend: number; // ~6-month smoothed inflation: what credibility is judged on
  inflationExp: number; // public's expected inflation
  outputGap: number; // % above (+) / below (−) potential output
  unemployment: number;
  naturalUnemployment: number; // u*: unemployment consistent with zero gap
  gdpGrowth: number; // real GDP growth, annualized, smoothed ~1 quarter
  potentialGrowth: number;
  rStar: number; // neutral real interest rate
  stance: number; // lagged (effective real rate − r*): how tight policy feels
  lastJobsU: number; // true unemployment at the previous jobs report (for payrolls)

  // Markets
  yield10y: number;
  termPremium: number;
  mortgageRate: number;
  earnings: number;
  stockIndex: number;
  stockHigh: number; // all-time high, for drawdown/bear-market detection
  stockMomentum: number; // smoothed annualized stock return, feeds wealth effect
  homePrice: number;
  nominalIncome: number;
  financialStress: number; // 0 = calm, 1+ = banking panic

  // Institution
  credibility: number; // 0..1, how anchored expectations are to the 2% target

  // Latent shocks (hidden from the player)
  demandShock: number; // pp/yr push on the output gap
  supplyShock: number; // pp push on inflation
}

export type QePace = -1 | 0 | 1;

export type ReleaseKey = "cpi" | "unemployment" | "payrolls" | "gdp" | "homePrice" | "claims";

export interface Release {
  value: number;
  prev: number;
  consensus: number;
  day: number;
}

export type Reported = Record<ReleaseKey, Release>;

/**
 * One data point, for charts. Macro series are the latest *reported* values.
 * `day` is fractional for intraday points: day d's hourly ticks run d−1+1/7 … d (close).
 */
export interface Snapshot {
  day: number;
  policyRate: number;
  cpi: number;
  inflationExp: number;
  unemployment: number;
  claims: number;
  gdp: number;
  yield10y: number;
  mortgageRate: number;
  stockIndex: number;
  homePrice: number;
  netWorth: number;
}

/**
 * The Chair's personal finances. Ethics rules mean no active trading: savings
 * sit in a broad stock index fund, Treasuries and cash — so your own policy
 * decisions move your own net worth.
 */
export interface Wallet {
  cash: number; // money-market account, earns the policy rate
  stockUnits: number; // index-fund shares tracking the STX 500
  bonds: number; // Treasury fund value; loses value when yields rise
  homeUnits: number; // the house, valued off the home price index
  mortgage: number; // remaining balance (fixed rate)
  priceLevel: number; // cumulative inflation since day 0 (scales living costs)
  month: number; // calendar month of the last payday
  lastY10: number; // 10y yield at the last bond revaluation
  lastPay: number; // last take-home paycheck
  lastBills: number; // last month's living costs + mortgage payment
  lastPayDay: number; // trading day of the last payday
}

export type Topic =
  | "inflation"
  | "labor"
  | "growth"
  | "markets"
  | "housing"
  | "expectations"
  | "financial";

export interface Member {
  id: string;
  name: string;
  role: "Chair" | "Governor" | "President";
  district?: string;
  /** −1 = dove (cares about jobs), +1 = hawk (cares about inflation) */
  hawkishness: number;
  /** Their personal estimate of the neutral real rate */
  rStarView: number;
  /** Largest move per meeting they're comfortable with */
  maxMove: number;
  /** How far from their preference they'll still vote yes */
  tolerance: number;
  /** How receptive they are to arguments on each topic (default 0.5) */
  focus: Partial<Record<Topic, number>>;
}

export interface Vote {
  memberId: string;
  preferred: number; // their own view before arguments
  persuaded: number; // after the Chair's arguments
  yes: boolean;
}

export interface UsedArgument {
  id: string;
  evidence: number; // −1 (data contradicts) .. 1 (data strongly supports)
}

export interface MeetingResult {
  meeting: number;
  day: number;
  emergency: boolean;
  proposal: number;
  previousRate: number;
  marketExpected: number;
  passed: boolean;
  votes: Vote[];
  arguments: UsedArgument[];
}

export type ActionId = "hawkishSpeech" | "dovishSpeech" | "emergencyMeeting" | "lendingFacility";

/** Structured things that happened — the news & social feeds turn these into text. */
export type SimEvent =
  | { kind: "release"; key: ReleaseKey; release: Release; surprise: number }
  | { kind: "close"; stockPct: number; yieldChg: number }
  | { kind: "shock"; id: string; params: Record<string, number> }
  | { kind: "milestone"; id: string }
  | { kind: "meetingStart"; emergency: boolean }
  | { kind: "decision"; result: MeetingResult; reversal: boolean; stockPct: number; yieldChg: number }
  | { kind: "action"; id: ActionId }
  | { kind: "qe"; pace: QePace };

export interface NewsItem {
  id: number;
  day: number;
  headline: string;
  tone: "good" | "bad" | "neutral";
}

export interface Post {
  id: number;
  day: number;
  name: string;
  handle: string;
  persona: string;
  text: string;
  likes: number;
  reposts: number;
}

/** A big moment worth a "breaking news" popup. */
export interface Alert {
  id: number;
  day: number;
  kind: "intro" | "shock" | "data" | "market" | "fomc" | "milestone";
  priority: number;
  kicker: string;
  headline: string;
  body: string;
  /** Key into the illustration set (see EventArt). */
  art: string;
  /** Series to draw as a mini chart on the illustration. */
  metric?: keyof Snapshot;
  impacts: { label: string; value: string; tone: "good" | "bad" | "neutral" }[];
  voices: { name: string; role: string; text: string }[];
  /** FOMC decisions only: the roll call, revealed after the vote */
  rollCall?: { name: string; lean: "hawk" | "dove" | "center"; yes: boolean }[];
}

export type Phase = "cycle" | "meeting";
export type GameStatus = "playing" | "over";

export interface GameState {
  seed: number;
  rngState: number;
  flavorRngState: number;
  econ: Economy;
  reported: Reported;
  history: Snapshot[];
  members: Member[];
  /** Market-implied rate for the next meeting (committee median + guidance) */
  marketExpected: number;

  phase: Phase;
  /** Trading hours elapsed today (0 = before the open / after the close, 7 = close). */
  hour: number;
  /** Hourly snapshots for the last few weeks (fractional `day`). */
  intraday: Snapshot[];
  wallet: Wallet;
  /** Previous close, for daily change and milestone detection. */
  prevClose: { stock: number; y10: number; mortgage: number; drawdown: number };
  emergency: boolean; // current meeting is an emergency meeting
  emergencyUsed: boolean; // already held one this cycle
  cycleDay: number;
  cycleLength: number;
  cooldowns: Partial<Record<ActionId, number>>; // day when available again

  meeting: number; // regular meetings held so far
  meetings: MeetingResult[];
  news: NewsItem[];
  posts: Post[];
  /** Pending breaking-news popups, oldest first. */
  alerts: Alert[];
  /** Last day each milestone / popup type fired, to avoid repeats. */
  lastFired: Record<string, number>;
  nextId: number;
  status: GameStatus;
  gameOverReason?: string;
  score: number;
}

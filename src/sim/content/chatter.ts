import type { Persona } from "./accounts";

/**
 * Background social chatter. Each template can be gated on conditions and can
 * pull random fill-ins (items, prices, places) via `r`, so repeats are rare.
 */
export interface ChatCtx {
  cpi: number;
  u: number;
  rate: number;
  y10: number;
  mortgage: number;
  stock: number;
  dayPct: number;
  dd: number;
  cred: number;
  stress: number;
  gdp: number;
  qe: number;
  priced: number; // market-implied next rate
  homeYoY: number;
  payrolls: number;
}

export interface Fill {
  pick: <T>(xs: T[]) => T;
  int: (lo: number, hi: number) => number;
  num: (lo: number, hi: number) => number;
}

export interface Tpl {
  p: Persona;
  when?: (c: ChatCtx) => boolean;
  text: (c: ChatCtx, r: Fill) => string;
}

const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);

const PLACES = ["Phoenix", "Ohio", "Tampa", "Denver", "Boise", "Austin", "Atlanta", "Sacramento", "Pittsburgh", "Nashville", "Spokane", "Raleigh"];
/** [item, typical price low, high] — scaled up when inflation runs hot */
const ITEMS: [string, number, number][] = [
  ["a dozen eggs", 4.5, 7], ["a box of cereal", 5.5, 7.5], ["a gallon of milk", 4.2, 5.8], ["a burrito", 11, 15],
  ["a latte", 5.5, 7.5], ["a movie ticket", 15, 21], ["avocado toast", 15, 21], ["chicken thighs", 8, 13],
  ["a bag of coffee", 13, 19], ["a slice of pizza", 4.5, 6.5], ["a car wash", 18, 28], ["a haircut", 35, 60],
];
const price = (c: ChatCtx, r: Fill) => {
  const [item, lo, hi] = r.pick(ITEMS);
  const p = r.num(lo, hi) * (1 + Math.max(0, c.cpi - 2) * 0.06);
  return { item, p: p.toFixed(2) };
};

export const AMBIENT: Tpl[] = [
  // ---------------------------------------------------------------- prices
  { p: "regular", when: (c) => c.cpi >= 2.8, text: (c, r) => { const x = price(c, r); return `$${x.p} for ${x.item}. what are we doing`; } },
  { p: "regular", when: (c) => c.cpi >= 2.8, text: (c, r) => { const x = price(c, r); return `paid $${x.p} for ${x.item} today and the cashier said "sorry" before i even said anything`; } },
  { p: "genz", when: (c) => c.cpi >= 2.8, text: (c, r) => { const x = price(c, r); return `${x.item} is $${x.p} now. i'm going to start a sourdough starter and a revolution`; } },
  { p: "regular", when: (c) => c.cpi >= 3, text: (_c, r) => `my landlord raised rent ${r.int(6, 15)}% again. 'market rate' he says. sir the market is you` },
  { p: "regular", when: (c) => c.cpi >= 3, text: (_c, r) => `grocery run for 2 people: $${r.int(160, 260)}. we bought vegetables and sadness` },
  { p: "business", when: (c) => c.cpi >= 3, text: () => "flour up again. butter up again. I either raise prices or close. sorry everyone 😞" },
  { p: "business", when: (c) => c.cpi >= 3, text: (_c, r) => `Had to raise our prices ${r.int(5, 12)}% this month. Our suppliers raised theirs ${r.int(12, 25)}%. We're eating the rest.` },
  { p: "doomer", when: (c) => c.cpi >= 4, text: (c) => `inflation at ${f1(c.cpi)}% and they call it 'transitory'. buy gold. buy canned beans.` },
  { p: "politician", when: (c) => c.cpi >= 4, text: () => "Families are paying more for everything. The Fed must act NOW. Enough is enough." },
  { p: "economist", when: (c) => c.cpi >= 3.5, text: (c) => `Core inflation at ${f1(c.cpi)}%. Real policy rate is ${f1(c.rate - c.cpi)}%. You do the math. 🧵` },
  { p: "economist", when: (c) => c.cpi >= 3, text: () => "Services inflation is the sticky part. Wages → prices → wages. That's the loop the Fed needs to break." },
  { p: "economist", when: (c) => c.cpi < 2.4 && c.cpi > 1.5, text: () => "Inflation basically back to target. Nobody is going to throw a parade for this but they should." },
  { p: "retiree", when: (c) => c.cpi >= 3.5, text: () => "Fixed income + rising prices = cat food casserole. Kidding. Mostly." },
  { p: "doomer", when: (c) => c.cpi < 1, text: () => "prices FALLING? that's not good news. that's deflation. that's the 1930s. look it up." },
  { p: "meme", when: (c) => c.cpi >= 3, text: () => "me in 2019: $5 coffee is crazy\nme now: $5 coffee is a bargain" },
  { p: "farmer", when: (c) => c.cpi >= 3, text: (_c, r) => `diesel up, fertilizer up ${r.int(15, 40)}%, corn price flat. farming is just gambling with extra steps` },

  // ---------------------------------------------------------------- housing & rates
  { p: "homebuyer", when: (c) => c.mortgage >= 7, text: (c) => `${f2(c.mortgage)}% mortgage rate. guess we're renting until 2040` },
  { p: "homebuyer", when: (c) => c.mortgage >= 6.5, text: (_c, r) => `toured a house in ${r.pick(PLACES)} today. ${r.int(8, 22)} other couples there. it had no kitchen.` },
  { p: "homebuyer", when: (c) => c.mortgage >= 6.5, text: (c, r) => { const loan = r.int(300, 450) * 1000; const m = c.mortgage / 1200; const pay = (loan * m) / (1 - Math.pow(1 + m, -360)); return `ran the numbers on a $${loan / 1000}K loan at ${f2(c.mortgage)}%: $${Math.round(pay).toLocaleString()}/month. closing the spreadsheet now`; } },
  { p: "homebuyer", when: (c) => c.mortgage < 6, text: () => "rates finally coming down. preapproval letter in hand. LET'S GO 🏡" },
  { p: "regular", when: (c) => c.mortgage < 5.5, text: () => "refi szn. my mortgage broker is my new best friend" },
  { p: "landlord", when: (c) => c.mortgage >= 6.5, text: () => "nobody can afford to buy = everybody has to rent = 📈 for me. sorry not sorry" },
  { p: "landlord", when: (c) => c.homeYoY < -2, text: () => "property values down again. thinking about selling. thinking about crying. doing both" },
  { p: "genz", when: (c) => c.mortgage >= 6.5, text: () => "owning a home is a myth like dragons or a 4-day work week" },
  { p: "retiree", when: (c) => c.rate >= 4, text: (c) => `CD paying ${f1(c.rate)}%! Finally the savers get a little something. Thank you Fed!` },
  { p: "retiree", when: (c) => c.rate <= 1.5, text: () => "My savings account pays 0.4%. Back in my day you got a toaster for opening an account." },
  { p: "business", when: (c) => c.rate >= 5, text: (c) => `Our line of credit is now ${f1(c.rate + 3.5)}%. Not expanding this year. Maybe not next year either.` },
  { p: "student", when: (c) => c.rate >= 4.5, text: (c) => `my new student loan rate is ${f1(c.rate + 2.5)}%. i'm paying interest on my interest on my education about interest` },
  { p: "politician", when: (c) => c.rate >= 5, text: () => "The Fed's reckless rate hikes are crushing Main Street. Cut rates now!" },
  { p: "bro", when: (c) => c.rate <= 1, text: () => "FREE MONEY ERA IS BACK BABY 🥳🥳🥳" },
  { p: "economist", when: (c) => c.y10 >= 5, text: (c) => `10y at ${f2(c.y10)}%. Bonds are actually an asset class again. TINA is dead.` },
  { p: "economist", when: (c) => c.priced - c.rate >= 0.2, text: (c) => `Futures now price a ${Math.round((c.priced - c.rate) * 100)}bp hike at the next FOMC. The Chair has been put on notice.` },
  { p: "economist", when: (c) => c.rate - c.priced >= 0.2, text: (c) => `Markets pricing a ${Math.round((c.rate - c.priced) * 100)}bp cut. If the Fed doesn't deliver, expect fireworks.` },

  // ---------------------------------------------------------------- stocks
  { p: "bro", when: (c) => c.dayPct >= 1, text: () => "told y'all to buy the dip. 🚀🚀🚀" },
  { p: "bro", when: (c) => c.dayPct >= 0.5, text: (_c, r) => `portfolio up ${r.int(3, 18)}% this week. ego up 400%. lambo soon` },
  { p: "bro", when: (c) => c.dayPct >= 0.8, text: (_c, r) => `just closed my ${r.pick(["NVDA", "ZNTX", "MEGA", "CLDN", "BOLT"])} calls for a ${r.int(2, 9)}x. dinner's on me (it's chipotle)` },
  { p: "bro", when: (c) => c.dayPct <= -1.5, text: () => "this is just a healthy pullback (i am crying in my car)" },
  { p: "bro", when: (c) => c.dayPct <= -1, text: (_c, r) => `down ${r.int(20, 60)}% on my puts... wait no my calls. i had calls. why did i have calls` },
  { p: "doomer", when: (c) => c.dayPct <= -1.5, text: () => "this is it. this is the big one. i've been saying it since 2011" },
  { p: "news", when: (c) => Math.abs(c.dayPct) >= 1, text: (c) => `STX 500 ${c.dayPct > 0 ? "▲" : "▼"} ${f1(Math.abs(c.dayPct))}% today. Volatility index elevated.` },
  { p: "bro", when: (c) => c.dd > 0.15, text: () => "down 40% on my calls but i'm not selling. diamond hands 💎🙌" },
  { p: "regular", when: (c) => c.dd > 0.15, text: () => "don't look at your 401k. i repeat. do NOT look at your 401k" },
  { p: "retiree", when: (c) => c.dd > 0.12, text: () => "Retirement account down again. Guess I'll work at the hardware store a few more years. They have nice aprons." },
  { p: "doomer", when: (c) => c.dd < 0.02, text: () => "stocks at record highs while everyone i know is broke. totally normal economy" },
  { p: "genz", when: (c) => c.dd < 0.03, text: () => "my $40 in index funds is now $43. i'm basically warren buffett" },
  { p: "meme", when: (c) => Math.abs(c.dayPct) >= 1.2, text: () => "traders watching the STX 500 today: 🎢😵‍💫🎢😵‍💫" },

  // ---------------------------------------------------------------- jobs
  { p: "regular", when: (c) => c.u >= 5, text: () => "laid off today after 8 years. anyone hiring? I can do excel and i'm very punctual" },
  { p: "regular", when: (c) => c.u >= 5.5, text: (_c, r) => `applied to ${r.int(120, 340)} jobs. ${r.int(1, 6)} interviews. 0 offers. this is fine` },
  { p: "student", when: (c) => c.u >= 5, text: () => "graduating in may into this job market. might just go get another degree and hide" },
  { p: "business", when: (c) => c.u <= 4, text: (_c, r) => `Been trying to hire a cashier for ${r.int(2, 5)} months. Offering $${r.int(19, 25)}/hr. Nobody.` },
  { p: "economist", when: (c) => c.u <= 3.8, text: () => "The labor market is extraordinarily tight. Wage growth will keep services inflation sticky." },
  { p: "genz", when: (c) => c.u <= 4, text: (_c, r) => `quit my job on monday, new job on wednesday, ${r.int(10, 25)}% raise. job hopping is self care` },
  { p: "politician", when: (c) => c.u >= 6, text: () => "Millions of Americans are out of work. Where is the Fed??" },
  { p: "economist", when: (c) => c.payrolls < 50, text: () => "Payroll growth is now below what's needed to keep unemployment steady. That's a warning light." },

  // ---------------------------------------------------------------- credibility & crisis
  { p: "economist", when: (c) => c.cred < 0.5, text: () => "Inflation expectations are de-anchoring. This is how the 1970s started." },
  { p: "doomer", when: (c) => c.cred < 0.4, text: () => "does anyone actually believe the Fed anymore? genuinely asking" },
  { p: "meme", when: (c) => c.cred < 0.45, text: () => "Fed: inflation will come down\nInflation: 🙂\nFed: any day now\nInflation: 🙂" },
  { p: "regular", when: (c) => c.stress > 0.4, text: () => "pulled all my money out of my bank today. just in case. it's under my mattress now. hi burglars" },
  { p: "economist", when: (c) => c.stress > 0.4, text: () => "Watch credit spreads, not stocks. That's where the real stress shows up." },
  { p: "economist", when: (c) => c.gdp < 0, text: () => "Two negative GDP prints doesn't technically make a recession but come on." },
  { p: "crypto", when: (c) => c.qe === 1, text: () => "money printer go brrrrrr 🖨️💸 bitcoin fixes this" },
  { p: "doomer", when: (c) => c.qe === 1, text: () => "they're printing again. weimar vibes" },
  { p: "economist", when: (c) => c.qe === -1, text: () => "QT quietly draining liquidity in the background. Watch the 10-year." },

  // ---------------------------------------------------------------- always-on
  { p: "economist", text: () => "Reminder: monetary policy works with long and variable lags. Today's decision hits the economy next year." },
  { p: "economist", text: (c) => `Market pricing for next FOMC: ${f2(c.priced)}%. Fed funds currently ${f2(c.rate)}%.` },
  { p: "economist", text: () => "Hot take: the Taylor rule is a guide, not a commandment. Cold take: everyone should still read it." },
  { p: "crypto", text: () => "fiat is a scam. the Fed is a scam. buy the orange coin" },
  { p: "crypto", text: (_c, r) => `stacking sats in ${r.pick(PLACES)} 🟧 the Fed can't print bitcoin` },
  { p: "regular", text: () => "what does the fed even do. like actually. i've never known" },
  { p: "regular", text: () => "i don't understand the economy but i understand that i'm tired" },
  { p: "genz", text: () => "the economy is a vibe and the vibe is bad" },
  { p: "genz", text: () => "my financial plan is to marry rich or become a mysterious forest witch. both have pros" },
  { p: "bro", text: () => "Fed Chair if you're reading this pls cut rates, my boat payment is due 🙏" },
  { p: "bro", text: () => "6am. cold plunge. read the fed minutes. this is the grind" },
  { p: "news", text: (c) => `10Y Treasury ${f2(c.y10)}% | 30Y Mortgage ${f2(c.mortgage)}% | STX ${Math.round(c.stock)}` },
  { p: "economist", text: () => "Everyone's an FOMC member on this app. Fun fact: actual FOMC members also argue a lot." },
  { p: "meme", text: () => "the FOMC meeting room, probably: 12 people, 1 whiteboard, 400 opinions" },
  { p: "meme", text: () => "Fed Chair walking into the press conference knowing every word will move $2 trillion 🚶‍♂️" },
  { p: "student", text: () => "macro exam tomorrow. the IS-LM curve has ruined my life" },
  { p: "farmer", text: (_c, r) => `${r.pick(["planting", "harvest", "calving", "fixing the combine"])} season. no time for the news. someone tell me if rates changed` },
  { p: "retiree", text: () => "Explained inflation to my grandkids using the price of a Snickers bar. They did not care." },
  { p: "landlord", text: () => "new tenant asked if rent is negotiable. i laughed for 10 minutes. then said no" },
  { p: "business", text: (_c, r) => `Small business owner tip #${r.int(2, 99)}: never check the news before opening. Just bake.` },
  { p: "politician", text: () => "I will be asking the Fed Chair some VERY tough questions at the next hearing." },
];

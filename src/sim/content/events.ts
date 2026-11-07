import type { Economy, Snapshot } from "../types";
import type { Persona } from "./accounts";

/**
 * Every random world event in one place. Each time an event fires it ROLLS its
 * specifics (how big the oil spike is, how large the failed bank was, how many
 * jobs were cut…). Those rolled numbers drive BOTH the economic impact and all
 * the text — so two oil spikes are never quite the same, and a bigger one
 * really does hit harder.
 *
 * Severity is log-normal around 1 (typical), occasionally 2+ (severe), and
 * some events scale with the state of the economy.
 */
export type Params = Record<string, number>;
type Text = string | ((p: Params) => string);

export interface Voice {
  name: string;
  role: string;
  text: Text;
}

export interface Roll {
  /** Severity: median 1, usually 0.5–2, clamped to [0.4, 2.5] */
  sev: () => number;
  uni: (lo: number, hi: number) => number;
  int: (lo: number, hi: number) => number;
}

export interface EventDef {
  id: string;
  /** Relative likelihood; can depend on conditions (e.g. bank trouble when rates are high). */
  weight: (e: Economy) => number;
  /** Roll this occurrence's specifics. */
  roll: (e: Economy, r: Roll) => Params;
  /** Apply the rolled event to the economy. */
  apply: (e: Economy, p: Params) => void;
  tone: "good" | "bad" | "neutral";
  headlines: ((p: Params) => string)[];
  popup: { headline: (p: Params) => string; body: (p: Params) => string; metric: keyof Snapshot };
  /** Key figures shown on the popup */
  stats: (p: Params) => { label: string; value: string; tone: "good" | "bad" | "neutral" }[];
  voices: Voice[];
  posts: { p: Persona; text: Text }[];
  art: { icons: string[]; from: string; to: string };
}

export const resolve = (t: Text, p: Params) => (typeof t === "string" ? t : t(p));

// ---------------------------------------------------------------- helpers

const V = (name: string, role: string, text: Text): Voice => ({ name, role, text });
const always = (w: number) => () => w;
const highRates = (base: number) => (e: Economy) => base * (1 + Math.max(0, e.policyRate - 4.5));
const money = (billions: number) => (billions >= 1000 ? `$${(billions / 1000).toFixed(1)}T` : `$${Math.round(billions)}B`);
const thousands = (k: number) => `${Math.round(k).toLocaleString()},000`;
const bad = (label: string, value: string) => ({ label, value, tone: "bad" as const });
const good = (label: string, value: string) => ({ label, value, tone: "good" as const });
const info = (label: string, value: string) => ({ label, value, tone: "neutral" as const });
const shockStocks = (e: Economy, pct: number) => {
  e.stockIndex *= 1 + pct / 100;
  e.stockHigh = Math.max(e.stockHigh, e.stockIndex);
};

const BANKS = ["First Coastal Bank", "Pinecrest Savings", "Harborview Bank", "Summit Federal", "Golden Plains Bank", "Riverside Trust"];

export const EVENTS: EventDef[] = [
  // ------------------------------------------------------------ energy & supply
  {
    id: "oilSpike", weight: always(3), tone: "bad",
    roll: (_e, r) => { const pct = Math.round(8 + 11 * r.sev()); return { pct, price: Math.round(82 * (1 + pct / 100)), cents: Math.round(pct * 2.2) }; },
    apply: (e, p) => { e.supplyShock += p.pct / 17; shockStocks(e, -p.pct / 9); },
    headlines: [
      (p) => `Oil spikes ${p.pct}% as Gulf supply disruption rattles markets`,
      (p) => `Crude soars to $${p.price} on pipeline sabotage; gas prices set to jump`,
      (p) => `Oil jumps ${p.pct}% as major producers slash output`,
    ],
    popup: {
      headline: (p) => `Oil spikes ${p.pct}% to $${p.price} a barrel`, metric: "cpi",
      body: (p) => `Energy costs flow straight into prices while squeezing consumers.${p.pct >= 25 ? " This one is big — 1970s-style big." : ""} Classic stagflation risk: hike and you deepen the slowdown, wait and inflation may spread.`,
    },
    stats: (p) => [bad("Oil", `+${p.pct}%`), bad("Gas", `+$${(p.cents / 100).toFixed(2)}/gal`)],
    voices: [
      V("Mike R.", "Truck driver, Texas", (p) => `Filling my rig costs $${Math.round(p.cents * 1.5)} more than last week. That comes out of my kid's braces.`),
      V("Dr. Ana Kowalski", "Economist", "Textbook supply shock. Higher prices and slower growth at the same time — the Fed's worst nightmare."),
      V("Linda P.", "Commuter, New Jersey", "I'm carpooling with my neighbor now. We don't even like each other."),
    ],
    posts: [
      { p: "regular", text: (p) => `gas went up ${p.cents} cents overnight. OVERNIGHT.` },
      { p: "economist", text: (p) => `Oil +${p.pct}% in a day. That feeds straight into prices AND squeezes spending. The Fed's dilemma just got worse.` },
      { p: "meme", text: "gas station signs right now: 📈📈📈📈" },
    ],
    art: { icons: ["🛢️", "🔥", "⛽", "💸"], from: "#7a2e0e", to: "#2b0d05" },
  },
  {
    id: "oilCrash", weight: always(2), tone: "good",
    roll: (_e, r) => { const pct = Math.round(8 + 9 * r.sev()); return { pct, price: Math.round(82 * (1 - pct / 100)) }; },
    apply: (e, p) => { e.supplyShock -= p.pct / 25; },
    headlines: [(p) => `Crude plunges ${p.pct}% as producers flood the market`, (p) => `Oil price war erupts; crude sinks to $${p.price}`, (p) => `Gas prices tumble as oil glut builds; crude down ${p.pct}%`],
    popup: { headline: (p) => `Crude plunges ${p.pct}% to $${p.price}`, metric: "cpi", body: () => "Cheaper energy pulls inflation down and gives consumers a boost. A gift — if it lasts." },
    stats: (p) => [good("Oil", `−${p.pct}%`), good("Barrel", `$${p.price}`)],
    voices: [V("Jess", "Nurse, Ohio", "Gas under three bucks! I drove to my mom's just because I could."), V("Hank D.", "Oil field worker, North Dakota", "Good for drivers. Bad for us. They're already talking layoffs.")],
    posts: [{ p: "regular", text: "gas under $3 near me?? filling up every car i own" }, { p: "bro", text: (p) => `oil -${p.pct}%. airlines and cruise stocks about to RIP 🚀` }],
    art: { icons: ["🛢️", "📉", "⛽", "😮‍💨"], from: "#0e5a4a", to: "#062620" },
  },
  {
    id: "gasDiscovery", weight: always(1), tone: "good",
    roll: (_e, r) => { const s = r.sev(); return { tcf: Math.round(15 + 30 * s), s }; },
    apply: (e, p) => { e.supplyShock -= 0.25 * p.s; e.potentialGrowth = Math.min(2.8, e.potentialGrowth + 0.03 * p.s); },
    headlines: [(p) => `Massive ${p.tcf} trillion cubic-foot gas field discovered offshore`, () => "Record gas find promises cheaper energy for a decade"],
    popup: { headline: (p) => `${p.tcf} trillion cubic feet of natural gas discovered`, metric: "cpi", body: () => "Cheaper energy for years to come lowers costs across the economy — a gentle, lasting downward pull on inflation." },
    stats: (p) => [good("Reserves", `${p.tcf} tcf`)],
    voices: [V("Macro Mike", "Strategist", "Lower energy costs are a tailwind for every factory in the country."), V("Dale", "Farmer, Iowa", "Fertilizer's made from gas. This could save us a fortune.")],
    posts: [{ p: "farmer", text: "cheaper gas = cheaper fertilizer. best news all year for us 🌽" }, { p: "economist", text: "Positive supply shock. Rare and very welcome." }],
    art: { icons: ["🔥", "⛽", "🌊", "💰"], from: "#0e4a5e", to: "#051a24" },
  },
  {
    id: "supplyChain", weight: always(2), tone: "bad",
    roll: (_e, r) => { const s = r.sev(); return { ships: Math.round(60 + 110 * s), weeks: Math.max(2, Math.round(2 + 4 * s)), s }; },
    apply: (e, p) => { e.supplyShock += 0.4 * p.s + p.weeks * 0.03; },
    headlines: [() => "Port strike snarls supply chains coast to coast", (p) => `Container backlog hits record: ${p.ships} cargo ships stuck offshore`, (p) => `Shipping chaos could last ${p.weeks} weeks, carriers warn`],
    popup: { headline: (p) => `Port strike strands ${p.ships} cargo ships`, metric: "cpi", body: (p) => `Goods are stuck, shelves are thin, prices rise — for maybe ${p.weeks} weeks. Rates can't fix supply, but they can stop it becoming persistent inflation.` },
    stats: (p) => [bad("Ships stuck", `${p.ships}`), bad("Est. delay", `${p.weeks} wks`)],
    voices: [V("Tom", "Hardware store owner", (p) => `${p.weeks + 2} weeks waiting on a container of drills. Prices are going up, sorry.`), V("Dr. Ana Kowalski", "Economist", "Rate hikes can't unload a ship. But they can stop the price spike from spreading.")],
    posts: [{ p: "business", text: "Our shipment is stuck on a boat somewhere. Shelves empty till further notice." }, { p: "genz", text: "the thing i ordered in march just said 'arriving in october' 💀" }],
    art: { icons: ["🚢", "📦", "⛔", "⏳"], from: "#0e3f5e", to: "#051826" },
  },
  {
    id: "shippingRelief", weight: always(1.5), tone: "good",
    roll: (_e, r) => { const s = r.sev(); return { pct: Math.round(20 + 22 * s), s }; },
    apply: (e, p) => { e.supplyShock -= 0.3 * p.s; },
    headlines: [(p) => `Shipping rates collapse ${p.pct}% as supply chains heal`, () => "Ports clear backlog; delivery times back to normal"],
    popup: { headline: (p) => `Supply chains heal; shipping costs fall ${p.pct}%`, metric: "cpi", body: () => "Goods flow freely again. Goods prices should cool over the coming months — doing some of your job for you." },
    stats: (p) => [good("Freight rates", `−${p.pct}%`)],
    voices: [V("Tom", "Hardware store owner", "Containers arriving on time for the first time in a year. I could cry."), V("Macro Mike", "Strategist", "Goods disinflation incoming.")],
    posts: [{ p: "business", text: "First on-time shipment in months. Lowering prices on power tools this week!" }],
    art: { icons: ["🚢", "✅", "📦", "📉"], from: "#145e4a", to: "#05241c" },
  },
  {
    id: "drought", weight: always(1.2), tone: "bad",
    roll: (_e, r) => { const s = r.sev(); return { loss: Math.round(8 + 14 * s), days: Math.round(30 + 25 * s), s }; },
    apply: (e, p) => { e.supplyShock += p.loss / 40; e.demandShock -= 0.05 * p.s; },
    headlines: [() => "Historic drought scorches the Corn Belt", (p) => `Crop failures wipe out ${p.loss}% of harvest; food prices soar`, (p) => `No rain in ${p.days} days: worst drought in decades hits farms`],
    popup: { headline: (p) => `Drought wipes out ${p.loss}% of the harvest`, metric: "cpi", body: () => "Food prices will climb as harvests fail. It's a supply shock — but food inflation is the kind people notice most." },
    stats: (p) => [bad("Crop loss", `${p.loss}%`), bad("Days w/o rain", `${p.days}`)],
    voices: [V("Dale", "Farmer, Iowa", "Corn's knee-high in August. That's not a joke anymore."), V("Jess", "Nurse, Ohio", "Bread is $5 now. Bread.")],
    posts: [{ p: "farmer", text: (p) => `haven't seen rain in ${p.days} days. crop insurance guy stopped answering my calls` }, { p: "regular", text: "why does a salad cost $14 now" }],
    art: { icons: ["🌽", "☀️", "🏜️", "🥀"], from: "#7a5a0e", to: "#2b1f05" },
  },
  {
    id: "birdFlu", weight: always(1), tone: "bad",
    roll: (_e, r) => { const s = r.sev(); return { birds: Math.round(8 + 30 * s), eggs: Math.round(35 + 60 * s), s }; },
    apply: (e, p) => { e.supplyShock += 0.12 * p.s; },
    headlines: [(p) => `Bird flu outbreak sends egg prices up ${p.eggs}%`, (p) => `Egg shortage spreads as bird flu hits ${p.birds} million hens`],
    popup: { headline: (p) => `Bird flu culls ${p.birds} million hens; eggs up ${p.eggs}%`, metric: "cpi", body: () => "A small slice of the price index — but a very visible one. Expect angry headlines about breakfast." },
    stats: (p) => [bad("Egg prices", `+${p.eggs}%`), bad("Hens lost", `${p.birds}M`)],
    voices: [V("Maria", "Bakery owner, Ohio", "I use 400 eggs a week. Do the math. I'm crying into my croissants."), V("Grandpa Lou", "Retiree", "Eggs used to be 79 cents. I'm not exaggerating.")],
    posts: [{ p: "regular", text: "eggs are now a luxury good. i'm framing this dozen" }, { p: "meme", text: "me guarding my last 3 eggs like they're gold bars 🥚🔒" }],
    art: { icons: ["🥚", "🐔", "💸", "🛒"], from: "#7a6a2e", to: "#2b250d" },
  },
  {
    id: "hurricane", weight: always(1), tone: "bad",
    roll: (_e, r) => { const s = r.sev(); const cat = s > 1.5 ? 5 : s > 0.9 ? 4 : 3; return { cat, damage: Math.round(12 * s * (cat - 1)) * 1 }; },
    apply: (e, p) => { e.demandShock -= p.damage / 180; e.supplyShock += p.damage / 240; },
    headlines: [(p) => `Category ${p.cat} hurricane slams Gulf Coast; refineries offline`, (p) => `Hurricane damage estimates top ${money(p.damage)}`],
    popup: { headline: (p) => `Category ${p.cat} hurricane slams the Gulf Coast`, metric: "cpi", body: (p) => `Damage estimated at ${money(p.damage)}. Refineries are offline and regional activity has stalled — prices up, growth down.` },
    stats: (p) => [bad("Category", `${p.cat}`), bad("Damage", money(p.damage))],
    voices: [V("Denise", "Resident, Louisiana", "We lost the roof. Insurance says six weeks. We're staying with my sister."), V("Macro Mike", "Strategist", "Refinery outages will hit gas prices nationwide within days.")],
    posts: [{ p: "news", text: (p) => `Hurricane damage estimates top ${money(p.damage)}. Gas prices rising.` }, { p: "regular", text: "thoughts with everyone on the Gulf Coast tonight 🙏" }],
    art: { icons: ["🌀", "🏭", "🌊", "⚠️"], from: "#2a4a5e", to: "#0b1820" },
  },
  {
    id: "heatwave", weight: always(1), tone: "bad",
    roll: (_e, r) => { const s = r.sev(); return { temp: Math.round(106 + 6 * s), s }; },
    apply: (e, p) => { e.supplyShock += 0.12 * p.s; e.demandShock -= 0.06 * p.s; },
    headlines: [() => "Record heat wave strains the power grid", (p) => `Rolling blackouts as ${p.temp}°F heat dome bakes the West`],
    popup: { headline: (p) => `${p.temp}°F heat wave strains the power grid`, metric: "cpi", body: () => "Electricity prices spike and outdoor work slows. A small, temporary hit — unless it keeps happening." },
    stats: (p) => [bad("Peak temp", `${p.temp}°F`)],
    voices: [V("Carlos", "HVAC technician", "I've done 14 AC repairs today. Fourteen. I'm living on gas station coffee.")],
    posts: [{ p: "regular", text: "my electric bill just came in and i need to lie down (in front of a fan)" }, { p: "genz", text: (p) => `it's ${p.temp}° and my landlord says the AC is 'cosmetic'` }],
    art: { icons: ["🌡️", "☀️", "⚡", "🥵"], from: "#7a3a0e", to: "#2b1205" },
  },
  {
    id: "autoStrike", weight: always(1), tone: "bad",
    roll: (_e, r) => { const s = r.sev(); return { workers: Math.round(40 + 90 * s), s }; },
    apply: (e, p) => { e.supplyShock += p.workers / 420; e.demandShock -= p.workers / 380; },
    headlines: [(p) => `${thousands(p.workers)} autoworkers walk out in nationwide strike`, () => "Car plants go dark as union strike widens"],
    popup: { headline: (p) => `${thousands(p.workers)} autoworkers go on strike`, metric: "gdp", body: () => "Factories idle, car prices rise, and paychecks stop. A hit to both growth and inflation." },
    stats: (p) => [bad("Workers out", `${p.workers}K`)],
    voices: [V("Ray T.", "Autoworker, Michigan", "We kept the lines running through everything. We want our share."), V("Macro Mike", "Strategist", "Used car prices are about to go vertical again.")],
    posts: [{ p: "regular", text: "solidarity with the autoworkers ✊" }, { p: "bro", text: "used car dealers are about to print money" }],
    art: { icons: ["🚗", "✊", "🏭", "⛔"], from: "#4a2e5e", to: "#1a0f24" },
  },

  // ------------------------------------------------------------ demand
  {
    id: "consumerSurge", weight: always(2), tone: "neutral",
    roll: (_e, r) => { const s = r.sev(); return { pct: +(0.9 + 1.3 * s).toFixed(1), s }; },
    apply: (e, p) => { e.demandShock += 0.55 * p.s; },
    headlines: [(p) => `Retail sales jump ${p.pct}%, smashing estimates`, () => "Consumers on a spending spree; shoppers shrug off prices", (p) => `Spending booms: retail sales +${p.pct}% in a month`],
    popup: { headline: (p) => `Retail sales jump ${p.pct}% in a month`, metric: "gdp", body: () => "Consumer demand is running hot. Expect stronger growth — and more inflation pressure if it persists." },
    stats: (p) => [info("Retail sales", `+${p.pct}% m/m`)],
    voices: [V("Tom", "Hardware store owner", "Can't keep grills in stock. Best spring we've had in a decade."), V("Macro Mike", "Strategist", "Strong spending is great until it isn't. This keeps inflation sticky.")],
    posts: [{ p: "regular", text: "bought a jet ski. don't know why. economy made me do it" }, { p: "genz", text: "treating myself is a lifestyle not a phase" }],
    art: { icons: ["🛍️", "💳", "🛒", "🎉"], from: "#6b2a6b", to: "#260c26" },
  },
  {
    id: "consumerSlump", weight: always(2), tone: "bad",
    roll: (_e, r) => { const s = r.sev(); return { pct: +(0.6 + 1.2 * s).toFixed(1), s }; },
    apply: (e, p) => { e.demandShock -= 0.6 * p.s; },
    headlines: [(p) => `Retail sales slump ${p.pct}% as shoppers pull back`, () => "Consumers tighten belts; mall traffic plunges", (p) => `Spending falls ${p.pct}%, worst month in two years`],
    popup: { headline: (p) => `Retail sales fall ${p.pct}%`, metric: "gdp", body: () => "Demand is weakening. Growth and hiring may slow over the coming months." },
    stats: (p) => [bad("Retail sales", `−${p.pct}% m/m`)],
    voices: [V("Maria", "Bakery owner, Ohio", "Weekday mornings are dead. People are skipping the croissant."), V("Macro Mike", "Strategist", "Consumers are 70% of GDP. When they stop, everything stops.")],
    posts: [{ p: "business", text: "Slowest week we've had in 3 years. Where did everyone go?" }, { p: "regular", text: "cancelled 4 subscriptions today. feeling powerful" }],
    art: { icons: ["🛒", "💤", "🏪", "📉"], from: "#3a3f4a", to: "#16181d" },
  },
  {
    id: "holidayBoom", weight: always(1), tone: "neutral",
    roll: (_e, r) => { const s = r.sev(); return { pct: Math.round(4 + 5 * s), s }; },
    apply: (e, p) => { e.demandShock += 0.35 * p.s; },
    headlines: [(p) => `Record holiday season: sales up ${p.pct}% from last year`, () => "Black Friday sales smash records"],
    popup: { headline: (p) => `Holiday sales up ${p.pct}% — a record`, metric: "gdp", body: () => "Retailers are thrilled. You might be less so: hot demand keeps inflation sticky." },
    stats: (p) => [info("Holiday sales", `+${p.pct}% y/y`)],
    voices: [V("Ngozi", "Food truck owner", "Lines around the block every night this month."), V("Barb", "Retiree, Florida", "I bought presents for the grandkids AND the grand-dogs.")],
    posts: [{ p: "genz", text: "my bank app sent me a 'are you okay?' notification after black friday" }],
    art: { icons: ["🎁", "🛍️", "🎄", "💳"], from: "#5e1438", to: "#200614" },
  },
  {
    id: "stimulus",
    // Congress acts more (and bigger) when unemployment is high
    weight: (e) => 1 + Math.max(0, e.unemployment - 5),
    tone: "neutral",
    roll: (e, r) => { const size = Math.round(((250 + 550 * r.sev()) * (1 + Math.max(0, e.unemployment - 5) / 3)) / 50) * 50; return { size }; },
    apply: (e, p) => { e.demandShock += p.size / 850; },
    headlines: [(p) => `Congress passes ${money(p.size)} stimulus package`, (p) => `${money(p.size)} relief bill approved in late-night vote`],
    popup: { headline: (p) => `Congress passes a ${money(p.size)} stimulus package`, metric: "gdp", body: (p) => `A ${p.size >= 1000 ? "massive" : "sizeable"} fiscal push will boost demand. If the economy is already hot, that means more inflation for you to fight.` },
    stats: (p) => [info("Package", money(p.size))],
    voices: [V("Sen. Dale Brooks", "Senator (fictional)", "This package puts money back in the pockets of hardworking families!"), V("Dr. Ana Kowalski", "Economist", "Fiscal gas pedal while the Fed is on the brake. Expect higher rates for longer.")],
    posts: [{ p: "economist", text: (p) => `${money(p.size)} of fiscal stimulus. The Fed won't love this.` }, { p: "bro", text: "STIMMY 💸💸 straight into calls" }],
    art: { icons: ["🏛️", "💵", "💵", "📬"], from: "#1d5e2e", to: "#08240f" },
  },
  {
    id: "taxCut", weight: always(1), tone: "neutral",
    roll: (_e, r) => { const s = r.sev(); return { size: Math.round((600 + 1200 * s) / 100) * 100, s }; },
    apply: (e, p) => { e.demandShock += p.size / 2600; shockStocks(e, 0.8 + p.s); },
    headlines: [(p) => `Congress passes ${money(p.size)} in tax cuts`, () => "Tax cut bill signed; corporate rate slashed"],
    popup: { headline: (p) => `${money(p.size)} tax cut signed into law`, metric: "gdp", body: () => "More money in pockets and corporate coffers. Growth gets a lift — and so does inflation pressure." },
    stats: (p) => [info("10-yr cost", money(p.size))],
    voices: [V("Rick", "Real estate investor", "Best day of my life. Buying three more duplexes."), V("Prof. Lena Ortiz", "Economist", "Deficit-financed tax cuts at full employment. That's fuel on the fire.")],
    posts: [{ p: "landlord", text: "tax cut just dropped. time to expand the portfolio 🏘️" }, { p: "economist", text: "Fiscal and monetary policy are now pulling in opposite directions." }],
    art: { icons: ["🏛️", "✂️", "💰", "📈"], from: "#1d4f5e", to: "#081d24" },
  },
  {
    id: "shutdown", weight: always(1), tone: "bad",
    roll: (_e, r) => ({ weeks: Math.max(1, Math.round(1 + 3 * r.sev())) }),
    apply: (e, p) => { e.demandShock -= 0.08 * p.weeks; },
    headlines: [() => "Government shuts down as budget talks collapse", (p) => `Shutdown enters week ${p.weeks}; 800,000 federal workers unpaid`],
    popup: { headline: (p) => `Government shutdown expected to last ${p.weeks} week${p.weeks > 1 ? "s" : ""}`, metric: "gdp", body: () => "Hundreds of thousands of federal workers miss paychecks. A dent in spending — usually temporary." },
    stats: (p) => [bad("Expected length", `${p.weeks} wk${p.weeks > 1 ? "s" : ""}`)],
    voices: [V("Tasha K.", "Federal contractor", "Second shutdown in three years. My mortgage doesn't shut down."), V("Macro Mike", "Strategist", "Shutdowns shave a bit off GDP, then it bounces back. Usually.")],
    posts: [{ p: "regular", text: "national parks closed, IRS still open somehow. make it make sense" }, { p: "politician", text: "The other party shut down the government. Shameful." }],
    art: { icons: ["🏛️", "🔒", "📋", "⏸️"], from: "#3a3f4a", to: "#111317" },
  },
  {
    id: "housingFrenzy", weight: (e) => (e.mortgageRate < 6.2 ? 2 : 0.4), tone: "neutral",
    roll: (_e, r) => { const s = r.sev(); return { over: Math.round(15 + 40 * s), offers: Math.round(5 + 10 * s), s }; },
    apply: (e, p) => { e.demandShock += 0.2 * p.s; e.homePrice *= 1 + 0.012 * p.s; },
    headlines: [() => "Bidding wars return as buyers flood the housing market", (p) => `Homes selling $${p.over}K over asking in hot markets`],
    popup: { headline: (p) => `Bidding wars: homes going $${p.over}K over asking`, metric: "homePrice", body: () => "Lower rates have buyers scrambling. Rising home values feed spending — and shelter inflation follows." },
    stats: (p) => [info("Over asking", `$${p.over}K`), info("Offers/home", `${p.offers}`)],
    voices: [V("Priya & Sam", "First-time homebuyers", (p) => `We offered $${p.over + 10}K over asking with no inspection. Still lost.`), V("Karen V.", "Realtor, Arizona", (p) => `${p.offers} offers by Saturday. It's 2021 all over again.`)],
    posts: [{ p: "homebuyer", text: "lost our 7th bidding war. at this point i'm just buying a tent" }, { p: "landlord", text: "raising rents 8% next lease cycle. market rate baby" }],
    art: { icons: ["🏠", "🔥", "🔨", "💵"], from: "#6e4a12", to: "#261806" },
  },

  // ------------------------------------------------------------ finance
  {
    id: "bankFailure", weight: highRates(1.5), tone: "bad",
    // Bigger failures when rates are high (losses on bonds and loans pile up)
    roll: (e, r) => ({ deposits: Math.round((15 + 110 * r.sev()) * (1 + Math.max(0, e.policyRate - 4) / 3)), bank: r.int(0, BANKS.length - 1) }),
    apply: (e, p) => { e.financialStress += p.deposits / 110; shockStocks(e, -(1.5 + p.deposits / 45)); },
    headlines: [(p) => `${BANKS[p.bank]} collapses; depositors line up at branches`, (p) => `Regulators seize ${BANKS[p.bank]} after ${money(p.deposits)} run on deposits`],
    popup: {
      headline: (p) => `${BANKS[p.bank]} collapses with ${money(p.deposits)} in deposits`, metric: "stockIndex",
      body: (p) => `${p.deposits >= 150 ? "One of the largest bank failures in history. " : ""}Financial stress is spiking. Credit tightens, stocks fall, and the panic could spread. Your bank lending facility can calm it — at a small credibility cost.`,
    },
    stats: (p) => [bad("Deposits", money(p.deposits)), bad("Bank", BANKS[p.bank].split(" ")[0])],
    voices: [
      V("Ray T.", "Small business owner", (p) => `Our payroll account was at ${BANKS[p.bank]}. I have 40 employees to pay on Friday.`),
      V("Margaret Lin", "NY Fed President", "We are monitoring the situation closely. The banking system remains sound. (She looked nervous.)"),
      V("Dev", "Software engineer", "Moved everything to a bigger bank at 2am. Not proud of it."),
    ],
    posts: [
      { p: "regular", text: (p) => `line outside ${BANKS[p.bank]} is around the block 😳` },
      { p: "doomer", text: "bank run. it's starting. get your cash out NOW" },
      { p: "economist", text: (p) => `${money(p.deposits)} bank failure. The Fed has a lending facility for exactly this. Will they use it?` },
    ],
    art: { icons: ["🏦", "🏃", "🏃‍♀️", "💵"], from: "#5e1414", to: "#1f0606" },
  },
  {
    id: "creBust", weight: highRates(1), tone: "bad",
    roll: (e, r) => ({ defaults: Math.round((10 + 35 * r.sev()) * (1 + Math.max(0, e.policyRate - 4) / 4)) }),
    apply: (e, p) => { e.financialStress += p.defaults / 80; e.demandShock -= p.defaults / 140; shockStocks(e, -p.defaults / 20); },
    headlines: [() => "Office-tower defaults pile up; regional banks wobble", (p) => `Commercial real estate bust: ${money(p.defaults)} in loans go bad`],
    popup: { headline: (p) => `${money(p.defaults)} in office loans default`, metric: "stockIndex", body: () => "Empty offices and expensive refinancing are crushing commercial real estate — and the banks that lent against it." },
    stats: (p) => [bad("Defaults", money(p.defaults))],
    voices: [V("Prof. Lena Ortiz", "Economist", "Higher rates eventually find the weakest borrowers. Commercial real estate was always first in line."), V("Rick", "Real estate investor", "I'm fine. Totally fine. Anyone want to buy a 40-story building?")],
    posts: [{ p: "landlord", text: "anyone want an office building? cheap. very cheap. please" }, { p: "economist", text: "CRE losses are a slow-motion bank problem." }],
    art: { icons: ["🏢", "📉", "🏦", "🕸️"], from: "#4a3a2e", to: "#1a140f" },
  },
  {
    id: "cyberAttack", weight: always(0.8), tone: "bad",
    roll: (_e, r) => ({ hours: Math.max(2, Math.round(3 + 9 * r.sev())) }),
    apply: (e, p) => { e.financialStress += p.hours / 28; e.demandShock -= p.hours / 55; shockStocks(e, -(0.8 + p.hours / 8)); },
    headlines: [() => "Cyberattack knocks out major payment network", (p) => `Hackers cripple card payments nationwide for ${p.hours} hours`],
    popup: { headline: (p) => `Cyberattack knocks out card payments for ${p.hours} hours`, metric: "stockIndex", body: () => "Commerce stalled, and markets worry about the plumbing of the financial system." },
    stats: (p) => [bad("Outage", `${p.hours} hrs`)],
    voices: [V("Ngozi", "Food truck owner", "Cash only today. Lost half my lunch rush."), V("Dev", "Software engineer", "Someone's getting fired for that patch they skipped.")],
    posts: [{ p: "genz", text: "had to pay with CASH today. felt like a medieval peasant" }, { p: "crypto", text: "this is why you need self-custody 🔐₿" }],
    art: { icons: ["💻", "🔓", "💳", "⚠️"], from: "#1d2e5e", to: "#080f24" },
  },
  {
    id: "debtCeiling", weight: always(0.8), tone: "bad",
    // Fewer days to the "X-date" = scarier
    roll: (_e, r) => { const s = r.sev(); return { days: Math.max(2, Math.round(26 / s)), s }; },
    apply: (e, p) => { e.yield10y += 0.08 + 0.12 * p.s; e.financialStress += 0.1 * p.s; shockStocks(e, -(0.8 + p.s)); },
    headlines: [(p) => `Debt ceiling standoff: Treasury warns of default in ${p.days} days`, () => "Default fears rattle bond market as debt talks stall"],
    popup: { headline: (p) => `Debt ceiling: ${p.days} days until possible default`, metric: "yield10y", body: () => "Bond investors demand more to hold Treasuries. Long rates rise — tightening conditions without any action from you." },
    stats: (p) => [bad("Days to X-date", `${p.days}`)],
    voices: [V("Macro Mike", "Strategist", "Same movie every few years. Markets hate the ending anyway."), V("Grandpa Lou", "Retiree", "If they default on my Treasury bonds, I'm moving in with my son.")],
    posts: [{ p: "politician", text: "We will NOT raise the debt ceiling without spending cuts." }, { p: "doomer", text: (p) => `US default in ${p.days} days. unthinkable? think again.` }],
    art: { icons: ["🏛️", "💣", "📜", "⏰"], from: "#5e3a0e", to: "#201305" },
  },
  {
    id: "currencyCrisis", weight: always(0.8), tone: "bad",
    roll: (_e, r) => { const s = r.sev(); return { pct: Math.round(12 + 22 * s), s }; },
    apply: (e, p) => { shockStocks(e, -(1 + 1.5 * p.s)); e.yield10y -= 0.1 * p.s; e.demandShock -= 0.2 * p.s; },
    headlines: [() => "Currency crisis abroad sends investors fleeing to Treasuries", (p) => `Emerging-market currencies plunge ${p.pct}%; dollar surges`],
    popup: { headline: (p) => `Currency crisis abroad: currencies down ${p.pct}%`, metric: "yield10y", body: () => "Global panic sends money into US Treasuries, pushing yields down — but exports and earnings take a hit." },
    stats: (p) => [bad("EM currencies", `−${p.pct}%`)],
    voices: [V("Prof. Lena Ortiz", "Economist", "When the world panics, it buys Treasuries. Lucky us, sort of."), V("Tom", "Hardware store owner", "My supplier overseas just doubled their prices. In their currency.")],
    posts: [{ p: "economist", text: "Flight to safety: 10-year yields falling as global markets wobble." }],
    art: { icons: ["🌍", "💱", "📉", "🏃"], from: "#1d3b6e", to: "#0a1428" },
  },
  {
    id: "cryptoCrash", weight: always(1), tone: "bad",
    roll: (_e, r) => { const s = r.sev(); return { lost: Math.round(250 + 700 * s), s }; },
    apply: (e, p) => { shockStocks(e, -(0.4 + 0.8 * p.s)); e.financialStress += 0.08 * p.s; },
    headlines: [(p) => `Crypto crash wipes out ${money(p.lost)} in a week`, () => "Major crypto exchange halts withdrawals"],
    popup: { headline: (p) => `Crypto crash wipes out ${money(p.lost)}`, metric: "stockIndex", body: () => "A small corner of finance, but a loud one. Watch whether the losses spill over into banks and tech stocks." },
    stats: (p) => [bad("Wiped out", money(p.lost))],
    voices: [V("Laser Eyes Larry", "Crypto investor", "This is fine. This is a buying opportunity. (It is not fine.)"), V("Grandpa Lou", "Retiree", "I told my grandson. Did he listen? No.")],
    posts: [{ p: "crypto", text: "zoom out. ZOOM OUT. (please zoom out)" }, { p: "meme", text: "crypto bros explaining why -70% is bullish: 🧵 1/47" }],
    art: { icons: ["🪙", "📉", "💥", "😭"], from: "#5e3a0e", to: "#201305" },
  },
  {
    id: "memeMania", weight: always(0.8), tone: "neutral",
    roll: (_e, r) => { const s = r.sev(); return { pct: Math.round(120 + 400 * s), s }; },
    apply: (e, p) => { shockStocks(e, 0.3 * p.s); },
    headlines: [() => "Meme-stock mania returns as retail traders pile in", (p) => `Retail frenzy sends struggling retailer up ${p.pct}%`],
    popup: { headline: (p) => `Meme-stock mania: a dying retailer is up ${p.pct}%`, metric: "stockIndex", body: () => "Retail traders are back and they brought rocket emojis. Mostly harmless — a sign of easy money and high spirits." },
    stats: (p) => [info("Meme stock", `+${p.pct}%`)],
    voices: [V("Brayden", "Options trader, 24", "I am not leaving. I like the stock."), V("Macro Mike", "Strategist", "Froth is a symptom of loose financial conditions.")],
    posts: [{ p: "bro", text: (p) => `+${p.pct}% WE LIKE THE STOCK 🚀🚀🚀🦍` }, { p: "genz", text: "my roommate just explained short squeezes to me for 45 minutes. send help" }],
    art: { icons: ["🦍", "🚀", "💎", "🙌"], from: "#3b1d7a", to: "#120830" },
  },

  // ------------------------------------------------------------ tech & productivity
  {
    id: "aiBoom", weight: always(2), tone: "good",
    roll: (_e, r) => { const s = r.sev(); return { capex: Math.round(80 + 220 * s), s }; },
    apply: (e, p) => { e.demandShock += p.capex / 500; e.earnings *= 1 + 0.03 * p.s; },
    headlines: [() => "AI investment boom lifts tech earnings far above forecasts", (p) => `Tech giants pledge ${money(p.capex)} in new AI data centers`, () => "Chipmakers soar on insatiable AI demand"],
    popup: { headline: (p) => `AI boom: ${money(p.capex)} in new data-center spending`, metric: "stockIndex", body: () => "Business investment and stock prices surge. Good for growth, but the extra demand can push inflation up." },
    stats: (p) => [info("New AI capex", money(p.capex))],
    voices: [V("Brayden", "Options trader, 24", "I put my whole bonus in chip stocks. I am a genius. Write that down."), V("Dr. Ana Kowalski", "Economist", "Real investment boom or bubble? Both push up demand — and inflation — in the short run.")],
    posts: [{ p: "bro", text: "AI is going to make us all rich (except you, you didn't buy calls)" }, { p: "regular", text: "my job title is now 'AI prompt strategist'. same job. same pay." }],
    art: { icons: ["🤖", "📈", "💾", "✨"], from: "#3b1d7a", to: "#120830" },
  },
  {
    id: "techCrash", weight: always(1), tone: "bad",
    roll: (_e, r) => ({ drop: +(4 + 5 * r.sev()).toFixed(1) }),
    apply: (e, p) => { shockStocks(e, -p.drop); e.financialStress += p.drop / 22; },
    headlines: [() => "Tech megacaps crash on guidance cuts", (p) => `Tech rout: megacaps lose ${p.drop}% in a day`],
    popup: { headline: (p) => `Tech megacaps crash ${p.drop}% on guidance cuts`, metric: "stockIndex", body: () => "A sharp stock drop dents household wealth and raises financial stress." },
    stats: (p) => [bad("Market drop", `−${p.drop}%`)],
    voices: [V("Brayden", "Options trader, 24", (p) => `My portfolio is down ${Math.round(p.drop * 4)}%. I am no longer a genius. Do not write that down.`), V("Grandpa Lou", "Retiree", "Seen this before. Don't panic. Don't sell. Go outside.")],
    posts: [{ p: "bro", text: "i was told tech only goes up" }, { p: "doomer", text: "dot-com 2.0. called it." }],
    art: { icons: ["💻", "📉", "💥", "😱"], from: "#5e1438", to: "#200614" },
  },
  {
    id: "aiLayoffs", weight: always(1), tone: "bad",
    roll: (_e, r) => ({ jobs: Math.round(15 + 60 * r.sev()) }),
    apply: (e, p) => { e.demandShock -= p.jobs / 180; e.supplyShock -= p.jobs / 450; },
    headlines: [(p) => `Tech giants announce ${thousands(p.jobs)} AI-driven layoffs`, () => "White-collar layoffs spread as companies automate"],
    popup: { headline: (p) => `${thousands(p.jobs)} jobs cut as companies automate with AI`, metric: "unemployment", body: () => "Productivity up, jobs down. Lower costs ease inflation, but laid-off workers spend less." },
    stats: (p) => [bad("Jobs cut", `${p.jobs}K`)],
    voices: [V("Dev", "Software engineer", "Replaced by a chatbot I helped train. Poetic, honestly."), V("Prof. Lena Ortiz", "Economist", "Technological unemployment fears are old. This time the speed is new.")],
    posts: [{ p: "regular", text: "got laid off and replaced by an AI. it's not even good at my job lmao" }, { p: "student", text: "majoring in computer science was supposed to be the safe choice 🙃" }],
    art: { icons: ["🤖", "📦", "🚪", "💼"], from: "#3a2e5e", to: "#130f24" },
  },
  {
    id: "productivity", weight: always(1), tone: "good",
    roll: (_e, r) => { const s = r.sev(); return { pct: +(2.2 + 1.6 * s).toFixed(1), s }; },
    apply: (e, p) => { e.supplyShock -= 0.3 * p.s; e.potentialGrowth = Math.min(2.8, e.potentialGrowth + 0.12 * p.s); },
    headlines: [(p) => `Productivity surges ${p.pct}%, fastest pace in two decades`, () => "Output per worker jumps; economists cheer"],
    popup: { headline: (p) => `Productivity surges ${p.pct}% — a two-decade high`, metric: "gdp", body: () => "The economy can grow faster without overheating. Inflation pressure eases." },
    stats: (p) => [good("Productivity", `+${p.pct}%`)],
    voices: [V("Dr. Ana Kowalski", "Economist", "More output per worker means growth without inflation. The best news a central banker can get.")],
    posts: [{ p: "economist", text: (p) => `Productivity +${p.pct}%. Growth without inflation — the best possible news for a central banker.` }],
    art: { icons: ["⚙️", "⚡", "🏭", "🚀"], from: "#0e5e5a", to: "#052422" },
  },

  // ------------------------------------------------------------ trade & world
  {
    id: "tariffs", weight: always(1.5), tone: "bad",
    roll: (_e, r) => { const s = r.sev(); return { rate: Math.round((8 + 20 * s) / 5) * 5, goods: Math.round(80 + 300 * s) }; },
    // Impact scales with both how steep and how broad the tariffs are (~1 for 25% on $250B)
    apply: (e, p) => { const w = (p.rate / 25 + p.goods / 250) / 2; e.supplyShock += 0.5 * w; e.demandShock -= 0.35 * w; shockStocks(e, -2 * w); },
    headlines: [(p) => `${p.rate}% tariffs announced on ${money(p.goods)} of imports`, () => "Trade war escalates; trading partners vow retaliation"],
    popup: { headline: (p) => `${p.rate}% tariffs slapped on ${money(p.goods)} of imports`, metric: "cpi", body: () => "Import prices jump while trade and confidence take a hit. Higher inflation AND weaker growth — no easy answer." },
    stats: (p) => [bad("Tariff rate", `${p.rate}%`), bad("Goods hit", money(p.goods))],
    voices: [V("Tom", "Hardware store owner", (p) => `Half my stock is imported. My prices go up ${Math.round(p.rate / 2)}% next month. Nothing I can do.`), V("Macro Mike", "Strategist", "Tariffs: a tax on consumers wearing a trench coat.")],
    posts: [{ p: "business", text: (p) => `Half our inventory is imported. Prices going up ${Math.round(p.rate / 2)}% next month, sorry folks.` }, { p: "farmer", text: "they always retaliate against soybeans. ALWAYS soybeans." }],
    art: { icons: ["🚢", "🧱", "📦", "💲"], from: "#6e4a12", to: "#261806" },
  },
  {
    id: "tradeDeal", weight: always(1), tone: "good",
    roll: (_e, r) => { const s = r.sev(); return { goods: Math.round(100 + 250 * s), s }; },
    apply: (e, p) => { e.supplyShock -= 0.25 * p.s; shockStocks(e, 0.8 + p.s); },
    headlines: [() => "Landmark trade deal slashes tariffs", (p) => `Trade truce: tariffs cut on ${money(p.goods)} of goods`],
    popup: { headline: (p) => `Trade deal cuts tariffs on ${money(p.goods)} of goods`, metric: "cpi", body: () => "Cheaper imports ease goods prices and lift business confidence." },
    stats: (p) => [good("Goods covered", money(p.goods))],
    voices: [V("Tom", "Hardware store owner", "Finally. Cutting prices on imported tools next month."), V("Dale", "Farmer, Iowa", "Soybean exports are back on. I'll believe it when the check clears.")],
    posts: [{ p: "farmer", text: "trade deal signed. soybeans are SO back 🌱" }, { p: "bro", text: "trade deal = green candles 🟩🟩🟩" }],
    art: { icons: ["🤝", "🚢", "📦", "📉"], from: "#145e4a", to: "#05241c" },
  },
  {
    id: "pandemicScare", weight: always(0.6), tone: "bad",
    roll: (_e, r) => { const s = r.sev(); return { countries: Math.round(4 + 22 * s), s }; },
    apply: (e, p) => { e.demandShock -= 0.5 * p.s; e.supplyShock += 0.3 * p.s; shockStocks(e, -(2 + 2 * p.s)); e.financialStress += 0.12 * p.s; },
    headlines: [() => "New virus variant sparks travel bans", (p) => `${p.countries} countries close borders as new variant spreads`],
    popup: { headline: (p) => `New variant: ${p.countries} countries impose travel bans`, metric: "stockIndex", body: () => "Travel freezes, factories slow, and people stay home. Weaker demand AND tangled supply — a familiar nightmare." },
    stats: (p) => [bad("Travel bans", `${p.countries} countries`)],
    voices: [V("Dr. Ana Kowalski", "Economist", "Nobody wants a repeat. Markets are pricing the worst case first."), V("Ngozi", "Food truck owner", "Not again. Please, not again.")],
    posts: [{ p: "regular", text: "bought 48 rolls of toilet paper just in case. don't judge me" }, { p: "doomer", text: "here we go again" }],
    art: { icons: ["🦠", "✈️", "😷", "⛔"], from: "#2e5e3a", to: "#0f2414" },
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

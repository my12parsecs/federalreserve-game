import { useGame } from "../state/store";

/** Scrolling market quote strip, like a trading floor. */
export function TickerTape() {
  const game = useGame((s) => s.game);
  const e = game.econ;
  const now = { stockIndex: e.stockIndex, yield10y: e.yield10y, mortgageRate: e.mortgageRate, policyRate: e.policyRate };
  const prev = { stockIndex: game.prevClose.stock, yield10y: game.prevClose.y10, mortgageRate: game.prevClose.mortgage };
  const r = game.reported;

  const quotes: { sym: string; val: string; chg: number; chgText: string }[] = [
    { sym: "STX 500", val: now.stockIndex.toFixed(1), chg: now.stockIndex - prev.stockIndex, chgText: `${((now.stockIndex / prev.stockIndex - 1) * 100).toFixed(2)}%` },
    { sym: "UST 10Y", val: `${now.yield10y.toFixed(3)}%`, chg: now.yield10y - prev.yield10y, chgText: `${Math.round((now.yield10y - prev.yield10y) * 100)}bp` },
    { sym: "MTG 30Y", val: `${now.mortgageRate.toFixed(2)}%`, chg: now.mortgageRate - prev.mortgageRate, chgText: `${Math.round((now.mortgageRate - prev.mortgageRate) * 100)}bp` },
    { sym: "FED FUNDS", val: `${now.policyRate.toFixed(2)}%`, chg: 0, chgText: "" },
    { sym: "FF FUTURES", val: `${game.marketExpected.toFixed(2)}%`, chg: game.marketExpected - now.policyRate, chgText: `${Math.round((game.marketExpected - now.policyRate) * 100)}bp` },
    { sym: "CORE CPI", val: `${r.cpi.value.toFixed(1)}%`, chg: r.cpi.value - r.cpi.prev, chgText: (r.cpi.value - r.cpi.prev).toFixed(1) },
    { sym: "UNEMP", val: `${r.unemployment.value.toFixed(1)}%`, chg: -(r.unemployment.value - r.unemployment.prev), chgText: (r.unemployment.value - r.unemployment.prev).toFixed(1) },
    { sym: "PAYROLLS", val: `${Math.round(r.payrolls.value)}K`, chg: r.payrolls.value - r.payrolls.consensus, chgText: `est ${Math.round(r.payrolls.consensus)}K` },
    { sym: "CLAIMS", val: `${Math.round(r.claims.value)}K`, chg: -(r.claims.value - r.claims.prev), chgText: `${r.claims.value - r.claims.prev >= 0 ? "+" : ""}${Math.round(r.claims.value - r.claims.prev)}K` },
    { sym: "FED BAL SHEET", val: `$${game.econ.balanceSheet.toFixed(2)}T`, chg: game.econ.qePace, chgText: game.econ.qePace > 0 ? "QE" : game.econ.qePace < 0 ? "QT" : "" },
  ];

  const items = (copy: string) => quotes.map((q) => (
    <span key={q.sym + copy} className="tick">
      <b>{q.sym}</b> <span className="tv">{q.val}</span>
      <span className={`tc ${q.chg > 0 ? "up" : q.chg < 0 ? "down" : "muted"}`}>
        {q.chgText && (q.chg > 0 ? "▲" : q.chg < 0 ? "▼" : "")}
        {q.chgText}
      </span>
    </span>
  ));

  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {items("a")}
        {items("b")}
      </div>
    </div>
  );
}

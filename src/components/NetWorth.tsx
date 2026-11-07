import { CHAIR } from "../sim/config";
import type { GameState } from "../sim/types";
import { holdings } from "../sim/wallet";
import { useGame } from "../state/store";
import { Sparkline } from "./Sparkline";
import { Tip } from "./Tip";

/** $2,981,400 → "$2.981M"; $13,757 → "$13.8K" */
export const money = (x: number) => {
  const a = Math.abs(x);
  const s = x < 0 ? "−" : "";
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(3)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${Math.round(a)}`;
};
const signedMoney = (x: number) => (x >= 0 ? "+" : "") + money(x);

/** The Chair's personal net worth: salary in, bills out, passive investments ride the markets you move. */
export function NetWorth() {
  const game = useGame((s) => s.game);
  const h = holdings(game.wallet, game.econ, game.reported.homePrice.value);
  const hist = game.history;
  // Previous close: the last daily snapshot before today
  const prevClose = hist[hist.length - (game.hour === 0 ? 2 : 1)]?.netWorth ?? h.total;
  const dayChange = h.total - prevClose;
  const payday = game.econ.day - game.wallet.lastPayDay <= 2;

  return (
    <Tip className="stat networth" content={<NetWorthTip game={game} />}>
      <span className="stat-label">Your net worth ⓘ</span>
      <span className="nw-value num">{money(h.total)}</span>
      <span className={`nw-sub num ${payday ? "payday" : dayChange > 0 ? "up" : dayChange < 0 ? "down" : ""}`}>
        {payday ? `💵 Payday ${signedMoney(game.wallet.lastPay)}` : `${dayChange >= 0 ? "▲" : "▼"} ${signedMoney(dayChange)} today`}
      </span>
    </Tip>
  );
}

function NetWorthTip({ game }: { game: GameState }) {
  const w = game.wallet;
  const e = game.econ;
  const h = holdings(w, e, game.reported.homePrice.value);
  const start = game.history.find((s) => s.day >= 0)?.netWorth ?? h.total;
  const sinceStart = h.total - start;
  const spark = game.history.slice(-130).map((s) => s.netWorth);
  spark.push(h.total);
  const rows: [string, number, string][] = [
    ["Index fund (tracks STX 500)", h.stocks, "Moves with the stock market"],
    ["Treasury bond fund", h.bonds, `Loses ~${CHAIR.bondDuration}% per +1pt in 10Y yields`],
    ["Cash (money market)", h.cash, `Earns the Fed funds rate (${e.policyRate.toFixed(2)}%)`],
    ["Home", h.home, "Tracks the home price index"],
    ["Mortgage", -h.mortgage, `${CHAIR.mortgageRate}% fixed — locked in years ago`],
  ];
  return (
    <div className="metric-tip nw-tip">
      <div className="tip-title">Your personal net worth</div>
      <p className="tip-why">
        Fed ethics rules bar you from trading on what you know, so your savings sit in broad funds. But every rate decision still
        moves them — and your own paycheck shrinks in real terms when inflation runs hot.
      </p>
      <Sparkline values={spark} className={`nw-spark ${sinceStart >= 0 ? "up" : "down"}`} />
      <table className="nw-table">
        <tbody>
          {rows.map(([label, v, note]) => (
            <tr key={label} title={note}>
              <td>
                {label}
                <small>{note}</small>
              </td>
              <td className={`num ${v < 0 ? "down" : ""}`}>{money(v)}</td>
            </tr>
          ))}
          <tr className="nw-total">
            <td>Net worth</td>
            <td className="num">{money(h.total)}</td>
          </tr>
        </tbody>
      </table>
      <div className="nw-foot">
        <span>
          Monthly: pay <b className="up">{signedMoney(w.lastPay || (CHAIR.salary / 12) * (1 - CHAIR.taxRate))}</b> · bills{" "}
          <b className="down">{money(-(w.lastBills || CHAIR.livingCosts + CHAIR.mortgagePayment))}</b>
        </span>
        <span>
          Since taking office <b className={sinceStart >= 0 ? "up" : "down"}>{signedMoney(sinceStart)}</b>
        </span>
      </div>
    </div>
  );
}

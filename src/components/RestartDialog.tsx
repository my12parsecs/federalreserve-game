import { useEffect } from "react";
import { holdings } from "../sim/wallet";
import { useGame } from "../state/store";
import { money } from "./NetWorth";
import { Kbd } from "./Shortcuts";

/** "Start over?" confirmation — shows exactly what would be lost. */
export function RestartDialog() {
  const open = useGame((s) => s.confirmRestart);
  const game = useGame((s) => s.game);
  const restart = useGame((s) => s.restart);
  const cancel = useGame((s) => s.cancelRestart);
  if (!open) return null;
  const years = (game.meeting / 8).toFixed(1);
  const nw = holdings(game.wallet, game.econ, game.reported.homePrice.value).total;
  return (
    <div className="overlay news-overlay confirm-overlay" onClick={cancel}>
      <div className="panel confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title">Start a new game?</h2>
        <p>
          Your current tenure will be erased: <b>{game.meeting}</b> meeting{game.meeting === 1 ? "" : "s"} ({years} years), score{" "}
          <b>{game.score.toLocaleString()}</b>, net worth <b>{money(nw)}</b>.
        </p>
        <p className="muted">This can't be undone. You'll start fresh as a newly sworn-in Chair in a new economy.</p>
        <div className="confirm-actions">
          <button className="ghost" onClick={cancel} autoFocus>
            Keep playing <Kbd>Esc</Kbd>
          </button>
          <button className="convene danger" onClick={restart}>
            Start over <Kbd>⏎</Kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Short message at the top (game restored, new game…), auto-hides. */
export function Notice() {
  const notice = useGame((s) => s.notice);
  const clear = useGame((s) => s.clearNotice);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clear, 5000);
    return () => clearTimeout(id);
  }, [notice, clear]);
  if (!notice) return null;
  return (
    <div className="notice" role="status" onClick={clear}>
      {notice}
    </div>
  );
}

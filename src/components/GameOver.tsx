import { holdings } from "../sim/wallet";
import { useGame } from "../state/store";
import { money } from "./NetWorth";

export function GameOver() {
  const { game, restart } = useGame();
  if (game.status !== "over") return null;
  const years = (game.meeting / 8).toFixed(1);
  return (
    <div className="overlay">
      <div className="panel modal">
        <h2>Your tenure is over</h2>
        <p>{game.gameOverReason}</p>
        <p className="muted">
          You lasted {years} years ({game.meeting} meetings) · Score {game.score.toLocaleString()}
        </p>
        <p className="muted">Your net worth on leaving office: <b>{money(holdings(game.wallet, game.econ, game.reported.homePrice.value).total)}</b></p>
        <button className="convene" onClick={restart}>
          Try again <kbd className="kbd">⏎</kbd>
        </button>
        <p className="credit">Federal Reserve Game · created by <a className="credit-link" href="https://my12parsecs.github.io/" target="_blank" rel="noopener noreferrer">Hikaru Imai</a></p>
      </div>
    </div>
  );
}

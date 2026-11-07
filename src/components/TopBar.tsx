import { formatClock, formatDay } from "../sim/calendar";
import { useGame, type Speed } from "../state/store";
import { ThemeMenu } from "./ThemeMenu";
import { NetWorth } from "./NetWorth";
import { METRICS } from "../ui/metrics";
import { Kbd } from "./Shortcuts";
import { MetricTip, StatusBadge, Tip } from "./Tip";

export function TopBar() {
  const { game, speed, paused, pauseOnNews, setSpeed, togglePause, togglePauseOnNews, toggleHelp, askRestart } = useGame();
  const cred = game.econ.credibility;
  const credStatus = METRICS.credibility.assess(game);
  const inMeeting = game.phase === "meeting";
  const daysLeft = game.cycleLength - game.cycleDay;

  return (
    <header className="topbar">
      {/* Stacked lockup: "FEDERAL RESERVE" over "GAME · by Hikaru Imai" */}
      <div className="brand" aria-label="Federal Reserve Game by Hikaru Imai">
        <span className="brand-mark">Federal Reserve</span>
        <span className="brand-sub"><span className="brand-game">Game</span> · by <a className="credit-link" href="https://my12parsecs.github.io/" target="_blank" rel="noopener noreferrer">Hikaru Imai</a></span>
      </div>

      {/* Fixed-size clock: date, time and status each have their own slot so the
          controls beside it never shift as the text changes. */}
      <div className="clock">
        <span className="clock-line">
          <span className="clock-date">{formatDay(game.econ.day)}</span>
          <span className={`clock-time ${game.hour === 0 ? "closed" : ""}`}>{formatClock(game.hour)}</span>
        </span>
        <span className="clock-line clock-status">
          {inMeeting ? (
            <span className="session">● {game.emergency ? "EMERGENCY " : ""}FOMC IN SESSION</span>
          ) : (
            <>
              <span className="countdown">
                Next FOMC in <b className="days">{daysLeft}</b> day{daysLeft === 1 ? "" : "s"}
              </span>
              <span className={`paused-tag ${paused ? "" : "hidden"}`}>PAUSED</span>
            </>
          )}
        </span>
        <span className="countdown-bar">
          <span
            style={{ transform: `scaleX(${inMeeting ? 1 : (game.cycleDay + game.hour / 7) / game.cycleLength})` }}
            className={inMeeting ? "full" : ""}
          />
        </span>
      </div>

      <div className="controls">
        <div className="speed" role="group" aria-label="Game speed">
          <button className={paused ? "on" : ""} onClick={togglePause} disabled={inMeeting} title="Pause / resume (Space)">❚❚</button>
          {([1, 2, 4] as Speed[]).map((s) => (
            <button key={s} className={!paused && speed === s ? "on" : ""} onClick={() => setSpeed(s)} disabled={inMeeting} title={`${s}x speed (${s === 4 ? 3 : s})`}>
              {"▶".repeat(s === 4 ? 3 : s)}
            </button>
          ))}
        </div>
        <div className="controls-row">
          <button className="link-btn" onClick={toggleHelp} title="Keyboard shortcuts (?)">
            <span className="lbl-keys">Keys </span><Kbd>?</Kbd>
          </button>
          <label className="toggle" title="Pause the game when breaking news pops up (P)">
            <input type="checkbox" checked={pauseOnNews} onChange={togglePauseOnNews} />
            <span>Pause on news</span>
          </label>
          <button className="link-btn" onClick={askRestart} title="Start a new game from the beginning (Shift+R)">
            ↺ New game
          </button>
        </div>
      </div>

      <div className="topbar-stats">
        <NetWorth />
        <div className="stat">
          <span className="stat-label">Score</span>
          <span className="stat-value num w-6">{game.score.toLocaleString()}</span>
        </div>
        <Tip className="stat" content={<MetricTip metric="credibility" />}>
          <span className="stat-label">
            Credibility <span className="num w-3">{Math.round(cred * 100)}</span> ⓘ
          </span>
          <span className="cred-row">
            <span className="cred-bar">
              <span className={`cred-fill lvl-${credStatus.level}`} style={{ transform: `scaleX(${cred})` }} />
            </span>
            <StatusBadge level={credStatus.level} label={credStatus.label} />
          </span>
        </Tip>
      </div>

      <ThemeMenu />
    </header>
  );
}

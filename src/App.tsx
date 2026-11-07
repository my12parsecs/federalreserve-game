import { useEffect } from "react";
import { BreakingNews } from "./components/BreakingNews";
import { ChartsGrid } from "./components/ChartsGrid";
import { ControlPanel } from "./components/ControlPanel";
import { GameOver } from "./components/GameOver";
import { ShortcutHelp, useShortcuts } from "./components/Shortcuts";
import { KpiRow } from "./components/KpiRow";
import { NewsFeed } from "./components/NewsFeed";
import { SocialFeed } from "./components/SocialFeed";
import { TickerTape } from "./components/TickerTape";
import { TopBar } from "./components/TopBar";
import { RestartDialog, Notice } from "./components/RestartDialog";
import { startAutosave } from "./state/persistence";
import { TICK_MS, isRunning, useGame } from "./state/store";

/** Autosave to localStorage (throttled; immediate on votes, phase changes and tab close). */
function useAutosave() {
  useEffect(
    () =>
      startAutosave(
        (fn) => useGame.subscribe((s, prev) => fn(s.game, prev.game)),
        () => useGame.getState().game,
        (ok) => useGame.setState({ lastSaved: ok ? Date.now() : null }),
      ),
    [],
  );
}

/** Drives the real-time clock while the inter-meeting cycle is running. */
function useClock() {
  const running = useGame(isRunning);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => useGame.getState().tick(), TICK_MS);
    return () => clearInterval(id);
  }, [running]);
}

export default function App() {
  useClock();
  useShortcuts();
  useAutosave();
  return (
    <div className="app">
      <TickerTape />
      <TopBar />
      <KpiRow />
      <main className="layout">
        <div className="area-main">
          <div className="area-charts">
            <ChartsGrid />
          </div>
          <div className="area-feeds">
            <NewsFeed />
            <SocialFeed />
          </div>
        </div>
        <div className="area-control">
          <ControlPanel />
        </div>
      </main>
      <BreakingNews />
      <GameOver />
      <ShortcutHelp />
      <RestartDialog />
      <Notice />
    </div>
  );
}

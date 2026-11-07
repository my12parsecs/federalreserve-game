import { create } from "zustand";
import { MAX_ARGUMENTS } from "../sim/arguments";
import { advanceHour, dismissAlerts, holdMeeting, newGame, setQePace, takeAction } from "../sim/game";
import type { ActionId, Alert, GameState, QePace } from "../sim/types";
import { clearSave, loadSave } from "./persistence";

/**
 * The clock fires every TICK_MS and advances this many trading hours per fire.
 * Keeping the render rate fixed (~10/s) and batching hours at higher speeds
 * keeps 4x smooth. At 1x a trading day (7 hours) takes ~0.65s.
 */
export const TICK_MS = 95;
export const SPEEDS = { 1: 1, 2: 2, 4: 4 } as const;
export type Speed = keyof typeof SPEEDS;
export type Theme = "terminal" | "boardroom";
export const THEME_NAMES: Record<Theme, string> = { terminal: "Terminal", boardroom: "Boardroom" };

interface Store {
  game: GameState;
  proposal: number;
  args: string[];
  speed: Speed;
  paused: boolean;
  /** Breaking news opens as a pausing modal (true) or a passing toast (false). */
  pauseOnNews: boolean;
  showHelp: boolean;
  theme: Theme;
  setTheme: (t: Theme) => void;
  tick: () => void;
  setProposal: (rate: number) => void;
  toggleArg: (id: string) => void;
  clearArgs: () => void;
  toggleHelp: () => void;
  callVote: () => void;
  act: (id: ActionId) => void;
  setQe: (pace: QePace) => void;
  setSpeed: (s: Speed) => void;
  togglePause: () => void;
  togglePauseOnNews: () => void;
  /** Close one full-size popup */
  dismissAlert: (id: number) => void;
  /** Clear all corner toasts */
  dismissToasts: () => void;
  restart: () => void;
  /** "Start over?" confirmation is open */
  confirmRestart: boolean;
  askRestart: () => void;
  cancelRestart: () => void;
  /** Timestamp of the last successful autosave (null = not saved / storage unavailable) */
  lastSaved: number | null;
  /** Short message shown briefly at the top (e.g. "game restored") */
  notice: string | null;
  clearNotice: () => void;
}

/** Resume the saved game if there is one (paused, so the player can get their bearings). */
function initial() {
  const save = loadSave();
  if (!save) return { ...fresh(), paused: false, notice: null as string | null, lastSaved: null as number | null };
  const g = save.game;
  const mins = Math.max(1, Math.round((Date.now() - save.savedAt) / 60000));
  const ago = mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} d ago`;
  return {
    game: g,
    proposal: g.econ.policyRate,
    args: [] as string[],
    paused: g.phase === "cycle",
    notice: `Welcome back — game restored (saved ${ago}).${g.phase === "cycle" ? " Press Space to resume." : ""}`,
    lastSaved: save.savedAt,
  };
}

const fresh = () => {
  const game = newGame();
  return { game, proposal: game.econ.policyRate, args: [] as string[] };
};

/** The theme is also applied by an inline script in index.html before first paint. */
function loadTheme(): Theme {
  try {
    return localStorage.getItem("frb.theme") === "boardroom" ? "boardroom" : "terminal";
  } catch {
    return "terminal";
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  // Browser chrome (mobile address bar, tab strip) matches the theme background
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "boardroom" ? "#e7dcbf" : "#000000");
  try {
    localStorage.setItem("frb.theme", theme);
  } catch {
    /* storage unavailable: theme lasts for this session only */
  }
}

/** "Pause on news" is off unless the player turned it on. */
function loadPref(): boolean {
  try {
    return localStorage.getItem("frb.pauseOnNews") === "true";
  } catch {
    return false;
  }
}

/**
 * Moments the player triggered (the opening briefing, FOMC decisions) always open
 * full-size — they carry the goals and the vote roll call. "Pause on news" only
 * governs true breaking news (world events, data surprises, market moves).
 */
export const alwaysModal = (a: Alert) => a.kind === "intro" || a.kind === "fomc";

/** The full-size popup that should be open now (it also holds the clock). */
export const modalAlert = (s: Pick<Store, "game" | "pauseOnNews">): Alert | undefined =>
  s.game.status === "playing" ? s.game.alerts.find((a) => s.pauseOnNews || alwaysModal(a)) : undefined;

/** The corner toast to show (only when no full-size popup is up). */
export const toastAlert = (s: Pick<Store, "game" | "pauseOnNews">): Alert | undefined => {
  if (s.pauseOnNews || s.game.status !== "playing" || modalAlert(s)) return undefined;
  for (let i = s.game.alerts.length - 1; i >= 0; i--) if (!alwaysModal(s.game.alerts[i])) return s.game.alerts[i];
  return undefined;
};

/** Whether the clock should be ticking right now. */
export const isRunning = (
  s: Pick<Store, "game" | "paused" | "pauseOnNews"> & { showHelp?: boolean; confirmRestart?: boolean },
) =>
  !s.showHelp &&
  !s.confirmRestart &&
  s.game.phase === "cycle" &&
  s.game.status === "playing" &&
  !s.paused &&
  !modalAlert(s);

export const useGame = create<Store>((set, get) => {
  /** Replace the game; when a meeting opens, reset the proposal form. */
  const commit = (next: GameState) => {
    const prev = get().game;
    if (next.phase === "meeting" && prev.phase !== "meeting") {
      set({ game: next, proposal: next.econ.policyRate, args: [] });
    } else {
      set({ game: next });
    }
  };

  return {
    ...initial(),
    speed: 1,
    pauseOnNews: loadPref(),
    showHelp: false,
    theme: loadTheme(),
    setTheme: (theme) => {
      applyTheme(theme);
      set({ theme });
    },
    tick: () => {
      const { speed, pauseOnNews } = get();
      let g = get().game;
      for (let i = 0; i < SPEEDS[speed]; i++) {
        const next = advanceHour(g);
        if (next === g) break;
        g = next;
        // Stop batching as soon as something needs the player's attention
        if (!isRunning({ game: g, paused: false, pauseOnNews })) break;
      }
      commit(g);
    },
    setProposal: (rate) => set({ proposal: Math.max(0, Math.round(rate * 4) / 4) }),
    toggleArg: (id) => {
      const args = get().args;
      if (args.includes(id)) set({ args: args.filter((a) => a !== id) });
      else if (args.length < MAX_ARGUMENTS) set({ args: [...args, id] });
    },
    clearArgs: () => set({ args: [] }),
    toggleHelp: () => set({ showHelp: !get().showHelp }),
    callVote: () => {
      const { game, proposal, args } = get();
      set({ game: holdMeeting(game, proposal, args), args: [] });
    },
    act: (id) => commit(takeAction(get().game, id)),
    setQe: (pace) => commit(setQePace(get().game, pace)),
    setSpeed: (speed) => set({ speed, paused: false }),
    togglePause: () => set({ paused: !get().paused }),
    togglePauseOnNews: () => {
      const pauseOnNews = !get().pauseOnNews;
      try {
        localStorage.setItem("frb.pauseOnNews", String(pauseOnNews));
      } catch {
        /* storage unavailable: preference lasts for this session only */
      }
      set({ pauseOnNews });
    },
    dismissAlert: (id) => set({ game: dismissAlerts(get().game, (a) => a.id === id) }),
    // Only the newest toast is shown, so dismissing clears the backlog
    dismissToasts: () => set({ game: dismissAlerts(get().game, (a) => !alwaysModal(a)) }),
    // Wipes the save too: the autosave then writes the new game right away
    restart: () => {
      clearSave();
      set({ ...fresh(), paused: false, confirmRestart: false, showHelp: false, notice: "New game started. Good luck, Chair." });
    },
    confirmRestart: false,
    askRestart: () => set({ confirmRestart: true }),
    cancelRestart: () => set({ confirmRestart: false }),
    clearNotice: () => set({ notice: null }),
  };
});

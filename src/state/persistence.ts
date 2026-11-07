import type { GameState } from "../sim/types";

/**
 * Save / resume via localStorage.
 *
 * - The whole game state is plain JSON (the sim keeps no Maps, Sets or Infinity),
 *   and it includes the RNG state, so a resumed game continues exactly as it would have.
 * - Saves are throttled (a few seconds apart) because the clock ticks ~10×/s, but
 *   important moments (votes, phase changes, game over) and closing the tab save at once.
 * - Bump SAVE_VERSION whenever GameState changes shape; old saves are then ignored.
 */
const SAVE_KEY = "frb.save";
export const SAVE_VERSION = 1;
const THROTTLE_MS = 4000;

/** Only what the UI needs is kept, to keep saves small and fast to write. */
const KEEP = { history: 800, news: 50, posts: 60 };

interface SaveFile {
  version: number;
  savedAt: number;
  game: GameState;
}

function trim(g: GameState): GameState {
  return {
    ...g,
    history: g.history.slice(-KEEP.history),
    news: g.news.slice(0, KEEP.news),
    posts: g.posts.slice(0, KEEP.posts),
  };
}

/** A save is used only if it looks like a complete game from this version. */
function isValid(g: unknown): g is GameState {
  const x = g as GameState;
  return (
    !!x &&
    typeof x.seed === "number" &&
    typeof x.rngState === "number" &&
    !!x.econ && typeof x.econ.day === "number" &&
    !!x.wallet && !!x.reported &&
    Array.isArray(x.history) && x.history.length >= 200 && // a new game starts with ~260 days
    Array.isArray(x.members) && x.members.length > 0 &&
    (x.phase === "cycle" || x.phase === "meeting")
  );
}

/** Game → save-file text. Pure, so it can be tested without a browser. */
export function encodeSave(game: GameState, savedAt = Date.now()): string {
  const file: SaveFile = { version: SAVE_VERSION, savedAt, game: trim(game) };
  return JSON.stringify(file);
}

/** Save-file text → game, or null if it's missing, corrupt or from another version. */
export function decodeSave(raw: string | null): { game: GameState; savedAt: number } | null {
  if (!raw) return null;
  try {
    const file = JSON.parse(raw) as SaveFile;
    if (file.version !== SAVE_VERSION || !isValid(file.game)) return null;
    return { game: file.game, savedAt: file.savedAt };
  } catch {
    return null; // corrupt: start fresh
  }
}

export function loadSave(): { game: GameState; savedAt: number } | null {
  try {
    return decodeSave(localStorage.getItem(SAVE_KEY));
  } catch {
    return null; // storage blocked
  }
}

export function writeSave(game: GameState): boolean {
  try {
    localStorage.setItem(SAVE_KEY, encodeSave(game));
    return true;
  } catch {
    return false; // storage full or blocked: the game keeps running, just unsaved
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Keep the save in sync with a game store. `get` returns the current game.
 * `onSaved` lets the UI show a "Saved" indicator.
 */
export function startAutosave(
  subscribe: (fn: (game: GameState, prev: GameState) => void) => () => void,
  get: () => GameState,
  onSaved: (ok: boolean) => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    onSaved(writeSave(get()));
  };
  const unsub = subscribe((game, prev) => {
    if (game === prev) return;
    // Milestones save immediately; everything else is throttled
    const important =
      game.phase !== prev.phase || game.meeting !== prev.meeting || game.status !== prev.status || game.seed !== prev.seed;
    if (important) flush();
    else if (!timer) timer = setTimeout(flush, THROTTLE_MS);
  });
  const onHide = () => document.visibilityState === "hidden" && flush();
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", onHide);
  return () => {
    unsub();
    if (timer) clearTimeout(timer);
    window.removeEventListener("pagehide", flush);
    document.removeEventListener("visibilitychange", onHide);
  };
}

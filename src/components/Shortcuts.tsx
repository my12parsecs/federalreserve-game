import { useEffect } from "react";
import { ARGUMENTS } from "../sim/arguments";
import { modalAlert, useGame } from "../state/store";

/**
 * All keyboard shortcuts in one place. Priority:
 *   breaking-news modal (handled by BreakingNews) → help overlay → game over → meeting → cycle.
 * Shortcuts never fire with Ctrl/Cmd/Alt held (browser shortcuts stay intact) or while typing.
 */

/** Hawkish arguments on 1–5, dovish on 6–0. */
const ARG_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const ORDERED_ARGS = [...ARGUMENTS.filter((a) => a.stance > 0), ...ARGUMENTS.filter((a) => a.stance < 0)];
export const argKey = (id: string) => ARG_KEYS[ORDERED_ARGS.findIndex((a) => a.id === id)] ?? "";

export function Kbd({ children }: { children: string }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "checkbox")) return;
      // Let links and the theme menu handle their own Enter/Space
      if ((e.key === "Enter" || e.key === " ") && t.closest("a, .theme-menu")) return;

      const s = useGame.getState();
      const g = s.game;
      // A mouse-clicked button keeps focus; Space/Enter would also "click" it natively.
      // Drop focus first so each key press does exactly one thing.
      const handled = () => {
        e.preventDefault();
        if ((e.key === " " || e.key === "Enter") && t.tagName === "BUTTON") t.blur();
      };

      // A full-size news popup owns the keyboard (see BreakingNews)
      if (modalAlert(s)) return;

      // The "start over?" dialog owns Enter / Esc while open
      if (s.confirmRestart) {
        if (e.key === "Enter") handled(), s.restart();
        else if (e.key === "Escape") handled(), s.cancelRestart();
        return;
      }
      if (e.key === "?") return handled(), s.toggleHelp();
      if (s.showHelp) {
        if (e.key === "Escape" || e.key === "Enter") handled(), s.toggleHelp();
        return;
      }
      if (g.status === "over") {
        if (e.key === "Enter") handled(), s.restart();
        return;
      }
      if (e.key === "p" || e.key === "P") return handled(), s.togglePauseOnNews();
      // Shift+R: start over (asks for confirmation first)
      if (e.key === "R" && e.shiftKey) return handled(), s.askRestart();

      if (g.phase === "meeting") {
        switch (e.key) {
          case "Enter": return handled(), s.callVote();
          case "ArrowUp": case "ArrowRight": case "+": case "=":
            return handled(), s.setProposal(s.proposal + 0.25);
          case "ArrowDown": case "ArrowLeft": case "-": case "_":
            return handled(), s.setProposal(s.proposal - 0.25);
          case "c": case "C": case "Backspace":
            return handled(), s.clearArgs();
        }
        const i = ARG_KEYS.indexOf(e.key);
        if (i >= 0 && ORDERED_ARGS[i]) return handled(), s.toggleArg(ORDERED_ARGS[i].id);
        return;
      }

      // Between meetings
      switch (e.key) {
        case " ": return handled(), s.togglePause();
        case "1": return handled(), s.setSpeed(1);
        case "2": return handled(), s.setSpeed(2);
        case "3": return handled(), s.setSpeed(4);
        case "h": case "H": return handled(), s.act("hawkishSpeech");
        case "d": case "D": return handled(), s.act("dovishSpeech");
        case "l": case "L": return handled(), s.act("lendingFacility");
        // Emergency meeting costs credibility, so it needs Shift
        case "E": return e.shiftKey ? (handled(), s.act("emergencyMeeting")) : undefined;
        case "q": case "Q": return handled(), s.setQe(1);
        case "n": case "N": return handled(), s.setQe(0);
        case "t": case "T": return handled(), s.setQe(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: "FOMC meeting",
    keys: [
      ["↑ / ↓", "Raise / lower your proposal 25bp"],
      ["1 – 5", "Toggle hawkish arguments"],
      ["6 – 0", "Toggle dovish arguments"],
      ["C", "Clear arguments"],
      ["Enter", "Call the vote"],
    ],
  },
  {
    title: "Between meetings",
    keys: [
      ["Space", "Pause / resume"],
      ["1 / 2 / 3", "Speed 1x / 2x / 4x"],
      ["H / D", "Hawkish / dovish speech"],
      ["Q / N / T", "Balance sheet: QE / hold / QT"],
      ["L", "Bank lending facility"],
      ["Shift + E", "Emergency meeting"],
    ],
  },
  {
    title: "Anytime",
    keys: [
      ["Enter / Esc", "Continue past breaking news"],
      ["P", "Toggle pause on news"],
      ["Shift + R", "Start a new game (asks first)"],
      ["?", "Show / hide this list"],
    ],
  },
];

export function ShortcutHelp() {
  const show = useGame((s) => s.showHelp);
  const toggle = useGame((s) => s.toggleHelp);
  if (!show) return null;
  return (
    <div className="overlay news-overlay" onClick={toggle}>
      <div className="panel help" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h3>Keyboard shortcuts</h3>
          <button className="help-close" onClick={toggle} aria-label="Close">✕</button>
        </div>
        <div className="help-grid">
          {GROUPS.map((grp) => (
            <section key={grp.title}>
              <h4>{grp.title}</h4>
              <dl>
                {grp.keys.map(([k, d]) => (
                  <div key={k} className="help-row">
                    <dt>{k.split(" / ").map((x, i) => <span key={i}>{i > 0 && " / "}<Kbd>{x}</Kbd></span>)}</dt>
                    <dd>{d}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="credit">Federal Reserve Game · created by <a className="credit-link" href="https://my12parsecs.github.io/" target="_blank" rel="noopener noreferrer">Hikaru Imai</a></p>
      </div>
    </div>
  );
}

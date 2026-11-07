import { useEffect, useRef, useState } from "react";
import { THEME_NAMES, useGame, type Theme } from "../state/store";

const THEMES: { id: Theme; blurb: string }[] = [
  { id: "terminal", blurb: "Black & amber trading screen" },
  { id: "boardroom", blurb: "Parchment, ink & serif" },
];

/** Tiny autosave indicator: briefly highlights each time the game is written to storage. */
function SaveStatus() {
  const lastSaved = useGame((s) => s.lastSaved);
  const when = lastSaved ? new Date(lastSaved).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  return (
    <span
      key={lastSaved ?? 0}
      className={`save-status ${lastSaved ? "ok" : "off"}`}
      title={lastSaved ? `Autosaved in this browser at ${when}` : "Not saved yet (or browser storage is blocked)"}
    >
      {lastSaved ? "✓ saved" : "not saved"}
    </span>
  );
}

/** Theme picker: a small dropdown with a swatch preview of each theme. */
export function ThemeMenu() {
  const theme = useGame((s) => s.theme);
  const setTheme = useGame((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    items.current[Math.max(0, THEMES.findIndex((t) => t.id === theme))]?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, theme]);

  const onListKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      items.current[(i + (e.key === "ArrowDown" ? 1 : THEMES.length - 1)) % THEMES.length]?.focus();
    }
  };

  return (
    <div className="theme-menu" ref={root}>
      <span className="stat-label theme-label">
        Theme
        <SaveStatus />
      </span>
      <button
        className="theme-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title="Change visual theme"
      >
        <i className={`swatch swatch-${theme}`} />
        <span>{THEME_NAMES[theme]}</span>
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="theme-list" role="listbox" aria-label="Theme">
          {THEMES.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => (items.current[i] = el)}
              role="option"
              aria-selected={t.id === theme}
              className={`theme-option ${t.id === theme ? "on" : ""}`}
              onClick={() => {
                setTheme(t.id);
                setOpen(false);
              }}
              onKeyDown={(e) => onListKey(e, i)}
            >
              <i className={`swatch swatch-${t.id}`} />
              <span>
                <b>{THEME_NAMES[t.id]}</b>
                <small>{t.blurb}</small>
              </span>
              {t.id === theme && <span className="check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

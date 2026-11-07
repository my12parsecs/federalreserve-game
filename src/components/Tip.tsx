import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useGame } from "../state/store";
import { METRICS, type MetricKey } from "../ui/metrics";

/**
 * Hover/focus tooltip rendered in a portal, so scrolling panels never clip it.
 */
export function Tip({ content, children, className = "" }: { content: ReactNode; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean } | null>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const above = r.bottom + 260 > window.innerHeight && r.top > 260;
    const half = Math.min(150, window.innerWidth / 2 - 8);
    setPos({
      x: Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8),
      y: above ? r.top - 8 : r.bottom + 8,
      above,
    });
  };

  return (
    <div
      ref={ref}
      className={`tip-anchor ${className}`}
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      onFocus={show}
      onBlur={() => setPos(null)}
    >
      {children}
      {pos &&
        createPortal(
          <div
            className="tip"
            role="tooltip"
            style={{ left: pos.x, top: pos.y, transform: `translate(-50%, ${pos.above ? "-100%" : "0"})` }}
          >
            {content}
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Standard tooltip body for a metric: what it is, why it matters, current rating, scale.
 * Reads game state itself, so it only costs anything while a tooltip is open.
 */
export function MetricTip({ metric }: { metric: MetricKey }) {
  const game = useGame((s) => s.game);
  const m = METRICS[metric];
  const a = m.assess(game);
  return (
    <div className="metric-tip">
      <div className="tip-title">{m.title}</div>
      <p>{m.what}</p>
      <p className="tip-why">{m.why}</p>
      <div className={`tip-now lvl-${a.level}`}>
        <StatusBadge level={a.level} label={a.label} /> {a.note}
      </div>
      <ul className="tip-scale">
        {m.scale.map((s) => (
          <li key={s.text}>
            <i className={`dot lvl-${s.level}`} /> {s.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatusBadge({ level, label }: { level: string; label: string }) {
  const icon = level === "bad" ? "▲" : level === "watch" ? "●" : level === "ok" ? "✓" : "◆";
  return (
    <span className={`badge lvl-${level}`}>
      {icon} {label}
    </span>
  );
}

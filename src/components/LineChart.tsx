import { useEffect, useMemo, useRef, useState } from "react";
import { formatMonth, formatPoint, formatShortDay } from "../sim/calendar";
import type { Snapshot } from "../sim/types";

/**
 * Lightweight SVG line chart: one <path> per series, so it re-renders cheaply
 * on every hourly tick. Hover shows a crosshair with values.
 */
export interface Series {
  key: keyof Snapshot;
  name: string;
  color: string;
  dashed?: boolean;
  /** Released data steps; market data is continuous. */
  step?: boolean;
}

const PAD = { l: 44, r: 10, t: 6, b: 18 };

function niceStep(span: number, target = 4): number {
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

export function LineChart({
  data,
  series,
  format,
  reference,
  height = 140,
  shortRange,
}: {
  data: Snapshot[];
  series: Series[];
  format: (v: number) => string;
  reference?: number;
  height?: number;
  /** Label x-axis by day instead of month */
  shortRange?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(120, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    if (data.length < 2) return null;
    const x0 = data[0].day;
    const x1 = data[data.length - 1].day;
    let lo = Infinity;
    let hi = -Infinity;
    for (const d of data)
      for (const s of series) {
        const v = d[s.key] as number;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    if (reference !== undefined) {
      lo = Math.min(lo, reference);
      hi = Math.max(hi, reference);
    }
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.02 || 1;
    lo -= pad;
    hi += pad;
    const w = width - PAD.l - PAD.r;
    const h = height - PAD.t - PAD.b;
    const sx = (t: number) => PAD.l + ((t - x0) / (x1 - x0 || 1)) * w;
    const sy = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * h;

    const paths = series.map((s) => {
      let d = "";
      let prevY = 0;
      data.forEach((p, i) => {
        const x = sx(p.day).toFixed(1);
        const y = sy(p[s.key] as number);
        if (i === 0) d += `M${x},${y.toFixed(1)}`;
        else if (s.step) d += `H${x}V${y.toFixed(1)}`;
        else d += `L${x},${y.toFixed(1)}`;
        prevY = y;
      });
      return { s, d, lastY: prevY };
    });

    const step = niceStep(hi - lo);
    const yTicks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yTicks.push(v);

    // ~4 evenly spaced x labels
    const xTicks: { x: number; label: string }[] = [];
    const n = Math.max(2, Math.min(5, Math.floor(w / 90)));
    for (let i = 0; i < n; i++) {
      const t = x0 + ((x1 - x0) * (i + 0.5)) / n;
      xTicks.push({ x: sx(t), label: shortRange ? formatShortDay(Math.ceil(t)) : formatMonth(Math.ceil(t)) });
    }
    return { sx, sy, paths, yTicks, xTicks, lastX: sx(x1) };
  }, [data, series, width, height, reference, shortRange]);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!geo) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    // binary search nearest point by x
    let a = 0;
    let b = data.length - 1;
    while (b - a > 1) {
      const m = (a + b) >> 1;
      if (geo.sx(data[m].day) < x) a = m;
      else b = m;
    }
    setHover(Math.abs(geo.sx(data[a].day) - x) < Math.abs(geo.sx(data[b].day) - x) ? a : b);
  };

  const hp = hover !== null ? data[hover] : null;

  return (
    <div ref={wrap} className="lc" style={{ height }}>
      {geo && (
        <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {geo.yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={width - PAD.r} y1={geo.sy(v)} y2={geo.sy(v)} className="lc-grid" />
              <text x={PAD.l - 6} y={geo.sy(v) + 3} className="lc-label" textAnchor="end">
                {format(v).replace(/\.0+(%|K)?$/, "$1")}
              </text>
            </g>
          ))}
          {geo.xTicks.map((t, i) => (
            <text key={i} x={t.x} y={height - 4} className="lc-label" textAnchor="middle">
              {t.label}
            </text>
          ))}
          {reference !== undefined && (
            <line x1={PAD.l} x2={width - PAD.r} y1={geo.sy(reference)} y2={geo.sy(reference)} className="lc-ref" />
          )}
          {geo.paths.map(({ s, d }) => (
            <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth={1.6} strokeDasharray={s.dashed ? "5 3" : undefined} strokeLinejoin="round" />
          ))}
          <circle cx={geo.lastX} cy={geo.paths[0].lastY} r={2.5} fill={series[0].color} />
          {hp && (
            <g>
              <line x1={geo.sx(hp.day)} x2={geo.sx(hp.day)} y1={PAD.t} y2={height - PAD.b} className="lc-cross" />
              {series.map((s) => (
                <circle key={s.key} cx={geo.sx(hp.day)} cy={geo.sy(hp[s.key] as number)} r={3} fill={s.color} />
              ))}
            </g>
          )}
        </svg>
      )}
      {/* Pulsing "live" halo as an HTML layer: animating opacity here is composited,
          whereas animating inside the SVG would repaint the whole chart every frame. */}
      {geo && <span className="lc-now" style={{ transform: `translate(${geo.lastX - 5}px, ${geo.paths[0].lastY - 5}px)`, color: series[0].color }} />}
      {hp && geo && (
        <div className="lc-tip" style={{ left: Math.min(geo.sx(hp.day) + 10, width - 170), top: 4 }}>
          <div className="lc-tip-date">{formatPoint(hp.day)}</div>
          {series.map((s) => (
            <div key={s.key}>
              <i style={{ background: s.color }} /> {s.name}: <b>{format(hp[s.key] as number)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

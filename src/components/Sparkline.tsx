/** Tiny inline SVG line chart (no axes). Cheap enough to re-render every tick. */
export function Sparkline({
  values,
  className = "",
  stroke = "currentColor",
  fill = true,
  reference,
}: {
  values: number[];
  className?: string;
  stroke?: string;
  fill?: boolean;
  reference?: number;
}) {
  if (values.length < 2) return null;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (reference !== undefined) {
    min = Math.min(min, reference);
    max = Math.max(max, reference);
  }
  const span = max - min || 1;
  const y = (v: number) => 36 - ((v - min) / span) * 32;
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * 100).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  return (
    <svg className={`spark ${className}`} viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      {fill && <path d={`${d} L100,40 L0,40 Z`} fill={stroke} opacity={0.12} />}
      {reference !== undefined && (
        <line x1="0" x2="100" y1={y(reference)} y2={y(reference)} stroke={stroke} strokeOpacity={0.45} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      )}
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

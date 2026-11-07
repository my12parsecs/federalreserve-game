import { EVENT_BY_ID } from "../sim/content/events";
import type { Snapshot } from "../sim/types";
import { Sparkline } from "./Sparkline";

/**
 * "News photo" illustrations: a themed gradient scene with big emoji art,
 * a TV-news overlay, and a sparkline of the relevant data series.
 * Kept cheap to paint: no filters on animated layers, transform-only motion.
 */
interface Scene {
  icons: string[]; // first = hero, rest = supporting
  from: string;
  to: string;
}

const SCENES: Record<string, Scene> = {
  intro: { icons: ["🏛️", "🇺🇸", "📜", "🖋️"], from: "#1d3b6e", to: "#0d1a33" },
  cpiHot: { icons: ["🛒", "🔥", "🥚", "🧾"], from: "#7a1e1e", to: "#2b0808" },
  cpiCool: { icons: ["🧊", "🛒", "🏷️", "😌"], from: "#14507a", to: "#061d2e" },
  jobsStrong: { icons: ["👷‍♀️", "💼", "🤝", "📈"], from: "#1d5e3a", to: "#082414" },
  jobsWeak: { icons: ["📦", "🚪", "💼", "📉"], from: "#4a3a5e", to: "#191320" },
  recession: { icons: ["📉", "🏭", "🌧️", "🧾"], from: "#3a3f4a", to: "#111317" },
  bearMarket: { icons: ["🐻", "📉", "😱", "🔻"], from: "#6e1414", to: "#240505" },
  recordHigh: { icons: ["🐂", "📈", "🎉", "🍾"], from: "#145e2e", to: "#05240f" },
  mortgage: { icons: ["🏠", "💸", "🔑", "📈"], from: "#6e4a12", to: "#261806" },
  yield5: { icons: ["📜", "📈", "🏦", "💰"], from: "#3b2a6e", to: "#130c26" },
  hike: { icons: ["🏛️", "⬆️", "🔨", "📈"], from: "#6e1e1e", to: "#200808" },
  cut: { icons: ["🏛️", "⬇️", "✂️", "📉"], from: "#14507a", to: "#061d2e" },
  hold: { icons: ["🏛️", "⏸️", "⚖️", "☕"], from: "#2e3a4a", to: "#0f141b" },
  failed: { icons: ["🏛️", "💥", "🙅", "🗳️"], from: "#5e3a0e", to: "#201305" },
};

export function EventArt({ art, metric, history }: { art: string; metric?: keyof Snapshot; history: Snapshot[] }) {
  // Data/FOMC scenes live here; world-event scenes live with the event (content/events.ts)
  const scene = SCENES[art] ?? EVENT_BY_ID[art]?.art ?? SCENES.hold;
  const [hero, ...rest] = scene.icons;
  return (
    <div className="art" style={{ background: `radial-gradient(circle at 30% 30%, ${scene.from}, ${scene.to})` }}>
      <div className="art-scan" />
      {rest.map((ic, i) => (
        <span key={i} className={`art-small s${i}`}>{ic}</span>
      ))}
      <span className="art-hero">{hero}</span>
      {metric && <Sparkline values={history.slice(-90).map((s) => s[metric] as number)} className="art-spark" stroke="#fff" />}
      <div className="art-bug">
        <span className="art-logo">FED NEWS 24</span>
        <span className="art-live">● LIVE</span>
      </div>
    </div>
  );
}

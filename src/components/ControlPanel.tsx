import { ARGUMENTS, MAX_ARGUMENTS } from "../sim/arguments";
import { MAJORITY } from "../sim/fomc";
import { actionAvailability, isCrisis } from "../sim/game";
import type { ActionId, GameState, QePace } from "../sim/types";
import { useGame } from "../state/store";
import { MetricTip, StatusBadge, Tip } from "./Tip";
import { METRICS } from "../ui/metrics";
import { Kbd, argKey } from "./Shortcuts";

export function ControlPanel() {
  const phase = useGame((s) => s.game.phase);
  return phase === "meeting" ? <MeetingPanel /> : <CyclePanel />;
}

/** Which data each argument leans on (shown in its tooltip). */
const ARG_BASIS: Record<string, string> = {
  hotInflation: "Core CPI level and its 3-month trend",
  tightLabor: "Unemployment vs. ~4.2% natural rate, payroll gains",
  expectations: "Inflation expectations vs. 2%",
  froth: "STX 500 1-year return",
  strongGrowth: "GDP growth vs. ~2% trend",
  coolingInflation: "Core CPI level and its 3-month trend",
  jobLosses: "Unemployment rate, jobless claims",
  slowdown: "GDP growth",
  financial: "Bank stress, stock drawdown, mortgage rates",
  housing: "Home prices vs. a year ago",
};

// ---------------------------------------------------------------- FOMC meeting

function MeetingPanel() {
  const { game, proposal, args, setProposal, toggleArg, callVote } = useGame();
  const { econ, members } = game;
  const move = proposal - econ.policyRate;
  // Positions are private: all you get is public information — leanings,
  // how they voted last time, and what they've said on the wire lately.
  const last = game.meetings[game.meetings.length - 1];
  const lastRemark = (name: string) => game.news.find((n) => n.headline.startsWith(`${name} (`))?.headline.split(": ").slice(1).join(": ");

  return (
    <section className="panel policy in-session">
      <div className="panel-head">
        <h3>{game.emergency ? "Emergency " : ""}FOMC Meeting{game.emergency ? "" : ` #${game.meeting + 1}`}</h3>
        <Tip content={<MetricTip metric="marketPricing" />}>
          <span className="muted">Markets price {game.marketExpected.toFixed(2)}% ⓘ</span>
        </Tip>
      </div>

      <div className="panel-scroll">
        <div className="proposal">
          <button onClick={() => setProposal(proposal - 0.25)} aria-label="Lower proposal (Down arrow)" title="Lower 25bp (↓)">
            −<Kbd>↓</Kbd>
          </button>
          <div className="proposal-value">
            <div className="big">{proposal.toFixed(2)}%</div>
            <div className={`muted ${move > 0 ? "up" : move < 0 ? "down" : ""}`}>
              {move === 0 ? "Hold" : `${move > 0 ? "Hike" : "Cut"} ${Math.abs(move * 100).toFixed(0)}bp`}
            </div>
          </div>
          <button onClick={() => setProposal(proposal + 0.25)} aria-label="Raise proposal (Up arrow)" title="Raise 25bp (↑)">
            +<Kbd>↑</Kbd>
          </button>
        </div>

        <div className="args">
          <div className="args-head">
            <span>Make your case</span>
            <span className="muted">{args.length}/{MAX_ARGUMENTS} · weak arguments backfire</span>
          </div>
          {([1, -1] as const).map((stance) => (
            <div key={stance} className="args-group">
              <span className={`args-label ${stance > 0 ? "hawk" : "dove"}`}>{stance > 0 ? "Hawkish ↑" : "Dovish ↓"}</span>
              <div className="chips">
                {ARGUMENTS.filter((a) => a.stance === stance).map((a) => {
                  const on = args.includes(a.id);
                  return (
                    <Tip key={a.id} className="chip-tip" content={<div className="metric-tip"><div className="tip-title">"{a.label}"</div><p>Persuades members to move {stance > 0 ? "up" : "down"} toward your proposal — if the data backs it up.</p><p className="tip-why">Rests on: {ARG_BASIS[a.id]}</p></div>}>
                      <button
                        className={`chip ${on ? "on" : ""} ${stance > 0 ? "hawk" : "dove"}`}
                        onClick={() => toggleArg(a.id)}
                        disabled={!on && args.length >= MAX_ARGUMENTS}
                      >
                        <Kbd>{argKey(a.id)}</Kbd> {a.label}
                      </button>
                    </Tip>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <ul className="members">
          {members.map((m) => {
            const lean = m.hawkishness > 0.3 ? "hawk" : m.hawkishness < -0.3 ? "dove" : "center";
            const leanText = lean === "hawk" ? "Hawk — worries most about inflation" : lean === "dove" ? "Dove — worries most about jobs" : "Centrist — follows the data";
            const dissented = last?.votes.find((v) => v.memberId === m.id)?.yes === false;
            const remark = m.role === "Chair" ? undefined : lastRemark(m.name);
            return (
              <li key={m.id} className={`lean-${lean}`}>
              <Tip
                className="member-row"
                content={
                  <div className="metric-tip">
                    <div className="tip-title">{m.role === "Chair" ? "You (Chair)" : m.name}</div>
                    <p className="tip-why">{m.district ? `${m.district} Fed President` : m.role}</p>
                    <p>{leanText}</p>
                    {remark ? <p>Recently said: <i>{remark}</i></p> : m.role !== "Chair" && <p className="tip-why">No recent public remarks. Watch the wire for Fed-speak.</p>}
                    {dissented && <p className="bad-text">Voted against your last proposal.</p>}
                  </div>
                }
              >
                <span className={`lean ${lean}`} />
                <span className="m-name">{m.role === "Chair" ? "You (Chair)" : m.name}</span>
                <span className="m-pref">
                  {m.role === "Chair" ? "proposes" : m.district ?? "Governor"}
                  {dissented && <span className="m-dissent"> · dissented</span>}
                </span>
              </Tip>
              </li>
            );
          })}
        </ul>
        <div className="legend-lean muted">
          <span><i className="lean hawk" /> hawk</span>
          <span><i className="lean center" /> centrist</span>
          <span><i className="lean dove" /> dove</span>
        </div>
      </div>

      <div className="panel-footer">
        <div className="whip">
          <span>🔒 Votes are private until you call it</span>
          <span className="muted">needs {MAJORITY} of {members.length}</span>
        </div>
        <button className="convene" onClick={callVote}>
          Call the Vote <Kbd>⏎</Kbd>
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- between meetings

const ACTIONS: { id: ActionId; label: string; key: string; desc: (g: GameState) => string }[] = [
  { id: "hawkishSpeech", label: "🎤 Hawkish speech", key: "H", desc: () => "Signal more hikes. Yields up, stocks down, expectations anchored." },
  { id: "dovishSpeech", label: "🎤 Dovish speech", key: "D", desc: () => "Signal easing. Stocks up, yields down." },
  {
    id: "emergencyMeeting",
    label: "🚨 Emergency meeting",
    key: "⇧E",
    desc: (g) => (isCrisis(g) ? "Move rates now. In a crisis, markets will understand." : "Move rates now. ⚠ No crisis: looks like panic (credibility −)."),
  },
  { id: "lendingFacility", label: "🏦 Bank lending facility", key: "L", desc: () => "Calm a banking panic. Small credibility cost (moral hazard)." },
];

function CyclePanel() {
  const { game, act, setQe } = useGame();
  const e = game.econ;
  const implied = game.marketExpected - e.policyRate;
  const last = game.meetings[game.meetings.length - 1];
  const pricing = METRICS.marketPricing.assess(game);

  return (
    <section className="panel policy">
      <div className="panel-head">
        <h3>Between Meetings</h3>
        <span className="muted">
          <span className="num w-2">{game.cycleLength - game.cycleDay}</span> days to FOMC #{game.meeting + 1}
        </span>
      </div>

      <div className="panel-scroll">
        <Tip className="pricing" content={<MetricTip metric="marketPricing" />}>
          <div>
            <div className="muted">Market pricing for next meeting ⓘ</div>
            <div className="big num">{game.marketExpected.toFixed(2)}%</div>
          </div>
          <div className={`pricing-move ${implied > 0.05 ? "up" : implied < -0.05 ? "down" : ""}`}>
            <StatusBadge level="info" label={pricing.label} />
            <div>{pricing.note}</div>
          </div>
        </Tip>
        {/* Always rendered (fixed height) so the buttons below never jump */}
        <div className={`muted guidance ${Math.abs(e.guidance) > 0.02 ? "active" : ""}`}>
          {Math.abs(e.guidance) > 0.02 ? (
            <>
              Your guidance is shifting expectations <b className="num">{e.guidance > 0 ? "+" : "−"}{Math.round(Math.abs(e.guidance) * 100)}bp</b>. Contradicting it at the meeting costs credibility.
            </>
          ) : (
            "No forward guidance in effect. Speeches move market expectations before you act."
          )}
        </div>

        <div className="actions">
          {ACTIONS.map((a) => {
            const av = actionAvailability(game, a.id);
            return (
              <button key={a.id} className={`action ${a.id}`} disabled={!av.ok} onClick={() => act(a.id)}>
                <span className="action-label">
                  {a.label} <Kbd>{a.key}</Kbd>
                </span>
                <span className="action-desc">{av.ok ? a.desc(game) : av.reason}</span>
              </button>
            );
          })}
        </div>

        <div className="qe">
          <div className="qe-head">
            <span>Balance sheet</span>
            <span className="muted">${e.balanceSheet.toFixed(2)}T</span>
          </div>
          <div className="segmented" role="group" aria-label="Balance sheet policy">
            {([-1, 0, 1] as QePace[]).map((p) => (
              <button key={p} className={e.qePace === p ? "on" : ""} onClick={() => setQe(p)}>
                {p === -1 ? "Shrink (QT)" : p === 0 ? "Hold" : "Buy bonds (QE)"} <Kbd>{p === -1 ? "T" : p === 0 ? "N" : "Q"}</Kbd>
              </button>
            ))}
          </div>
          <div className="muted">QE lowers long rates &amp; mortgages; QT does the opposite.</div>
        </div>
      </div>

      {last && (
        <div className="panel-footer">
          <p className="muted last">
            Last decision: {last.passed ? `${last.proposal.toFixed(2)}%` : "proposal FAILED"} ({last.votes.filter((v) => v.yes).length}–
            {last.votes.filter((v) => !v.yes).length})
          </p>
        </div>
      )}
    </section>
  );
}

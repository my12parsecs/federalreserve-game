import { PERSONA_COLORS, type Persona } from "../sim/content/accounts";
import { useGame } from "../state/store";

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`);

export function SocialFeed() {
  const posts = useGame((s) => s.game.posts);
  return (
    <section className="panel social">
      <div className="panel-head">
        <h3>#Economy</h3>
        <span className="muted">trending</span>
      </div>
      <ul>
        {posts.slice(0, 60).map((p) => (
          <li key={p.id} className="post">
            <span className="avatar" style={{ background: PERSONA_COLORS[p.persona as Persona] ?? "var(--muted)" }}>
              {p.name.replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase() || "?"}
            </span>
            <div className="post-body">
              <div className="post-head">
                <b>{p.name}</b> <span className="muted">@{p.handle}</span>
              </div>
              <div className="post-text">{p.text}</div>
              <div className="post-stats muted">
                ♡ {compact(p.likes)} · ⟳ {compact(p.reposts)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

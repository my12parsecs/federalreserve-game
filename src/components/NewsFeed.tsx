import { formatShortDay } from "../sim/calendar";
import { useGame } from "../state/store";

export function NewsFeed() {
  const news = useGame((s) => s.game.news);
  return (
    <section className="panel news">
      <div className="panel-head">
        <h3>Wire</h3>
        <span className="live">● LIVE</span>
      </div>
      <ul>
        {news.slice(0, 50).map((n) => (
          <li key={n.id} className={n.tone}>
            <span className="news-date">{formatShortDay(n.day)}</span>
            {n.headline}
          </li>
        ))}
      </ul>
    </section>
  );
}

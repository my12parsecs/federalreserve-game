import { useCallback, useEffect, useRef, useState } from "react";
import { formatDay } from "../sim/calendar";
import { useGame } from "../state/store";
import { EventArt } from "./EventArt";

const KICKER_CLASS: Record<string, string> = {
  intro: "k-intro",
  shock: "k-breaking",
  data: "k-data",
  market: "k-market",
  milestone: "k-market",
  fomc: "k-fomc",
};

const EXIT_MS = 160;

/**
 * Breaking-news popup for big moments. With "pause on news" on, it's a modal
 * that holds the clock; otherwise it slides in as a toast and auto-dismisses.
 */
export function BreakingNews() {
  const pauseOnNews = useGame((s) => s.pauseOnNews);
  // Modal: work through the queue oldest-first. Toast: only the latest matters.
  const alert = useGame((s) => (s.pauseOnNews ? s.game.alerts[0] : s.game.alerts[s.game.alerts.length - 1]));
  const queued = useGame((s) => (s.pauseOnNews ? s.game.alerts.length - 1 : 0));
  const history = useGame((s) => s.game.history);
  const dismissAlert = useGame((s) => s.dismissAlert);
  const over = useGame((s) => s.game.status === "over");
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  const visible = !!alert && !over;
  const modal = visible && pauseOnNews;

  /** Play the exit animation, then drop the alert. Ignores repeat presses. */
  const dismiss = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => {
      dismissAlert();
      closingRef.current = false;
      setClosing(false);
    }, EXIT_MS);
  }, [dismissAlert]);

  // While a modal is up, freeze background animations (ticker, pulses) so the
  // compositor only has the card to paint.
  useEffect(() => {
    document.body.classList.toggle("modal-open", modal);
    return () => document.body.classList.remove("modal-open");
  }, [modal]);

  // Keyboard: Enter / Escape continue
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === "Escape" || e.key === " ") && !e.repeat) {
        e.preventDefault();
        if ((e.target as HTMLElement).tagName === "BUTTON") (e.target as HTMLElement).blur();
        dismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, dismiss]);

  // Toast mode: auto-dismiss
  useEffect(() => {
    if (!visible || pauseOnNews) return;
    const id = setTimeout(dismiss, 6000);
    return () => clearTimeout(id);
  }, [alert?.id, visible, pauseOnNews, dismiss]);

  if (!visible || !alert) return null;

  const card = (
    <article
      key={alert.id}
      className={`breaking ${pauseOnNews ? "modal-mode" : "toast-mode"} ${closing ? "closing" : ""}`}
      role="dialog"
      aria-modal={pauseOnNews}
      aria-label={alert.headline}
    >
      <EventArt art={alert.art} metric={alert.metric} history={history} />
      <div className={`kicker ${KICKER_CLASS[alert.kind] ?? ""}`}>
        <span>{alert.kicker}</span>
        <span className="kicker-date">{formatDay(alert.day)}</span>
      </div>
      <div className="breaking-body">
        <h2>{alert.headline}</h2>
        <p className="breaking-text">{alert.body}</p>

        {alert.impacts.length > 0 && (
          <div className="impacts">
            {alert.impacts.map((i) => (
              <div key={i.label} className={`impact ${i.tone}`}>
                <span>{i.label}</span>
                <b>{i.value}</b>
              </div>
            ))}
          </div>
        )}

        {pauseOnNews && alert.rollCall && (
          <div className="rollcall">
            <div className="voices-head">How they voted</div>
            <ul>
              {alert.rollCall.map((v) => (
                <li key={v.name} className={v.yes ? "yes" : "no"}>
                  <i className={`lean ${v.lean}`} />
                  <span>{v.name}</span>
                  <b>{v.yes ? "YES" : "NO"}</b>
                </li>
              ))}
            </ul>
          </div>
        )}

        {pauseOnNews && alert.voices.length > 0 && (
          <div className="voices">
            <div className="voices-head">What people are saying</div>
            {alert.voices.map((v) => (
              <figure key={v.name + v.text} className="voice">
                <span className="voice-avatar">{v.name.replace(/[^A-Za-z]/g, "").charAt(0)}</span>
                <div>
                  <blockquote>“{v.text}”</blockquote>
                  <figcaption>
                    <b>{v.name}</b> · {v.role}
                  </figcaption>
                </div>
              </figure>
            ))}
          </div>
        )}
      </div>
      <div className="breaking-foot">
        {queued > 0 && <span className="muted">+{queued} more</span>}
        <button className="convene" onClick={dismiss} autoFocus={pauseOnNews}>
          {pauseOnNews ? "Continue ⏎" : "Dismiss"}
        </button>
      </div>
    </article>
  );

  return pauseOnNews ? (
    <div className={`overlay news-overlay ${closing && queued === 0 ? "closing" : ""}`}>{card}</div>
  ) : (
    <div className="toast-wrap">{card}</div>
  );
}

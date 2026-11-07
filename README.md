# Federal Reserve Game

*Created by [Hikaru Imai](https://my12parsecs.github.io/).*

You're the Fed Chair. Set interest rates at each FOMC meeting, win the committee vote,
and keep inflation near 2% and unemployment low for as long as you can.

## Commands

```bash
npm run dev     # play at http://localhost:5173
npm test        # model sanity tests
npm run sim     # headless balance harness (plays 100 games per strategy; `npm run sim 300` for more)
npm run build   # static build in dist/ (itch.io / GitHub Pages ready)
```

## Saving

The game autosaves to your browser's local storage (a few seconds apart, and immediately after votes,
at game over, and when you close the tab). Reopen the page to pick up where you left off — it resumes paused.
**↺ New game** in the top bar (or `Shift+R`) starts over after a confirmation.

## Themes

Pick from the Theme menu at the top right (saved per browser):

- **Terminal** — black, amber and monospace, in the style of a trading terminal.
- **Boardroom** — parchment, ink and serif type (EB Garamond text, Libre Caslon figures), with the gravitas of an old central-bank office.

## Keyboard

Press `?` in game for the full list.

- **FOMC meeting:** `↑`/`↓` adjust proposal · `1`–`5` hawkish / `6`–`0` dovish arguments · `C` clear · `Enter` vote
- **Between meetings:** `Space` pause · `1`/`2`/`3` speed · `H`/`D` speeches · `Q`/`N`/`T` QE / hold / QT · `L` lending facility · `Shift+E` emergency meeting
- **Anytime:** `Enter`/`Esc` continue past breaking news · `P` toggle pause-on-news · `Shift+R` new game

## Structure

- `src/sim/` — pure TypeScript simulation, no UI imports. Markets tick hourly (7 trading hours/day); the macro economy steps daily at the open.
  - `config.ts` — all tunable parameters + opening scenario
  - `economy.ts` — daily macro step (IS curve, Phillips curve, expectations, Okun, bonds, stocks, housing)
  - `releases.ts` — economic data calendar (CPI, jobs, claims, GDP, housing) with consensus & surprises
  - `shocks.ts` — random world events (oil spikes, bank failures, stimulus…)
  - `fomc.ts` — committee members, their Taylor-rule preferences, voting
  - `arguments.ts` — the Chair's meeting arguments, scored against the data
  - `game.ts` — phases (cycle ↔ meeting), daily loop, actions (speeches, QE/QT, emergency meeting, lending)
  - `news.ts`, `social.ts`, `alerts.ts` — flavor text generated from sim events (never affects the sim)
  - `content/` — all flavor content: `events.ts` (world events: effect + headlines + popup + posts + art), `chatter.ts` (background posts), `color.ts` (Fed-speak, earnings, previews), `accounts.ts`
- `src/state/store.ts` — Zustand store + real-time clock speeds
- `src/components/` — dashboard panels (`LineChart.tsx` is a lightweight SVG chart built for per-hour re-renders)
- `src/ui/metrics.ts` — metric explanations + OK/WATCH/DANGER thresholds
- `scripts/simulate.ts` — balance harness
- `legacy/` — the original 2023 jam prototype

## Release

- **Site URL** lives in `.env` (`VITE_SITE_URL`, with trailing slash). It's baked into the canonical link
  and the absolute Open Graph / Twitter image URLs at build time — change it if you deploy elsewhere.
- **Build:** `npm run build` → static site in `dist/` (relative asset paths, so it works in a subfolder such as GitHub Pages).
- **Icons & social image:** `public/favicon.svg` is the source icon. After UI changes, regenerate the PNG icons and
  the 1200×630 `og-image.jpg` (a live screenshot of the game) with:
  `npm run build && npx vite preview --port 5180` then, in another terminal, `npm run assets`
  (set `CHROME_PATH` if Chrome isn't at the default macOS location).
- **After deploying**, check the link preview with a card validator (e.g. opengraph.xyz, or the LinkedIn/Facebook
  post inspectors). Crawlers cache previews, so re-scrape after changing the image.

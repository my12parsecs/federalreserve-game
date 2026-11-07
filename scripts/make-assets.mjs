/**
 * Regenerates release assets in public/: PNG favicons from public/favicon.svg,
 * and the 1200×630 social preview (og-image.jpg) from a live screenshot of the game.
 *
 * Usage: npm run build && npx vite preview --port 5180 &  then  node scripts/make-assets.mjs
 * Needs playwright-core and a local Chrome (CHROME_PATH to override).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("..", import.meta.url));
const pub = root + "public/";
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const gameUrl = process.env.GAME_URL ?? "http://localhost:5180";

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const svg = readFileSync(pub + "favicon.svg", "utf8");

// ---------------------------------------------------------------- icons
async function renderIcon(size, file, { maskable = false } = {}) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  // Maskable icons must be full-bleed with the artwork inside the central safe zone
  const body = maskable
    ? `<div style="width:${size}px;height:${size}px;background:#000;display:grid;place-items:center">
         <div style="width:${size * 0.72}px;height:${size * 0.72}px">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div></div>`
    : svg.replace("<svg ", `<svg width="${size}" height="${size}" `);
  await page.setContent(`<html><body style="margin:0;background:transparent">${body}</body></html>`);
  await page.screenshot({ path: pub + file, omitBackground: !maskable });
  await page.close();
  console.log("wrote", file);
}
await renderIcon(32, "favicon-32.png");
await renderIcon(180, "apple-touch-icon.png", { maskable: true }); // iOS fills transparency with black anyway
await renderIcon(192, "icon-192.png");
await renderIcon(512, "icon-512.png");
await renderIcon(512, "icon-maskable-512.png", { maskable: true });

// ---------------------------------------------------------------- live game screenshot
const game = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await game.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem("frb.theme", "terminal");
  localStorage.setItem("frb.pauseOnNews", "false");
});
await game.goto(gameUrl);
await game.waitForSelector("text=Call the Vote");
await game.keyboard.press("ArrowUp");
await game.keyboard.press("1");
await game.keyboard.press("Enter");
await game.keyboard.press("3");
await game.waitForTimeout(5000);
await game.keyboard.press(" ");
await game.evaluate(() => document.querySelectorAll(".toast-wrap, .notice").forEach((n) => n.remove()));
await game.waitForTimeout(400);
const shot = await game.screenshot({ type: "png" });
await game.close();

// ---------------------------------------------------------------- 1200×630 social card
const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await card.setContent(`<!doctype html><html><head>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #000; color: #e8e8e8;
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .shot { position: absolute; left: 470px; top: 70px; width: 1000px; border-radius: 10px; border: 1px solid #2a2a2d;
          box-shadow: 0 30px 80px rgba(0,0,0,.8); transform: perspective(1400px) rotateY(-14deg) rotateX(4deg); transform-origin: left center; }
  .fade { position: absolute; inset: 0; background: linear-gradient(90deg, #000 0 40%, rgba(0,0,0,.85) 52%, rgba(0,0,0,0) 75%); }
  .copy { position: absolute; left: 64px; top: 0; bottom: 0; width: 560px; display: flex; flex-direction: column; justify-content: center; }
  .brand { display: flex; align-items: center; gap: 16px; }
  .brand svg { width: 64px; height: 64px; }
  .mark { font: 800 28px ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: 2px; background: #ff9f1a; color: #000; padding: 2px 14px; border-radius: 4px; }
  h1 { font-size: 46px; line-height: 1.12; margin: 34px 0 16px; font-weight: 800; letter-spacing: -0.5px; }
  h1 em { font-style: normal; color: #ff9f1a; }
  p { font-size: 22px; line-height: 1.45; color: #b4b4b8; margin: 0; }
  .by { margin-top: 30px; font: 16px ui-monospace, "SF Mono", Menlo, monospace; color: #8b8b90; letter-spacing: 1px; }
  .chips { display: flex; gap: 10px; margin-top: 26px; }
  .chip { font: 600 15px ui-monospace, Menlo, monospace; padding: 6px 10px; border: 1px solid #2a2a2d; border-radius: 4px; color: #e8e8e8; background: #0b0b0c; }
  .chip b { color: #22d27e; } .chip i { color: #ff4d4d; font-style: normal; }
</style></head><body>
  <img class="shot" src="data:image/png;base64,${shot.toString("base64")}">
  <div class="fade"></div>
  <div class="copy">
    <div class="brand">${svg}<span class="mark">FEDERAL RESERVE GAME</span></div>
    <h1>You run the Fed.<br><em>Keep the economy alive.</em></h1>
    <p>Set interest rates, win the FOMC vote, and ride out oil shocks, bank runs and a feed full of angry posts.</p>
    <div class="chips"><span class="chip">CPI <i>3.4%</i></span><span class="chip">JOBS <b>+212K</b></span><span class="chip">FED FUNDS 3.75%</span></div>
    <div class="by">A GAME BY HIKARU IMAI</div>
  </div>
</body></html>`);
await card.waitForTimeout(300);
await card.screenshot({ path: pub + "og-image.jpg", type: "jpeg", quality: 86 });
console.log("wrote og-image.jpg");
await browser.close();

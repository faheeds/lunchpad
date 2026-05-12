/**
 * Headless-browser fallback for menu URL extraction.
 *
 * Why this exists: some restaurant sites (Toast, Square, Squarespace
 * builder-themed pages, modern SPA-style menus) ship a thin HTML shell
 * and render the actual menu via client-side JS. A plain `fetch` of
 * those pages gets us almost nothing useful to feed Claude. The
 * headless browser tier runs the page through Chromium so the
 * post-hydration DOM is what we extract.
 *
 * Why dynamic imports: Playwright + @sparticuz/chromium-min add
 * ~150MB of node_modules. We keep them OUT of the static import
 * graph of the route file, so the function bundle stays lean for
 * the 95% of operators who never trigger the fallback. The cost
 * shifts to cold-start latency on the first fallback call.
 *
 * Env var gate: `PLAYWRIGHT_FALLBACK_ENABLED=1` must be set to use
 * this. Reasoning: Vercel function size and execution-duration
 * limits vary by plan, and headless Chrome can push past those.
 * Operators (you) keep control of when to flip it on.
 *
 * Standard usage from the extract route:
 *   const headlessHtml = await fetchWithHeadlessBrowser(url);
 *
 * Throws on timeout / launch failure — caller decides whether to
 * surface the error or fall back to whatever the plain fetch returned.
 */

const CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar";

/** Hard ceiling on how long we let the headless browser run per call.
 *  Vercel's default function timeout is short on the free plan; the
 *  extract route itself sets `maxDuration` to give us breathing room. */
const HEADLESS_TIMEOUT_MS = 25000;

export function isPlaywrightFallbackEnabled(): boolean {
  return process.env.PLAYWRIGHT_FALLBACK_ENABLED === "1";
}

/**
 * Heuristic: did the plain HTTP fetch give us a "real" page or just
 * a JS shell? We use this to decide whether to spin up the browser.
 *
 *  - Very short stripped text (<500 chars) → almost certainly JS-rendered.
 *  - No dollar signs anywhere → no prices ⇒ probably not the menu yet.
 *  - "Loading..." / "Enable JavaScript" sentinels → definitely a shell.
 */
export function looksJsRendered(strippedText: string): boolean {
  if (strippedText.length < 500) return true;
  if (!strippedText.includes("$")) return true;
  const lower = strippedText.toLowerCase();
  if (lower.includes("you need to enable javascript") || lower.includes("please enable javascript")) {
    return true;
  }
  return false;
}

/**
 * Launch headless Chromium, navigate to the URL, wait for the DOM to
 * settle, and return the post-render HTML.
 */
export async function fetchWithHeadlessBrowser(url: string): Promise<string> {
  // Dynamic imports keep these heavy packages out of the route's
  // static bundle. The compiler/bundler will tree-shake them out of
  // edge runtimes; they only load when this function is actually called.
  const [{ chromium }, chromiumPackMod] = await Promise.all([
    import("playwright-core"),
    import("@sparticuz/chromium-min"),
  ]);
  // The package's default export carries `.args` and `.executablePath()`.
  // Using `.default` keeps us compatible with both CJS and ESM resolutions.
  const chromiumPack = (chromiumPackMod as unknown as { default: {
    args: string[];
    executablePath: (url: string) => Promise<string>;
  } }).default;

  const browser = await chromium.launch({
    args: chromiumPack.args,
    executablePath: await chromiumPack.executablePath(CHROMIUM_PACK_URL),
    headless: true,
  });
  try {
    const context = await browser.newContext({
      // Same UA as the plain fetch so analytics don't flag us as a bot
      // any harder than they already do.
      userAgent: "Mozilla/5.0 (compatible; LunchPadBot/1.0; +https://lunchpad.us)",
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: HEADLESS_TIMEOUT_MS });
    // A few sites lazy-render menu sections on scroll; a small scroll
    // nudge helps coverage without significantly slowing the call.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
    return await page.content();
  } finally {
    await browser.close().catch(() => {});
  }
}

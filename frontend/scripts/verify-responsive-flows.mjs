import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Pass a Playwright module URL when using the desktop app's bundled runtime.
const { chromium } = await import(process.argv[3] || "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 844 } });
const base = process.argv[2] || "http://localhost:5176";
assert(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname), "Run only against a local frontend preview");
async function keyboard(height, top = 0) {
  await page.evaluate(({ height, top }) => {
    Object.defineProperty(window.visualViewport, "height", { configurable: true, value: height });
    Object.defineProperty(window.visualViewport, "offsetTop", { configurable: true, value: top });
    window.visualViewport.dispatchEvent(new Event("resize"));
  }, { height, top });
}
try {
  await page.goto(`${base}/profile`);
  await page.getByText("local@example.test", { exact: true }).waitFor();
  await page.locator(".tgp-nav > button").first().click();
  await page.locator('.tgp-row-main').first().click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.locator(".tgp-card").isVisible(), "Profile must survive settings-to-edit resize");
  assert(!(await page.locator(".tgp-settings").isVisible()));
  const name = page.locator(".tgp-two input").first();
  const original = await name.inputValue();
  await name.fill(`${original} Test`);
  await keyboard(320, 40);
  await page.locator("html.keyboard-open").waitFor();
  const savebar = await page.locator(".tgp-savebar").boundingBox();
  assert(savebar.y >= 40 && savebar.y + savebar.height <= 360, "Save bar must be above keyboard");
  await keyboard(320);
  await page.locator(".tgp-savebar button").first().click();
  await page.locator(".tgp-savebar").waitFor({ state: "detached" });
  await page.locator(".tgp-row-main").first().click();
  await name.fill(`${original} Saved`);
  await page.locator(".tgp-savebar button.primary").click();
  await page.locator(".tgp-savebar").waitFor({ state: "detached" });
  await page.locator(".tgp-row-main").first().click();
  assert.equal(await name.inputValue(), `${original} Saved`);
  await name.fill(original);
  await page.locator(".tgp-savebar button.primary").click();
  await page.locator(".tgp-savebar").waitFor({ state: "detached" });
  await keyboard(844);
  await page.locator(".tgp-nav > button").first().click();
  const master = page.locator('[role="switch"]').first();
  const checked = await master.getAttribute("aria-checked");
  await master.click();
  await page.waitForFunction(() => !document.querySelector('[role="switch"]').disabled);
  assert.notEqual(await master.getAttribute("aria-checked"), checked);
  await master.click();
  await page.waitForFunction(() => !document.querySelector('[role="switch"]').disabled);
  // Deterministic manifest avoids relying on an external emoji CDN in regression checks.
  await page.route("**/*manifest.json*", route => route.fulfill({ json: [{ id: "p1-0001", pack: 1, packName: "Test", src: "/telegram-emojis/p1-0001.png" }] }));
  await page.goto(`${base}/chat`);
  await page.locator(".room-item").first().click();
  await page.locator('.rich-message-input').focus();
  await keyboard(320);
  await page.locator(".emoji-menu-wrap > button").click();
  const picker = page.locator(".telegram-emoji-picker");
  await picker.waitFor();
  const bounds = await picker.boundingBox();
  const grid = await page.locator(".telegram-emoji-grid").boundingBox();
  assert(bounds.y >= 0 && bounds.y + bounds.height <= 320, "Picker must fit visual viewport");
  assert(grid.height >= 80, "At least two emoji rows must remain usable");
  await page.locator(".telegram-emoji-grid button").first().click();
  assert(await page.locator(".rich-message-input img").count() > 0, "Emoji selection must reach composer");
  await page.screenshot({ path: join(tmpdir(), "optima-responsive-keyboard-check.png") });
  await page.locator(".telegram-emoji-head > button").click();
  await picker.waitFor({ state: "detached" });
  await keyboard(844);
  for (const width of [320, 390, 820, 1200]) {
    await page.setViewportSize({ width, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`);
  }
  console.log("PASS: profile navigation/save/cancel, notification toggles, simulated keyboard save bar, emoji selection/grid, responsive widths");
} finally {
  await page.screenshot({ path: join(tmpdir(), "optima-responsive-flow-check.png") });
  await browser.close();
}

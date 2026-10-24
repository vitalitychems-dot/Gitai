import { chromium, request } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const baseURL = "http://127.0.0.1:80";
const screenshotDir = "/tmp/gitai-browser-test";
mkdirSync(screenshotDir, { recursive: true });
const api = await request.newContext({ baseURL });
const state = await api.get("/api/gitai/state");
assert.equal(state.status(), 200);
assert.equal((await state.json()).authenticated, false);
assert.deepEqual((await state.json()).records, []);
assert.equal((await api.post("/api/gitai/records", { data: { kind: "profile", title: "Forbidden", body: "", data: {} } })).status(), 401);
assert.equal((await api.get("/api/gitai/export")).status(), 401);
assert.equal((await api.post("/api/gitai/runner/jobs")).status(), 503);
const q = await api.post("/api/gitai/fees", { data: { subtotalMinor: 10000 } });
assert.equal(q.status(), 200);
assert.equal((await q.json()).buyerTotalMinor, 10400);
assert.equal((await q.json()).sellerNetMinor, 9600);
assert.equal((await api.post("/api/gitai/fees", { data: { subtotalMinor: 100, refundMinor: 101 } })).status(), 400);
assert.equal((await api.post("/api/gitai/fees", { data: { subtotalMinor: 100 }, headers: { Origin: "https://attacker.invalid" } })).status(), 403);
await api.dispose();

const browser = await chromium.launch({ executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(), headless: true, args: ["--no-sandbox"] });
try {
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    for (const path of ["/", "/repositories", "/marketplace", "/people", "/fees", "/offline", "/settings"]) {
      await page.goto(baseURL + path);
      await page.locator("h1").waitFor();
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      assert.equal(overflow, false, `No horizontal overflow: ${width} ${path}`);
    }
    assert.equal(await page.getByTestId("nav-marketplace-attention-count").count(), 0, `Signed-out users have no Marketplace badge at ${width}px`);
    await page.goto(baseURL + "/fees");
    await page.getByTestId("input-fee-subtotal").focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("100");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    assert.equal(await page.getByTestId("button-quote").evaluate(el => document.activeElement === el), true);
    await page.keyboard.press("Enter");
    await page.getByText("$104.00", { exact: true }).waitFor();
    await page.getByText("$96.00", { exact: true }).waitFor();
    await page.getByTestId("input-fee-refund").fill("50");
    await page.getByTestId("button-quote").click();
    await page.getByText("$52.00", { exact: true }).waitFor();
    await page.screenshot({ path: `${screenshotDir}/fees-${width}.png`, fullPage: true });
    await page.goto(baseURL);
    if (width < 1024) {
      await page.getByTestId("button-menu").click();
      assert.equal(await page.getByTestId("nav-marketplace-attention-count").count(), 0, `Signed-out mobile menu has no Marketplace badge at ${width}px`);
      await page.getByTestId("link-nav-marketplace").last().click();
      await page.waitForURL("**/marketplace");
    }
    await page.goto(baseURL + "/sign-in");
    await page.getByRole("textbox", { name: /email/i }).first().waitFor({ timeout: 20000 });
    // No user account is created, signed in, or admitted.
    assert.deepEqual(errors, [], `No uncaught browser errors at ${width}`);
    console.log(`PASS ${width}px: public routes, no overflow, fee/refund interaction, navigation, sign-in form`);
    await page.close();
  }
} finally { await browser.close(); }
console.log("PASS anonymous API authorization, unavailable runner, quote math and cross-origin denial");

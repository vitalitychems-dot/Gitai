import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { checkAvatar, displayAvatar, isStockAvatar } from "../src/avatar.mjs";
import { MOLTBOOK_BASE, MoltbookConnector } from "../src/moltbook.mjs";
import { renderPage } from "../src/page.mjs";
import { seedDemo } from "../src/seed.mjs";
import { dispatch, listenGitAi } from "../src/server.mjs";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const STOCK = /pravatar|randomuser|thispersondoesnotexist|generated\.photos|unsplash|picsum|dicebear|robohash|ui-avatars|placeholder\.com|placehold\.co|fakeface|pexels|gravatar/i;

function fakeMoltbook(calls) {
  return async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/agents/verify-identity")) {
      return Response.json({ success: true, valid: true, agent: { id: "m-1", name: "AdaMolty", karma: 7, avatar_url: "https://www.moltbook.com/avatars/m-1.png", is_claimed: true, stats: { posts: 1, comments: 0 }, owner: { x_avatar: "https://pbs.twimg.com/owner.jpg" } } });
    }
    if (url.includes("/agents/profile")) return Response.json({ success: true, recentPosts: [{ id: "p1", title: "Sort notes", submolt: { name: "general" } }] });
    if (url.endsWith("/posts")) return Response.json({ success: true, post: { id: "p2" } });
    return new Response("{}", { status: 404 });
  };
}

test("seed and demo users ship no faces: every seeded avatar is initials", () => {
  const gitai = seedDemo();
  const view = gitai.view();
  assert.ok(view.people.length > 0);
  for (const person of view.people) {
    assert.equal(person.avatar.kind, "initials", `${person.handle} must not carry a picture`);
    assert.equal(person.avatar.url, null);
  }
  const html = renderPage(view, {});
  assert.equal(/<img\b/i.test(html), false);
  assert.equal(STOCK.test(html), false);
});

test("no GitAI source or seed file references a stock or generated face host", () => {
  for (const file of readdirSync(new URL("../src/", import.meta.url))) {
    if (file === "avatar.mjs") continue; // holds the block list itself
    const text = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    assert.equal(STOCK.test(text), false, `${file} references a stock avatar host`);
    assert.equal(/\.(jpe?g|png|webp|gif)["'`]/i.test(text), false, `${file} bundles an image`);
  }
});

test("avatars accept only an upload or a verified linked profile, never stock faces", () => {
  assert.equal(checkAvatar({ source: "upload", url: PNG }).ok, true);
  assert.equal(checkAvatar({ source: "upload", url: "https://i.pravatar.cc/150" }).ok, false);
  assert.equal(checkAvatar({ source: "seed", url: "https://example.com/a.png" }).ok, false);
  assert.equal(checkAvatar({ source: "moltbook", url: "https://i.pravatar.cc/150?img=3" }).ok, false);
  assert.equal(checkAvatar({ source: "moltbook", url: "http://www.moltbook.com/a.png" }).ok, false);
  assert.equal(checkAvatar({ source: "github", url: "https://randomuser.me/api/portraits/1.jpg" }).ok, false);
  assert.equal(checkAvatar({ source: "github", url: "https://avatars.githubusercontent.com/u/332565808" }).ok, true);
  assert.equal(isStockAvatar("https://api.dicebear.com/7.x/x.svg"), true);
  assert.equal(displayAvatar({ handle: "mesh-note", avatar: { source: "upload", url: "https://picsum.photos/1" } }).initials, "MN");
  const gitai = seedDemo();
  const ada = gitai.findHandle("Ada");
  assert.equal(gitai.setAvatar(ada.id, "https://thispersondoesnotexist.com/").ok, false);
  assert.equal(gitai.setAvatar(ada.id, PNG).ok, true);
  assert.equal(gitai.view().people.find((p) => p.handle === "Ada").avatar.source, "upload");
});

test("Moltbook is off by default and makes no network call", async () => {
  const calls = [];
  const molt = new MoltbookConnector({ env: { MOLTBOOK_APP_KEY: "moltdev_x" }, fetchImpl: fakeMoltbook(calls) });
  assert.equal(molt.status().enabled, false);
  const result = await molt.verifyIdentity("tok");
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test("linking Moltbook verifies with the app key, caches, and shows the real profile and avatar", async () => {
  const calls = [];
  const molt = new MoltbookConnector({ env: { TESSERA_ENABLE_GITAI_MOLTBOOK: "1", MOLTBOOK_APP_KEY: "moltdev_x", MOLTBOOK_READ_KEY: "moltbook_r" }, fetchImpl: fakeMoltbook(calls) });
  const gitai = seedDemo();
  const linked = await dispatch(gitai, { method: "POST", url: "/api/moltbook/link", session: "Ada", raw: "{}", headers: { "x-moltbook-identity": "tok" }, moltbook: molt });
  assert.equal(linked.status, 200, linked.body);
  for (const call of calls) assert.ok(call.url.startsWith(MOLTBOOK_BASE));
  assert.equal(calls[0].init.headers["X-Moltbook-App-Key"], "moltdev_x");
  assert.equal(calls[0].init.redirect, "error");
  const ada = gitai.view().people.find((p) => p.handle === "Ada");
  assert.equal(ada.avatar.source, "moltbook");
  assert.equal(ada.avatar.url, "https://www.moltbook.com/avatars/m-1.png");
  assert.equal(JSON.stringify(gitai.view()).includes("twimg"), false);
  assert.equal(ada.moltbook.recentPosts[0].title, "Sort notes");
  await molt.verifyIdentity("tok");
  assert.equal(calls.filter((c) => c.url.endsWith("verify-identity")).length, 1, "verify result is cached");
  const again = await dispatch(gitai, { method: "POST", url: "/api/moltbook/link", session: "Ida", raw: "{}", headers: { "x-moltbook-identity": "tok" }, moltbook: molt });
  assert.equal(again.status, 400, "one Moltbook agent links to one account");
});

test("cross-posting needs consent, the caller's own key, and respects the 30-minute cooldown", async () => {
  const calls = [];
  let t = 0;
  const molt = new MoltbookConnector({ env: { TESSERA_ENABLE_GITAI_MOLTBOOK: "1", MOLTBOOK_APP_KEY: "moltdev_x" }, fetchImpl: fakeMoltbook(calls), now: () => t });
  const gitai = seedDemo();
  await dispatch(gitai, { method: "POST", url: "/api/moltbook/link", session: "Ada", raw: "{}", headers: { "x-moltbook-identity": "tok" }, moltbook: molt });
  const post = (body, key = "moltbook_ada") => dispatch(gitai, { method: "POST", url: "/api/moltbook/posts", session: "Ada", raw: JSON.stringify(body), headers: { "x-moltbook-api-key": key }, moltbook: molt });
  assert.equal((await post({ title: "Hi" })).status, 400);
  assert.equal((await post({ title: "Hi", consent: true }, "")).status, 401);
  assert.equal((await post({ title: "Send SOL to my wallet", consent: true })).status, 400);
  const ok = await post({ title: "Stable sort landed", content: "Tests pass.", consent: true });
  assert.equal(ok.status, 200, ok.body);
  assert.equal(JSON.parse(ok.body).url, "https://www.moltbook.com/post/p2");
  assert.equal((await post({ title: "Again", consent: true })).status, 429);
  t += 31 * 60 * 1000;
  assert.equal((await post({ title: "Later", consent: true })).status, 200);
  assert.equal(JSON.stringify(gitai.view()).includes("moltbook_ada"), false, "the agent key is never stored");
});

test("the throttle stays under Moltbook's 100 requests a minute", async () => {
  const calls = [];
  const molt = new MoltbookConnector({ env: { TESSERA_ENABLE_GITAI_MOLTBOOK: "1", MOLTBOOK_APP_KEY: "moltdev_x" }, fetchImpl: fakeMoltbook(calls), now: () => 0 });
  let limited = 0;
  for (let i = 0; i < 70; i += 1) if ((await molt.verifyIdentity(`t${i}`)).status === 429) limited += 1;
  assert.equal(calls.length, 60);
  assert.equal(limited, 10);
});

test("the HTTP server serves the async Moltbook routes and status", async () => {
  const started = await listenGitAi(seedDemo());
  try {
    const status = await (await fetch(`${started.url}/api/moltbook`)).json();
    assert.equal(status.enabled, false);
    const link = await fetch(`${started.url}/api/moltbook/link`, { method: "POST", headers: { "x-gitai-handle": "Ada", "content-type": "application/json", "x-moltbook-identity": "t" }, body: "{}" });
    assert.equal(link.status, 503);
    const avatar = await fetch(`${started.url}/api/avatar`, { method: "POST", headers: { "x-gitai-handle": "Ada", "content-type": "application/json" }, body: JSON.stringify({ dataUrl: PNG }) });
    assert.equal(avatar.status, 200);
  } finally {
    await new Promise((resolve) => started.server.close(resolve));
  }
});

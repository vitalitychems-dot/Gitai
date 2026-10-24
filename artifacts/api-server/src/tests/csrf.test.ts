// Adapted from Gitai PR #7 csrf.test.ts for the same-origin-only guard.
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { csrfGuard } from "../lib/csrf";

async function post(headersFor: (port: number) => Record<string, string>) {
  const app = express();
  app.use(csrfGuard);
  let reached = false;
  app.post("/w", (_req, res) => { reached = true; res.status(204).end(); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", () => resolve()); server.once("error", reject); });
  const { port } = server.address() as AddressInfo;
  const body = "name=pen";
  try {
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, path: "/w", method: "POST", headers: {
        "content-type": "application/x-www-form-urlencoded", "content-length": Buffer.byteLength(body), ...headersFor(port) } },
        (res) => { res.resume(); res.on("end", () => resolve(res.statusCode ?? 0)); });
      req.on("error", reject);
      req.end(body);
    });
    return { status, reached };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
}

test("a cross-site form POST is rejected", async () => {
  const r = await post(() => ({ origin: "https://evil.example", "sec-fetch-site": "cross-site" }));
  assert.deepEqual(r, { status: 403, reached: false });
});
test("a foreign Origin is rejected even without Sec-Fetch-Site", async () => {
  const r = await post(() => ({ origin: "https://evil.example" }));
  assert.deepEqual(r, { status: 403, reached: false });
});
test("a same-origin POST is allowed", async () => {
  const r = await post((port) => ({ origin: `http://127.0.0.1:${port}`, "sec-fetch-site": "same-origin" }));
  assert.deepEqual(r, { status: 204, reached: true });
});
test("a foreign Referer is rejected when Origin is absent", async () => {
  const r = await post(() => ({ referer: "https://evil.example/page" }));
  assert.deepEqual(r, { status: 403, reached: false });
});
test("a cookie request without Origin is rejected", async () => {
  const r = await post(() => ({ cookie: "__session=abc" }));
  assert.deepEqual(r, { status: 403, reached: false });
});
test("a bearer call without a cookie is allowed", async () => {
  const r = await post(() => ({ authorization: "Bearer test-token" }));
  assert.deepEqual(r, { status: 204, reached: true });
});

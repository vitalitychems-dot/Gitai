import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { pool } from "@workspace/db";

test("real production HTTP readiness and mutations fail closed without durable storage", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const { default: app } = await import("../app");
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const health = await fetch(`${base}/api/healthz`);
    assert.equal(health.status, 503);
    assert.deepEqual(await health.json(), { status: "unavailable" });
    const write = await fetch(`${base}/api/gitai/records`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "profile", title: "Must never be stored", body: "", data: {} }),
    });
    assert.equal(write.status, 503);
    const response: unknown = await write.json();
    assert.ok(response && typeof response === "object" && "error" in response);
    assert.match(String(response.error), /production prerequisites/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    await pool.end();
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

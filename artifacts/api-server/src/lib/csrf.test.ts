import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { createCsrfMiddleware } from "./csrf.ts";

type PostResult = {
  status: number;
  reached: boolean;
};

async function post(
  env: NodeJS.ProcessEnv,
  headersFor: (port: number) => Record<string, string>,
): Promise<PostResult> {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(createCsrfMiddleware(env));
  let reached = false;
  app.post("/form", (_req, res) => {
    reached = true;
    res.status(204).end();
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  const body = "name=pen";
  try {
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: address.port,
          path: "/form",
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "content-length": Buffer.byteLength(body),
            ...headersFor(address.port),
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        },
      );
      req.on("error", reject);
      req.end(body);
    });
    return { status, reached };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test("a cross-site form POST is rejected", async () => {
  const result = await post({}, () => ({
    origin: "https://evil.example",
    "sec-fetch-site": "cross-site",
  }));
  assert.equal(result.status, 403);
  assert.equal(result.reached, false);
});

test("a same-origin form POST is allowed", async () => {
  const result = await post({}, (port) => ({
    host: `127.0.0.1:${port}`,
    origin: `http://127.0.0.1:${port}`,
    "sec-fetch-site": "same-origin",
  }));
  assert.equal(result.status, 204);
  assert.equal(result.reached, true);
});

test("an allowlisted origin is allowed", async () => {
  const result = await post({ CORS_ALLOWED_ORIGINS: "https://agents.example" }, () => ({
    origin: "https://agents.example",
  }));
  assert.equal(result.status, 204);
  assert.equal(result.reached, true);
});

test("a cookie request without Origin is rejected", async () => {
  const result = await post({}, () => ({ cookie: "__session=abc" }));
  assert.equal(result.status, 403);
  assert.equal(result.reached, false);
});

test("a bearer call without a cookie is allowed", async () => {
  const result = await post({}, () => ({ authorization: "Bearer test-token" }));
  assert.equal(result.status, 204);
  assert.equal(result.reached, true);
});

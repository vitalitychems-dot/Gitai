import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { createCorsMiddleware } from "./cors-allowlist.ts";

type CorsHeaders = {
  allowOrigin: string | null;
  allowCredentials: string | null;
  vary: string | null;
};

async function probe(env: NodeJS.ProcessEnv, origin: string): Promise<CorsHeaders> {
  const app = express();
  app.use(createCorsMiddleware(env));
  app.get("/probe", (_req, res) => {
    res.status(204).end();
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/probe`, {
      headers: { Origin: origin },
    });
    return {
      allowOrigin: response.headers.get("access-control-allow-origin"),
      allowCredentials: response.headers.get("access-control-allow-credentials"),
      vary: response.headers.get("vary"),
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test("a foreign origin gets no CORS headers", async () => {
  const headers = await probe({}, "https://evil.example");
  assert.equal(headers.allowOrigin, null);
  assert.equal(headers.allowCredentials, null);
});

test("an allowlisted origin is echoed with credentials", async () => {
  const headers = await probe(
    { CORS_ALLOWED_ORIGINS: "https://agents.example" },
    "https://agents.example",
  );
  assert.equal(headers.allowOrigin, "https://agents.example");
  assert.equal(headers.allowCredentials, "true");
});

test("the default allowlist is localhost on the dev port", async () => {
  const headers = await probe({ PORT: "5000" }, "http://127.0.0.1:5000");
  assert.equal(headers.allowOrigin, "http://127.0.0.1:5000");
  assert.equal(headers.allowCredentials, "true");
});

test("a star origin is not reflected when credentials are on", async () => {
  const headers = await probe({ CORS_ALLOWED_ORIGINS: "*" }, "https://evil.example");
  assert.equal(headers.allowOrigin, null);
  assert.notEqual(headers.allowOrigin, "*");
  assert.equal(headers.allowCredentials, null);
});

test("a rejected origin still varies on Origin", async () => {
  const headers = await probe({}, "https://evil.example");
  assert.equal(headers.allowOrigin, null);
  assert.equal(headers.allowCredentials, null);
  assert.equal(headers.vary, "Origin");
});

test("a literal null allowlist entry is not reflected", async () => {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };
  try {
    const headers = await probe({ CORS_ALLOWED_ORIGINS: "null" }, "null");
    assert.equal(headers.allowOrigin, null);
    assert.equal(headers.allowCredentials, null);
    assert.equal(headers.vary, "Origin");
    assert.equal(warnings.includes("dropped CORS allowlist entry null"), true);
  } finally {
    console.warn = original;
  }
});

test("a trailing-slash allowlist entry matches the browser origin", async () => {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };
  try {
    const headers = await probe(
      { CORS_ALLOWED_ORIGINS: "https://agents.example/" },
      "https://agents.example",
    );
    assert.equal(headers.allowOrigin, "https://agents.example");
    assert.equal(headers.allowCredentials, "true");
    assert.equal(headers.vary, "Origin");
    assert.equal(
      warnings.includes("normalized CORS allowlist entry https://agents.example/ to https://agents.example"),
      true,
    );
  } finally {
    console.warn = original;
  }
});

test("an uppercase allowlist entry matches the browser origin", async () => {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };
  try {
    const headers = await probe(
      { CORS_ALLOWED_ORIGINS: "HTTPS://Agents.Example" },
      "https://agents.example",
    );
    assert.equal(headers.allowOrigin, "https://agents.example");
    assert.equal(headers.allowCredentials, "true");
    assert.equal(
      warnings.includes("normalized CORS allowlist entry HTTPS://Agents.Example to https://agents.example"),
      true,
    );
  } finally {
    console.warn = original;
  }
});

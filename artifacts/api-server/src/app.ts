import express, { type Express, type ErrorRequestHandler } from "express";
import { createHash, randomUUID } from "node:crypto";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { ZodError } from "zod/v4";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { releaseReadiness } from "./lib/release-readiness";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          // Do not log user-provided paths, query strings, IPs or payloads.
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Request-ID", randomUUID());
  next();
});
// Conservative per-connection rate limit; no raw IP retention. Shared proxy
// connections may share a budget until a trusted edge-IP contract is configured.
const buckets = new Map<string, { at: number; count: number }>();
app.use((req, res, next) => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (now - bucket.at > 60000) buckets.delete(key);
  const key = createHash("sha256").update(req.socket.remoteAddress ?? "unknown").digest("hex");
  const b = buckets.get(key) ?? { at: now, count: 0 };
  buckets.set(key, b);
  if (++b.count > 240 || buckets.size > 1000) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "Request limit reached. Try again in a minute." }); return;
  }
  // Same-origin browser writes only. No CORS wildcard or ambient-cookie cross-site writes.
  if (req.method !== "GET" && req.method !== "HEAD" && req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== getClerkProxyHost(req)) {
        res.status(403).json({ error: "Cross-origin write denied." }); return;
      }
    } catch { res.status(403).json({ error: "Invalid origin." }); return; }
  }
  next();
});
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(express.json({ limit: "96kb" }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api/gitai", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !releaseReadiness().ready) {
    res.status(503).json({ error: "GitAI writes are unavailable until production prerequisites are verified." });
    return;
  }
  next();
});
app.use("/api", router);
const errors: ErrorRequestHandler = (err, req, res, _next) => {
  const status = err instanceof ZodError ? 400 :
    Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  req.log.warn({ status, requestId: res.getHeader("X-Request-ID") }, "GitAI request failed");
  res.status(status).json({ error: status === 500 ? "Unable to complete request. Please retry." :
    err instanceof ZodError ? "Invalid request. Check required fields, limits and allowed values." :
    err.type === "entity.too.large" ? "Request exceeds 96 KiB." :
    err.type === "entity.parse.failed" ? "Malformed JSON request." : err.message });
};
app.use(errors);

export default app;

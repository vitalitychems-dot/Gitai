// Ported from Gitai PR #7 (pen/gitai-csrf, 9e7e9f1a) and adapted to the
// Replit app's same-origin-only model: there is no CORS allowlist here, so the
// only accepted browser origin is the request's own (proxy-aware) host.
// This complements the Origin check in app.ts by also handling
// Sec-Fetch-Site, Referer fallback and cookie requests that omit Origin.
import type { NextFunction, Request, Response } from "express";
import { getClerkProxyHost } from "../middlewares/clerkProxyMiddleware";

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function declaredOrigin(req: Request): string | null {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin !== "" && origin !== "null") return origin;
  const referer = req.headers.referer;
  if (typeof referer !== "string" || referer === "") return null;
  try {
    const parsed = new URL(referer);
    return parsed.origin === "null" ? null : parsed.origin;
  } catch {
    return null;
  }
}

export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  if (!STATE_CHANGING.has(req.method.toUpperCase())) { next(); return; }
  if (String(req.headers["sec-fetch-site"] ?? "").toLowerCase() === "cross-site") {
    res.status(403).json({ error: "Cross-site request blocked." });
    return;
  }
  const origin = declaredOrigin(req);
  if (origin !== null) {
    let host: string | null = null;
    try { host = new URL(origin).host; } catch { host = null; }
    if (host !== null && host === getClerkProxyHost(req)) { next(); return; }
    res.status(403).json({ error: "Origin is not allowed." });
    return;
  }
  // A browser that attaches a session cookie but omits Origin fails closed.
  if (req.headers.cookie) {
    res.status(403).json({ error: "Cookie request missing Origin." });
    return;
  }
  // No cookie: not an ambient browser session (e.g. Authorization: Bearer).
  next();
}

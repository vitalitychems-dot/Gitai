import type { NextFunction, Request, Response } from "express";
import { allowedOrigins } from "./cors-allowlist.ts";

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function declaredOrigin(req: Request): string | null {
  const origin = req.get("origin");
  if (origin !== undefined && origin !== "" && origin !== "null") {
    return origin;
  }
  const referer = req.get("referer");
  if (referer === undefined || referer === "") {
    return null;
  }
  try {
    const parsed = new URL(referer);
    if (parsed.origin === "null") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function sameOrigin(req: Request, origin: string): boolean {
  const host = req.get("host");
  if (host === undefined) {
    return false;
  }
  return origin === `${req.protocol}://${host}`;
}

export function createCsrfMiddleware(env: NodeJS.ProcessEnv = process.env) {
  const allow = new Set(allowedOrigins(env));
  return (req: Request, res: Response, next: NextFunction) => {
    if (!STATE_CHANGING.has(req.method.toUpperCase())) {
      next();
      return;
    }
    if (req.get("sec-fetch-site")?.toLowerCase() === "cross-site") {
      res.status(403).json({ error: "Cross-site request blocked." });
      return;
    }
    const origin = declaredOrigin(req);
    if (origin !== null) {
      if (sameOrigin(req, origin) || allow.has(origin)) {
        next();
        return;
      }
      res.status(403).json({ error: "Origin is not allowed." });
      return;
    }
    // A browser attaching the Clerk session cookie and omitting Origin fails
    // closed. This repo does not set that cookie's SameSite.
    if (req.get("cookie")) {
      res.status(403).json({ error: "Cookie request missing Origin." });
      return;
    }
    // No cookie, so this is not a browser session. Non-web clients send
    // Authorization: Bearer and no cookie (setAuthTokenGetter in
    // lib/api-client-react/src/custom-fetch.ts). Those calls pass here.
    next();
  };
}

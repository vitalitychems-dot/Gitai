import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import type { CorsOptions } from "cors";

const DEV_PORT = "5000";

function devPort(port: string | undefined): string {
  if (port !== undefined && /^[1-9][0-9]{0,4}$/.test(port) && Number(port) <= 65535) {
    return port;
  }
  return DEV_PORT;
}

function canonicalOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed === "*" || trimmed.toLowerCase() === "null") {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return null;
  }
  if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") {
    return null;
  }
  return parsed.origin;
}

function classifyEntry(raw: string): { origin: string | null; warning: string | null } {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed === "*") {
    return { origin: null, warning: null };
  }
  if (trimmed.toLowerCase() === "null") {
    return { origin: null, warning: "dropped CORS allowlist entry null" };
  }
  const origin = canonicalOrigin(trimmed);
  if (origin === null) {
    return { origin: null, warning: `ignored CORS allowlist entry ${trimmed}` };
  }
  if (origin !== trimmed) {
    return {
      origin,
      warning: `normalized CORS allowlist entry ${trimmed} to ${origin}`,
    };
  }
  return { origin, warning: null };
}

export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = env.CORS_ALLOWED_ORIGINS?.split(",") ?? [];
  const origins: string[] = [];
  const seen = new Set<string>();
  if (env.CORS_ALLOWED_ORIGINS?.trim()) {
    for (const item of configured) {
      const decision = classifyEntry(item);
      if (decision.warning) {
        console.warn(decision.warning);
      }
      if (decision.origin !== null && !seen.has(decision.origin)) {
        seen.add(decision.origin);
        origins.push(decision.origin);
      }
    }
    if (origins.length > 0) {
      return origins;
    }
  }
  const port = devPort(env.PORT?.trim());
  return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
}

export function corsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
  const allow = new Set(allowedOrigins(env));
  return {
    credentials: true,
    origin(origin, callback) {
      const canonical = origin === undefined ? null : canonicalOrigin(origin);
      if (canonical !== null && allow.has(canonical)) {
        callback(null, canonical);
        return;
      }
      callback(null, false);
    },
  };
}

export function createCorsMiddleware(env: NodeJS.ProcessEnv = process.env) {
  const inner = cors(corsOptions(env));
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Vary", "Origin");
    inner(req, res, next);
  };
}

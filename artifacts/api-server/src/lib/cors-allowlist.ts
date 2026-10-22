import cors from "cors";
import type { CorsOptions } from "cors";

const DEV_PORT = "5000";

function devPort(port: string | undefined): string {
  if (port !== undefined && /^[1-9][0-9]{0,4}$/.test(port) && Number(port) <= 65535) {
    return port;
  }
  return DEV_PORT;
}

export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = env.CORS_ALLOWED_ORIGINS?.split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item !== "*");
  if (env.CORS_ALLOWED_ORIGINS?.trim() && configured && configured.length > 0) {
    return configured;
  }
  const port = devPort(env.PORT?.trim());
  return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
}

export function corsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
  const allow = new Set(allowedOrigins(env));
  return {
    credentials: true,
    origin(origin, callback) {
      if (origin !== undefined && allow.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  };
}

export function createCorsMiddleware(env: NodeJS.ProcessEnv = process.env) {
  return cors(corsOptions(env));
}

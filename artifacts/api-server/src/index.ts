import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, "127.0.0.1", () => {
  logger.info({ port }, "Server listening");
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.on("error", () => { logger.error("Server failed to listen"); process.exit(1); });

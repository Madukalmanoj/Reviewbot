// Local development server entry point.
// Vercel uses api/webhook.ts instead — this file is NOT invoked in production.
import app from "./app";
import { logger } from "./lib/logger";

const port = Number(process.env["PORT"] ?? 8080);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

app.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening on http://localhost:" + port);
});

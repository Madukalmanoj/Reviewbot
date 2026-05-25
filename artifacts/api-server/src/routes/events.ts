import { Router, type IRouter } from "express";
import { addSSEClient, broadcastLog } from "../lib/sse";

const router: IRouter = Router();

// Vercel serverless functions do not support long-lived SSE connections.
// On Vercel, we return a 503 with a clear message so the frontend can
// show a "not available in serverless mode" notice instead of hanging.
const isVercel = !!process.env.VERCEL;

router.get("/events", (req, res): void => {
  if (isVercel) {
    res.status(503).json({
      error: "Live SSE feed is not available in serverless mode.",
      hint: "Deploy the api-server as a long-running process for real-time events.",
    });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  addSSEClient(res);

  // Send a connected event immediately
  res.write(`data: ${JSON.stringify({ event: "connected", data: { message: "Connected to ReviewBot live feed" }, timestamp: new Date().toISOString() })}\n\n`);

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ event: "heartbeat", data: {}, timestamp: new Date().toISOString() })}\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
  });
});

export default router;

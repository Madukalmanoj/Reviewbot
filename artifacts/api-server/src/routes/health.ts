import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();
const startTime = Date.now();

router.get("/healthz", async (req, res): Promise<void> => {
  let dbStatus = "unknown";
  let activeLlmProvider: string | null = null;
  let scansToday: number | null = null;

  // Check DB connection and get active provider
  try {
    const rows = await db.select().from(settingsTable);
    dbStatus = "connected";
    const providerRow = rows.find(r => r.key === "activeProvider");
    activeLlmProvider = providerRow?.value ?? "gemini";
  } catch (err: any) {
    if (err?.message?.includes("relation") && err?.message?.includes("does not exist")) {
      dbStatus = "schema_missing";
    } else if (!process.env.DATABASE_URL) {
      dbStatus = "no_database_url";
    } else {
      dbStatus = "error: " + (err?.message ?? "unknown");
    }
  }

  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  res.json(
    HealthCheckResponse.parse({
      status: dbStatus === "connected" ? "ok" : "degraded",
      activeLlmProvider,
      scansToday: scansToday ?? 0,
      uptimeSeconds,
      indexStatus: dbStatus,
    })
  );
});

export default router;

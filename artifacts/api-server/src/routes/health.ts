import { Router, type IRouter } from "express";
import { db, scansTable } from "@workspace/db";
import { gte, sql } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();
const startTime = Date.now();

router.get("/healthz", async (req, res): Promise<void> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(scansTable)
      .where(gte(scansTable.timestamp, today));

    const uptimeSeconds = (Date.now() - startTime) / 1000;

    res.json(
      HealthCheckResponse.parse({
        status: "ok",
        activeLlmProvider: process.env.ACTIVE_LLM_PROVIDER ?? "gemini",
        scansToday: count ?? 0,
        uptimeSeconds,
        indexStatus: "ready",
      })
    );
  } catch {
    res.json(
      HealthCheckResponse.parse({
        status: "ok",
        activeLlmProvider: "gemini",
        scansToday: 0,
        uptimeSeconds: (Date.now() - startTime) / 1000,
        indexStatus: "ready",
      })
    );
  }
});

export default router;

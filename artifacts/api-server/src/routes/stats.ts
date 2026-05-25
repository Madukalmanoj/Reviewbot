import { Router, type IRouter } from "express";
import { db, scansTable } from "@workspace/db";
import { sql, gte, count } from "drizzle-orm";
import { GetStatsResponse } from "@workspace/api-zod";
import type { Finding } from "../lib/agent";

const router: IRouter = Router();

router.get("/stats", async (_req, res): Promise<void> => {
  const allScans = await db.select().from(scansTable);

  const totalScans = allScans.length;

  const allFindings: Finding[] = allScans.flatMap(
    (s) => (s.findingsJson as Finding[]) ?? []
  );

  const severityCounts: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  const cweCounts: Record<string, number> = {};
  const providerCounts: Record<string, number> = {};
  let totalConfidence = 0;
  let criticalFindings = 0;

  for (const finding of allFindings) {
    if (finding.severity in severityCounts) {
      severityCounts[finding.severity]++;
    }
    if (finding.severity === "critical") criticalFindings++;
    if (finding.cweId) {
      cweCounts[finding.cweId] = (cweCounts[finding.cweId] ?? 0) + 1;
    }
    totalConfidence += finding.confidence ?? 0;
  }

  for (const scan of allScans) {
    const p = scan.providerUsed ?? "gemini";
    providerCounts[p] = (providerCounts[p] ?? 0) + 1;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const scansToday = allScans.filter((s) => s.timestamp >= today).length;

  const avgConfidence =
    allFindings.length > 0 ? totalConfidence / allFindings.length : 0;

  const topCwes = Object.entries(cweCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([cweId, count]) => ({ cweId, count }));

  const findingsBySeverity = Object.entries(severityCounts).map(
    ([severity, count]) => ({ severity, count })
  );

  const providerUsage = Object.entries(providerCounts).map(
    ([provider, count]) => ({ provider, count })
  );

  res.json(
    GetStatsResponse.parse({
      totalScans,
      findingsBySeverity,
      topCwes,
      providerUsage,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      prsProtected: totalScans,
      scansToday,
      criticalFindings,
    })
  );
});

export default router;

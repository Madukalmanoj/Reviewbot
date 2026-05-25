import { Router, type IRouter } from "express";
import { db, scansTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import {
  ListScansQueryParams,
  ListScansResponse,
  GetScanParams,
  GetScanResponse,
  TriggerScanBody,
} from "@workspace/api-zod";
import { analyzeDiff, buildMockDiff, type Finding } from "../lib/agent";
import { broadcastLog } from "../lib/sse";
import { logger } from "../lib/logger";
import { getGithubToken, buildPRComment, postPRComment, postCommitStatus } from "../lib/github";

const router: IRouter = Router();

function formatScan(scan: typeof scansTable.$inferSelect) {
  return {
    id: scan.id,
    repo: scan.repo,
    prNumber: scan.prNumber,
    prUrl: scan.prUrl,
    prTitle: scan.prTitle ?? null,
    timestamp: scan.timestamp.toISOString(),
    providerUsed: scan.providerUsed,
    findings: (scan.findingsJson as Finding[]) ?? [],
    riskScore: scan.riskScore as "critical" | "high" | "medium" | "low" | "clean",
    status: scan.status as "pending" | "running" | "completed" | "failed",
    errorMessage: scan.errorMessage ?? null,
  };
}

router.get("/scans", async (req, res): Promise<void> => {
  const params = ListScansQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const page = params.data.page ?? 1;
  const limit = params.data.limit ?? 20;
  const offset = (page - 1) * limit;

  const [totalResult, scans] = await Promise.all([
    db.select({ count: count() }).from(scansTable),
    db
      .select()
      .from(scansTable)
      .orderBy(desc(scansTable.timestamp))
      .limit(limit)
      .offset(offset),
  ]);

  const total = totalResult[0]?.count ?? 0;

  res.json(
    ListScansResponse.parse({
      scans: scans.map(formatScan),
      total,
      page,
      limit,
    })
  );
});

router.get("/scans/trigger", async (_req, res): Promise<void> => {
  res.status(405).json({ error: "Use POST /api/scans/trigger" });
});

router.post("/scans/trigger", async (req, res): Promise<void> => {
  const parsed = TriggerScanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { repoFullName, prNumber } = parsed.data;

  const [newScan] = await db
    .insert(scansTable)
    .values({
      repo: repoFullName,
      prNumber,
      prUrl: `https://github.com/${repoFullName}/pull/${prNumber}`,
      prTitle: `PR #${prNumber}`,
      status: "running",
      providerUsed: "gemini",
      findingsJson: [],
      riskScore: "clean",
    })
    .returning();

  const scanId = newScan.id;
  res.status(202).json({ scanId, message: "Scan started" });

  await (async () => {
    try {
      broadcastLog(`Manual scan triggered for ${repoFullName}#${prNumber}`, "info");

      const githubToken = await getGithubToken();
      let diff: string;
      let headSha = "";

      if (githubToken) {
        // Fetch PR metadata to get HEAD SHA and title
        const prMeta = await fetch(
          `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}`,
          { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" } }
        );
        if (prMeta.ok) {
          const prData = (await prMeta.json()) as { head: { sha: string }; title: string };
          headSha = prData.head?.sha ?? "";
          const prTitle = prData.title;
          if (prTitle) {
            await db.update(scansTable).set({ prTitle }).where(eq(scansTable.id, scanId));
          }
        }

        // Set commit status to pending
        if (headSha) {
          await postCommitStatus(githubToken, repoFullName, headSha, "pending", scanId, 0);
        }

        // Fetch diff
        const diffRes = await fetch(
          `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}`,
          { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github.v3.diff" } }
        );
        diff = await diffRes.text();
      } else {
        broadcastLog("No GitHub token configured — using demo diff", "info");
        diff = buildMockDiff(repoFullName, prNumber);
      }

      const { findings, riskScore, provider } = await analyzeDiff(
        diff,
        repoFullName,
        prNumber,
        (msg) => broadcastLog(msg, "teal")
      );

      await db
        .update(scansTable)
        .set({ findingsJson: findings, riskScore, providerUsed: provider, status: "completed" })
        .where(eq(scansTable.id, scanId));

      broadcastLog(`Scan ${scanId} complete: ${findings.length} findings, risk=${riskScore}`, "teal");

      if (githubToken) {
        // Post commit status
        if (headSha) {
          const statusResult = await postCommitStatus(githubToken, repoFullName, headSha, riskScore, scanId, findings.length);
          if (statusResult.success) {
            broadcastLog(`Commit status set: ${riskScore}`, "teal");
          } else {
            broadcastLog(`Commit status failed: ${statusResult.error}`, "error");
          }
        }

        // Post PR comment
        broadcastLog(`Posting review comment to ${repoFullName}#${prNumber}...`, "info");
        const commentBody = buildPRComment(findings, riskScore, repoFullName, prNumber, scanId);
        const result = await postPRComment(githubToken, repoFullName, prNumber, commentBody);
        if (result.success) {
          broadcastLog(`PR comment posted: ${result.commentUrl}`, "teal");
        } else {
          broadcastLog(`Failed to post PR comment: ${result.error}`, "error");
        }
      }
    } catch (err) {
      logger.error({ err, scanId }, "Scan failed");
      broadcastLog(`Scan ${scanId} failed: ${String(err)}`, "error");
      await db
        .update(scansTable)
        .set({ status: "failed", errorMessage: String(err) })
        .where(eq(scansTable.id, scanId));
    }
  });
});

router.get("/scans/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetScanParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [scan] = await db
    .select()
    .from(scansTable)
    .where(eq(scansTable.id, params.data.id));

  if (!scan) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  res.json(GetScanResponse.parse(formatScan(scan)));
});

export default router;

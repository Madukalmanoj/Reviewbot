import { Router, type IRouter } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { db, scansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { analyzeDiff } from "../lib/agent";
import { broadcastLog } from "../lib/sse";
import { logger } from "../lib/logger";
import { getGithubToken, buildPRComment, postPRComment, postCommitStatus } from "../lib/github";

const router: IRouter = Router();

function verifySignature(body: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return !secret;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

router.post("/webhook", async (req, res): Promise<void> => {
  const signature = (req.headers["x-hub-signature-256"] as string) ?? "";
  const event = (req.headers["x-github-event"] as string) ?? "";
  const body = req.body;

    // Support both GITHUB_WEBHOOK_SECRET (Vercel convention) and WEBHOOK_SECRET
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET ?? process.env.WEBHOOK_SECRET ?? "";

  if (webhookSecret) {
    const rawBody = JSON.stringify(body);
    if (!verifySignature(rawBody, signature, webhookSecret)) {
      req.log.warn("Invalid webhook signature");
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
  }

  if (event !== "pull_request") {
    res.json({ received: true, message: "Event ignored" });
    return;
  }

  const action = body?.action as string;
  if (!["opened", "synchronize", "reopened"].includes(action)) {
    res.json({ received: true, message: "PR action ignored" });
    return;
  }

  const prNumber = body?.pull_request?.number as number;
  const prTitle = body?.pull_request?.title as string;
  const prUrl = body?.pull_request?.html_url as string;
  const repoFullName = body?.repository?.full_name as string;
  const headSha = (body?.pull_request?.head?.sha as string) ?? "";

  if (!prNumber || !repoFullName) {
    res.status(400).json({ error: "Missing PR data" });
    return;
  }

  res.json({ received: true, message: "Analysis started" });

  await (async () => {
    const [newScan] = await db
      .insert(scansTable)
      .values({
        repo: repoFullName,
        prNumber,
        prUrl: prUrl ?? `https://github.com/${repoFullName}/pull/${prNumber}`,
        prTitle: prTitle ?? `PR #${prNumber}`,
        status: "running",
        providerUsed: "gemini",
        findingsJson: [],
        riskScore: "clean",
      })
      .returning();

    const scanId = newScan.id;
    broadcastLog(`Webhook received: ${repoFullName}#${prNumber}`, "info");

    try {
      const githubToken = await getGithubToken();

      // Set commit status to pending immediately
      if (githubToken && headSha) {
        await postCommitStatus(githubToken, repoFullName, headSha, "pending", scanId, 0);
        broadcastLog(`Commit status set to pending for ${headSha.slice(0, 7)}`, "info");
      }

      let diff = "";
      if (githubToken) {
        const diffRes = await fetch(
          `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}`,
          {
            headers: {
              Authorization: `Bearer ${githubToken}`,
              Accept: "application/vnd.github.v3.diff",
            },
          }
        );
        diff = await diffRes.text();
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

      broadcastLog(`Scan complete: ${findings.length} findings, risk=${riskScore}`, "teal");

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
      logger.error({ err, scanId }, "Webhook analysis failed");
      broadcastLog(`Scan ${scanId} failed`, "error");
      await db
        .update(scansTable)
        .set({ status: "failed", errorMessage: String(err) })
        .where(eq(scansTable.id, scanId));
    }
  });
});

export default router;
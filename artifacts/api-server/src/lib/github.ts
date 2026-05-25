import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import type { Finding } from "./agent";

export async function getGithubToken(): Promise<string> {
  // DB-stored token takes precedence over env var
  try {
    const [row] = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, "githubToken"));
    if (row?.value && row.value.length > 0) return row.value;
  } catch {
    // fall through
  }
  return process.env.GITHUB_TOKEN ?? "";
}

export interface GitHubIdentity {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
  type: "user" | "bot";
}

export async function verifyGithubToken(token: string): Promise<{
  valid: boolean;
  identity: GitHubIdentity | null;
  error: string | null;
}> {
  if (!token) return { valid: false, identity: null, error: "No token provided" };
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { valid: false, identity: null, error: body.message ?? `HTTP ${res.status}` };
    }
    const user = (await res.json()) as {
      login: string;
      name?: string;
      avatar_url: string;
      html_url: string;
      type: string;
    };
    return {
      valid: true,
      identity: {
        login: user.login,
        name: user.name ?? null,
        avatarUrl: user.avatar_url,
        htmlUrl: user.html_url,
        type: user.type === "Bot" ? "bot" : "user",
      },
      error: null,
    };
  } catch (err) {
    return { valid: false, identity: null, error: String(err) };
  }
}

function riskBadge(risk: string): string {
  const map: Record<string, string> = {
    critical: "🔴 CRITICAL",
    high: "🟠 HIGH",
    medium: "🟡 MEDIUM",
    low: "🔵 LOW",
    clean: "🟢 CLEAN",
  };
  return map[risk] ?? risk.toUpperCase();
}

function severityIcon(severity: string): string {
  return { critical: "🔴", high: "🟠", medium: "🟡", low: "🔵" }[severity] ?? "⚪";
}

function findingTypeLabel(type: string): string {
  return { security: "Security", performance: "Performance", style: "Style", bug: "Bug" }[type] ?? type;
}

export function buildPRComment(
  findings: Finding[],
  riskScore: string,
  repo: string,
  prNumber: number,
  scanId: number
): string {
  const lines: string[] = [];
  lines.push(`## 🤖 ReviewBot Analysis — ${riskBadge(riskScore)}`);
  lines.push("");
  lines.push(`> Scan #${scanId} completed for **${repo}** PR #${prNumber}`);
  lines.push("");

  if (findings.length === 0) {
    lines.push("✅ **No issues found.** This PR looks clean!");
    lines.push("");
    lines.push("---");
    lines.push(`*Powered by [ReviewBot](https://github.com/reviewbot) using Gemini 2.5 Flash*`);
    return lines.join("\n");
  }

  // Summary table
  const critCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;
  const medCount = findings.filter((f) => f.severity === "medium").length;
  const lowCount = findings.filter((f) => f.severity === "low").length;

  lines.push(`| 🔴 Critical | 🟠 High | 🟡 Medium | 🔵 Low | Total |`);
  lines.push(`|:-----------:|:-------:|:---------:|:------:|:-----:|`);
  lines.push(`| ${critCount} | ${highCount} | ${medCount} | ${lowCount} | **${findings.length}** |`);
  lines.push("");

  // Group by severity
  const order: Finding["severity"][] = ["critical", "high", "medium", "low"];
  for (const sev of order) {
    const group = findings.filter((f) => f.severity === sev);
    if (group.length === 0) continue;

    lines.push(`### ${severityIcon(sev)} ${sev.charAt(0).toUpperCase() + sev.slice(1)} Severity`);
    lines.push("");

    for (const f of group) {
      const cwe = f.cweId ? ` · \`${f.cweId}\`` : "";
      const owasp = f.owaspSource ? ` · *${f.owaspSource}*` : "";
      lines.push(`<details>`);
      lines.push(`<summary><strong>${severityIcon(sev)} ${findingTypeLabel(f.findingType)}${cwe}</strong> — ${f.description.slice(0, 120)}${f.description.length > 120 ? "…" : ""} <code>${f.lineRef}</code></summary>`);
      lines.push("");
      lines.push(`**Confidence:** ${Math.round(f.confidence * 100)}%${owasp}`);
      lines.push("");
      lines.push(`**Description:** ${f.description}`);
      lines.push("");
      if (f.fixSuggestion) {
        lines.push(`**Suggested Fix:**`);
        lines.push("");
        lines.push(f.fixSuggestion);
        lines.push("");
      }
      lines.push(`</details>`);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push(`*Powered by ReviewBot · Gemini 2.5 Flash · [View full report](#)*`);
  return lines.join("\n");
}

export async function postCommitStatus(
  token: string,
  repo: string,
  sha: string,
  riskScore: string,
  scanId: number,
  findingsCount: number
): Promise<{ success: boolean; error: string | null }> {
  const stateMap: Record<string, "success" | "failure" | "error"> = {
    clean: "success",
    low: "success",
    medium: "failure",
    high: "failure",
    critical: "failure",
  };
  const state = stateMap[riskScore] ?? "error";

  const descMap: Record<string, string> = {
    clean: "No issues found — ready to merge",
    low: `${findingsCount} low-severity issue${findingsCount !== 1 ? "s" : ""} — safe to merge`,
    medium: `${findingsCount} medium-severity issue${findingsCount !== 1 ? "s" : ""} — review recommended`,
    high: `${findingsCount} high-severity issue${findingsCount !== 1 ? "s" : ""} — review required`,
    critical: `${findingsCount} CRITICAL issue${findingsCount !== 1 ? "s" : ""} — do not merge`,
  };

  try {
    const url = `https://api.github.com/repos/${repo}/statuses/${sha}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        state,
        description: descMap[riskScore] ?? `Risk: ${riskScore}`,
        context: "ReviewBot / security-analysis",
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      return { success: false, error: err.message ?? `HTTP ${res.status}` };
    }
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function postPRComment(
  token: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<{ success: boolean; commentUrl: string | null; error: string | null }> {
  try {
    const url = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ body }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      return { success: false, commentUrl: null, error: err.message ?? `HTTP ${res.status}` };
    }

    const data = (await res.json()) as { html_url: string };
    return { success: true, commentUrl: data.html_url, error: null };
  } catch (err) {
    logger.error({ err }, "Failed to post PR comment");
    return { success: false, commentUrl: null, error: String(err) };
  }
}

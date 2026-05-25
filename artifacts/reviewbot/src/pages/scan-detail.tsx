import React, { useState } from "react";
import { useGetScan } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { format } from "date-fns";
import {
  AlertCircle, Bug, ChevronDown, ChevronUp, CheckCircle, ExternalLink,
  Github, Code, Cpu, ShieldAlert, ShieldCheck, Info, Loader2,
} from "lucide-react";
import { CodeBlock } from "@/components/ui/code-block";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { RiskBadge } from "./dashboard";

// Plain-English explanation of why a PR got its risk score
function buildRiskReason(riskScore: string, findings: any[]): { headline: string; detail: string; color: string } {
  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;
  const medCount = findings.filter((f) => f.severity === "medium").length;
  const lowCount = findings.filter((f) => f.severity === "low").length;
  const securityIssues = findings.filter((f) => f.findingType === "security");
  const topCwe = securityIssues[0]?.cweId;

  if (riskScore === "clean") {
    return {
      headline: "This PR is safe to merge",
      detail: "ReviewBot analyzed all code changes and found no security vulnerabilities, performance issues, or code quality problems.",
      color: "border-emerald-700/40 bg-emerald-950/30 text-emerald-300",
    };
  }
  if (riskScore === "low") {
    return {
      headline: `${lowCount} minor issue${lowCount !== 1 ? "s" : ""} — safe to merge`,
      detail: `Low-severity findings typically involve code style or minor improvements. ${topCwe ? `Includes ${topCwe}. ` : ""}These do not block merging but are worth addressing.`,
      color: "border-blue-700/40 bg-blue-950/30 text-blue-300",
    };
  }
  if (riskScore === "medium") {
    const cweStr = topCwe ? ` (${topCwe})` : "";
    return {
      headline: `Review recommended before merging`,
      detail: `${medCount + highCount} finding${medCount + highCount !== 1 ? "s" : ""} detected${cweStr}. Medium-severity issues may expose your application to security risks or cause bugs in production. The AI flagged these at high confidence — address them before merging.`,
      color: "border-yellow-700/40 bg-yellow-950/20 text-yellow-300",
    };
  }
  if (riskScore === "high") {
    const cweStr = topCwe ? ` including ${topCwe}` : "";
    return {
      headline: `High-severity issues require attention`,
      detail: `${highCount} high-severity finding${highCount !== 1 ? "s" : ""}${cweStr} detected. These represent real security vulnerabilities that could be exploited in production. Do not merge without reviewing and fixing each highlighted finding.`,
      color: "border-orange-700/40 bg-orange-950/20 text-orange-300",
    };
  }
  if (riskScore === "critical") {
    const cweList = [...new Set(securityIssues.map((f) => f.cweId).filter(Boolean))].slice(0, 3).join(", ");
    return {
      headline: `⛔ Do not merge — critical vulnerabilities found`,
      detail: `${criticalCount} critical finding${criticalCount !== 1 ? "s" : ""} detected${cweList ? ` (${cweList})` : ""}. These are high-confidence, exploitable vulnerabilities that would put your users or infrastructure at immediate risk if merged. Fix all critical issues first.`,
      color: "border-red-700/50 bg-red-950/30 text-red-300",
    };
  }
  return { headline: "Analysis complete", detail: "", color: "border-border bg-secondary/30 text-foreground" };
}

export function ScanDetail() {
  const { id } = useParams();
  const scanId = parseInt(id || "0", 10);
  const { data: scan, isLoading, isError } = useGetScan(scanId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full bg-secondary" />
        <Skeleton className="h-20 w-full bg-secondary" />
        <Skeleton className="h-10 w-48 bg-secondary" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full bg-secondary" />)}
        </div>
      </div>
    );
  }

  if (isError || !scan) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 text-destructive p-6 rounded-lg flex items-center gap-3">
        <AlertCircle />
        <div>
          <h3 className="font-bold">Error loading scan</h3>
          <p className="text-sm opacity-90">Could not retrieve details for scan #{scanId}</p>
        </div>
      </div>
    );
  }

  const reason = buildRiskReason(scan.riskScore, scan.findings);
  const isRunning = scan.status === "running";

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500">
      {/* Header Panel */}
      <div className="bg-card border border-border p-6 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-1 h-full ${
          scan.riskScore === "critical" ? "bg-red-500" :
          scan.riskScore === "high" ? "bg-orange-500" :
          scan.riskScore === "medium" ? "bg-yellow-500" :
          scan.riskScore === "low" ? "bg-blue-500" :
          "bg-primary"
        }`} />

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Github size={16} />
            <span className="font-mono">{scan.repo}</span>
            <span>•</span>
            <span className="font-mono text-primary">#{scan.prNumber}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{scan.prTitle || "Pull Request"}</h1>
          <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
            <span className="flex items-center gap-1"><Cpu size={14} /> Provider: {scan.providerUsed}</span>
            <span>Time: {format(new Date(scan.timestamp), "MMM d, yyyy HH:mm:ss")}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <RiskBadge score={scan.riskScore} status={scan.status} />
          <a
            href={scan.prUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs bg-secondary hover:bg-secondary/80 text-foreground px-3 py-1.5 rounded border border-border transition-colors font-medium"
          >
            View on GitHub <ExternalLink size={14} />
          </a>
        </div>
      </div>

      {/* Risk Reason Banner */}
      {isRunning ? (
        <div className="border border-border bg-secondary/30 rounded-lg p-4 flex items-center gap-3 text-muted-foreground">
          <Loader2 size={18} className="animate-spin text-primary shrink-0" />
          <div>
            <div className="font-semibold text-foreground">Scan in progress…</div>
            <div className="text-sm mt-0.5">Gemini is analyzing the diff. This usually takes 15–30 seconds. Refresh to see results.</div>
          </div>
        </div>
      ) : (
        <div className={`border rounded-lg p-4 flex items-start gap-3 ${reason.color}`}>
          {scan.riskScore === "clean" ? (
            <ShieldCheck size={18} className="shrink-0 mt-0.5" />
          ) : scan.riskScore === "critical" ? (
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
          ) : (
            <Info size={18} className="shrink-0 mt-0.5" />
          )}
          <div>
            <div className="font-semibold">{reason.headline}</div>
            {reason.detail && <div className="text-sm mt-1 opacity-85">{reason.detail}</div>}
          </div>
        </div>
      )}

      {/* Findings List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Bug className="text-primary" size={20} />
            Findings{" "}
            <span className="text-sm font-mono bg-secondary px-2 py-0.5 rounded text-muted-foreground">
              {scan.findings.length}
            </span>
          </h2>
        </div>

        {scan.findings.length === 0 && !isRunning ? (
          <div className="bg-secondary/30 border border-border rounded-lg p-12 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
              <CheckCircle size={32} />
            </div>
            <h3 className="text-xl font-bold">No issues found</h3>
            <p className="text-muted-foreground">This PR looks clean and is ready to merge.</p>
          </div>
        ) : isRunning && scan.findings.length === 0 ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full bg-secondary" />)}
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {scan.findings.map((finding, index) => (
                <FindingCard key={index} finding={finding} index={index} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function FindingCard({ finding, index }: { finding: any; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const sevStyles: Record<string, string> = {
    critical: "text-red-400 bg-red-500/10 border-red-500/30",
    high:     "text-orange-400 bg-orange-500/10 border-orange-500/30",
    medium:   "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
    low:      "text-blue-400 bg-blue-500/10 border-blue-500/30",
  };
  const severityColor = sevStyles[finding.severity] ?? "text-muted-foreground bg-secondary border-border";

  const typeLabel: Record<string, string> = {
    security: "Security",
    performance: "Performance",
    style: "Style",
    bug: "Bug",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35 }}
      className="bg-card border border-border rounded-lg overflow-hidden"
    >
      <div
        className="p-4 md:p-5 flex flex-col gap-3 cursor-pointer hover:bg-secondary/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex justify-between items-start gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Severity badge — colored text on dark bg, always readable */}
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${severityColor}`}>
                {finding.severity}
              </span>
              <span className="px-2 py-0.5 rounded bg-secondary border border-border text-[10px] font-mono uppercase text-muted-foreground">
                {typeLabel[finding.findingType] ?? finding.findingType}
              </span>
              {finding.cweId && (
                <span className="px-2 py-0.5 rounded bg-secondary border border-border text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                  <ShieldAlert size={10} /> {finding.cweId}
                </span>
              )}
            </div>
            <h3 className="font-semibold text-foreground text-base leading-snug">{finding.description}</h3>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Confidence</div>
              <div className="text-sm font-mono font-medium text-primary">{Math.round(finding.confidence * 100)}%</div>
            </div>
            {expanded ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mt-1">
          <Code size={14} className="text-primary" />
          <span className="bg-secondary px-1.5 py-0.5 rounded border border-border">{finding.lineRef}</span>
          {finding.owaspSource && (
            <span className="text-muted-foreground/70 truncate hidden sm:block">· {finding.owaspSource}</span>
          )}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t border-border bg-secondary/10"
          >
            <div className="p-4 md:p-5 space-y-4">
              {finding.fixSuggestion && (
                <div className="space-y-2">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    Suggested Fix
                  </h4>
                  <div className="bg-background rounded-md overflow-hidden border border-border shadow-sm">
                    <CodeBlock code={finding.fixSuggestion} language="javascript" showLineNumbers />
                  </div>
                </div>
              )}

              {finding.owaspSource && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <ExternalLink size={12} />
                  Reference:{" "}
                  <span className="text-primary/80">{finding.owaspSource}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

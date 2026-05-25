import React from "react";
import { useGetStats, useListScans } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Activity, AlertTriangle, ShieldCheck, Zap, ArrowRight, ShieldAlert, Bug, Flame, ActivitySquare, Loader2 } from "lucide-react";
import { useCountUp } from "@/hooks/use-count-up";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export function Dashboard() {
  const { data: stats, isLoading: isStatsLoading } = useGetStats();
  const { data: scansList, isLoading: isScansLoading } = useListScans({ limit: 10, page: 1 });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground">AI PR security and performance analysis.</p>
      </header>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Scans" value={stats?.totalScans || 0} icon={Activity} isLoading={isStatsLoading} />
        <MetricCard
          title="Critical Findings"
          value={stats?.criticalFindings || 0}
          icon={AlertTriangle}
          isLoading={isStatsLoading}
          alert={!!stats?.criticalFindings && stats.criticalFindings > 0}
        />
        <MetricCard
          title="Avg Confidence"
          value={stats ? `${Math.round((stats.avgConfidence || 0) * 100)}%` : "0%"}
          icon={Zap}
          isLoading={isStatsLoading}
        />
        <MetricCard title="PRs Protected" value={stats?.prsProtected || 0} icon={ShieldCheck} isLoading={isStatsLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scans Table */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <ActivitySquare className="text-primary" size={20} />
              Recent Scans
            </h2>
            <Link href="/live" className="text-sm text-primary hover:underline flex items-center gap-1">
              View live feed <ArrowRight size={14} />
            </Link>
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {isScansLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full bg-secondary" />
                ))}
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3 border-b border-border">Repository</th>
                    <th className="px-4 py-3 border-b border-border">PR</th>
                    <th className="px-4 py-3 border-b border-border">Risk Score</th>
                    <th className="px-4 py-3 border-b border-border">Status</th>
                    <th className="px-4 py-3 border-b border-border text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {scansList?.scans?.map((scan) => (
                    <tr key={scan.id} className="border-b border-border hover:bg-secondary/30 transition-colors group">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <Link href={`/scan/${scan.id}`} className="hover:text-primary hover:underline">
                          {scan.repo}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        <a href={scan.prUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
                          #{scan.prNumber}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <RiskBadge score={scan.riskScore} status={scan.status} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={scan.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground font-mono text-xs">
                        {format(new Date(scan.timestamp), "HH:mm:ss")}
                      </td>
                    </tr>
                  ))}
                  {(!scansList?.scans || scansList.scans.length === 0) && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        No recent scans found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Sidebar Widgets */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <h3 className="font-bold flex items-center gap-2">
              <Bug className="text-status-orange" size={18} />
              Top CWEs
            </h3>
            {isStatsLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full bg-secondary" />)}
              </div>
            ) : (
              <ul className="space-y-2">
                {stats?.topCwes?.slice(0, 5).map((cwe) => (
                  <li key={cwe.cweId} className="flex items-center justify-between text-sm">
                    <span className="font-mono bg-secondary px-1.5 py-0.5 rounded border border-border text-foreground">
                      {cwe.cweId}
                    </span>
                    <span className="text-muted-foreground font-mono">{cwe.count}</span>
                  </li>
                ))}
                {(!stats?.topCwes || stats.topCwes.length === 0) && (
                  <li className="text-sm text-muted-foreground text-center py-2">No vulnerabilities detected.</li>
                )}
              </ul>
            )}
          </div>

          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <h3 className="font-bold flex items-center gap-2">
              <Flame className="text-destructive" size={18} />
              Findings by Severity
            </h3>
            {isStatsLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-4 w-full bg-secondary" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {["critical", "high", "medium", "low"].map((severity) => {
                  const item = stats?.findingsBySeverity?.find((s) => s.severity === severity);
                  const count = item?.count || 0;
                  const total = stats?.findingsBySeverity?.reduce((acc, curr) => acc + curr.count, 0) || 1;
                  const percentage = Math.max((count / total) * 100, 2);

                  let colorClass = "bg-status-blue";
                  if (severity === "critical") colorClass = "bg-status-red";
                  if (severity === "high") colorClass = "bg-status-orange";
                  if (severity === "medium") colorClass = "bg-status-yellow";

                  return (
                    <div key={severity} className="space-y-1">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="uppercase text-muted-foreground">{severity}</span>
                        <span className="text-foreground">{count}</span>
                      </div>
                      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full ${colorClass} transition-all duration-1000`}
                          style={{ width: `${count === 0 ? 0 : percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, isLoading, alert = false }: any) {
  const isNumber = typeof value === "number";
  const displayValue = isNumber ? useCountUp(value as number) : value;

  return (
    <div className="bg-card border border-border rounded-lg p-5 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
        <Icon size={48} />
      </div>
      <div className="relative z-10 flex flex-col gap-2">
        <div className="flex justify-between items-start">
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
          <div className={`p-1.5 rounded-md ${alert ? "bg-destructive/10 text-destructive animate-pulse" : "bg-secondary text-primary"}`}>
            <Icon size={16} />
          </div>
        </div>
        <div>
          {isLoading ? (
            <Skeleton className="h-8 w-24 bg-secondary" />
          ) : (
            <span className={`text-3xl font-bold font-mono tracking-tighter ${alert ? "text-destructive" : "text-foreground"}`}>
              {displayValue}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border bg-status-yellow/10 text-status-yellow border-status-yellow/30">
        <Loader2 size={10} className="animate-spin" /> scanning
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-primary/10 text-primary border-primary/20">
        completed
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-destructive/10 text-destructive border-destructive/20">
        failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-secondary text-muted-foreground border-border">
      {status}
    </span>
  );
}

export function RiskBadge({ score, status }: { score: string; status?: string }) {
  // While scan is running, show a spinner badge instead of the placeholder "clean"
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider border bg-secondary text-muted-foreground border-border">
        <Loader2 size={10} className="animate-spin" /> scanning
      </span>
    );
  }

  // Solid fill with white text — always readable on any background
  const styles: Record<string, string> = {
    critical: "bg-red-500 text-white border-red-500 shadow-red-500/30 shadow-sm",
    high:     "bg-orange-500 text-white border-orange-500",
    medium:   "bg-yellow-500 text-gray-900 border-yellow-500",
    low:      "bg-blue-500 text-white border-blue-500",
    clean:    "bg-emerald-500 text-white border-emerald-500",
    pending:  "bg-secondary text-muted-foreground border-border",
  };

  const style = styles[score] ?? styles.pending;
  const pulse = score === "critical";

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider border ${style}`}>
      {pulse && <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping shrink-0" />}
      {score}
    </span>
  );
}

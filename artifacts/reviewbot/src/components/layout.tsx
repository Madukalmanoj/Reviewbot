import React from "react";
import { Link, useLocation } from "wouter";
import { Activity, LayoutDashboard, Radio, Settings, ShieldAlert, GitPullRequest, Code2 } from "lucide-react";
import { useHealthCheck } from "@workspace/api-client-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: health, isLoading, isError } = useHealthCheck();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/live", label: "Live Feed", icon: Radio },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-sidebar flex flex-col z-10 shrink-0">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary/20 text-primary flex items-center justify-center border border-primary/30">
              <ShieldAlert size={18} />
            </div>
            <h1 className="font-sans font-bold text-xl tracking-tight uppercase text-primary">
              ReviewBot
            </h1>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (location.startsWith("/scan") && item.href === "/");
            return (
              <Link key={item.href} href={item.href} className="block">
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                    isActive
                      ? "bg-secondary text-primary font-medium"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="bg-secondary rounded-md p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">System Status</span>
              <div className="flex items-center gap-1.5">
                <div 
                  className={`w-2 h-2 rounded-full ${
                    isLoading ? "bg-status-yellow animate-pulse" : 
                    isError || health?.status !== "ok" ? "bg-status-red" : "bg-primary"
                  }`}
                  style={{
                    boxShadow: !isLoading && !isError && health?.status === "ok" ? "0 0 8px var(--accent-color)" : "none"
                  }}
                />
                <span className="text-xs font-mono text-foreground">
                  {isLoading ? "CONNECTING" : isError || health?.status !== "ok" ? "OFFLINE" : "ONLINE"}
                </span>
              </div>
            </div>
            {!isLoading && !isError && health && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">Provider</span>
                <span className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                  {health.activeLlmProvider || "UNKNOWN"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

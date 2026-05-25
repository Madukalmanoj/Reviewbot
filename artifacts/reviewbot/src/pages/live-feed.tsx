import React, { useEffect, useRef } from "react";
import { useSSE } from "@/hooks/use-sse";
import { Terminal, Activity, AlertTriangle, CheckCircle, Info, WifiOff } from "lucide-react";
import { format } from "date-fns";

export function LiveFeed() {
  const { events, isConnected, status } = useSSE("/api/events");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const statusLabel =
    status === "connected" ? "CONNECTED" :
    status === "unavailable" ? "SERVERLESS — NOT AVAILABLE" :
    status === "connecting" ? "CONNECTING…" :
    "DISCONNECTED";

  const statusColor =
    status === "connected" ? "bg-primary animate-pulse" :
    status === "unavailable" ? "bg-status-yellow" :
    "bg-destructive";

  return (
    <div className="space-y-6 h-[calc(100vh-6rem)] flex flex-col animate-in fade-in duration-500">
      <header className="space-y-1 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Terminal className="text-primary" />
            Live Feed
          </h1>
          <p className="text-muted-foreground">Real-time system events and analysis logs.</p>
        </div>
        <div className="flex items-center gap-2 font-mono text-sm bg-secondary px-3 py-1.5 rounded-md border border-border">
          <div className={`w-2 h-2 rounded-full ${statusColor}`} />
          {statusLabel}
        </div>
      </header>

      {/* Serverless notice */}
      {status === "unavailable" && (
        <div className="shrink-0 flex items-start gap-3 border border-status-yellow/40 bg-status-yellow/10 text-status-yellow rounded-lg px-4 py-3 text-sm">
          <WifiOff size={16} className="shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Live feed unavailable on Vercel serverless.</span>
            {" "}Scan logs are written to the database — check individual scan results on the{" "}
            <a href="/" className="underline underline-offset-2 hover:opacity-80">Dashboard</a>.
          </div>
        </div>
      )}

      <div className="flex-1 bg-black/40 border border-border rounded-lg overflow-hidden flex flex-col font-mono text-sm relative">
        {/* Terminal Header */}
        <div className="bg-secondary/50 border-b border-border p-2 flex items-center gap-2 shrink-0">
          <div className="flex gap-1.5 px-2">
            <div className="w-3 h-3 rounded-full bg-destructive/80" />
            <div className="w-3 h-3 rounded-full bg-status-yellow/80" />
            <div className="w-3 h-3 rounded-full bg-primary/80" />
          </div>
          <span className="text-xs text-muted-foreground ml-2">reviewbot-tty1</span>
        </div>
        
        {/* Terminal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {status === "unavailable" ? (
            <div className="text-status-yellow/70 italic opacity-80 flex items-center gap-2">
              <WifiOff size={14} />
              SSE not supported in serverless mode.
            </div>
          ) : events.length === 0 ? (
            <div className="text-muted-foreground italic opacity-50 flex items-center gap-2">
              <Activity className="animate-spin" size={14} />
              Waiting for events...
            </div>
          ) : (
            events.map((event, i) => (
              <div key={i} className="flex items-start gap-3 hover:bg-secondary/20 rounded px-2 py-1 transition-colors">
                <div className="text-muted-foreground shrink-0 w-24">
                  {format(new Date(event.timestamp || Date.now()), "HH:mm:ss.SSS")}
                </div>
                
                <div className="shrink-0 w-8 flex justify-center mt-0.5">
                  {event.level === "info" && <Info size={14} className="text-status-blue" />}
                  {event.level === "warn" && <AlertTriangle size={14} className="text-status-yellow" />}
                  {event.level === "error" && <AlertTriangle size={14} className="text-destructive" />}
                  {event.level === "success" && <CheckCircle size={14} className="text-primary" />}
                </div>

                <div className="flex-1 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 break-all">
                  <span className={`
                    ${event.level === "error" ? "text-destructive" : ""}
                    ${event.level === "warn" ? "text-status-yellow" : ""}
                    ${event.level === "success" ? "text-primary" : "text-foreground"}
                  `}>
                    {event.message}
                  </span>
                  
                  {(event.repo || event.pr) && (
                    <div className="flex items-center gap-2 text-xs opacity-60">
                      {event.repo && <span className="bg-secondary px-1.5 rounded">{event.repo}</span>}
                      {event.pr && <span>#{event.pr}</span>}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

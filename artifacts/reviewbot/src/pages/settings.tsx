import React, { useState, useEffect, useRef } from "react";
import { useGetSettings, useUpdateSettings, useTriggerScan } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  Settings as SettingsIcon,
  Save,
  Zap,
  AlertCircle,
  Link as LinkIcon,
  Lock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Github,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsActiveProvider } from "@workspace/api-client-react/src/generated/api.schemas";

interface GitHubVerifyResult {
  connected: boolean;
  identity: {
    login: string;
    name: string | null;
    avatarUrl: string;
    htmlUrl: string;
    type: "user" | "bot";
  } | null;
  error: string | null;
}

function useGitHubVerify(enabled: boolean) {
  return useQuery<GitHubVerifyResult>({
    queryKey: ["github-verify"],
    queryFn: async () => {
      const res = await fetch("/api/github/verify");
      if (!res.ok) throw new Error("Failed to verify");
      return res.json() as Promise<GitHubVerifyResult>;
    },
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

function GitHubStatusBadge({ result, isLoading }: { result?: GitHubVerifyResult; isLoading: boolean }) {
  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" /> Checking…
      </span>
    );
  }
  if (!result) return null;
  if (result.connected && result.identity) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
        <CheckCircle2 size={13} />
        Connected as{" "}
        <a
          href={result.identity.htmlUrl}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-emerald-300 flex items-center gap-0.5"
        >
          @{result.identity.login} <ExternalLink size={10} />
        </a>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-red-400 font-medium">
      <XCircle size={13} />
      {result.error ?? "Not connected"}
    </span>
  );
}

export function SettingsPage() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const triggerScan = useTriggerScan();
  const { toast } = useToast();

  const [formData, setFormData] = useState<any>({});
  const [scanRepo, setScanRepo] = useState("");
  const [scanPr, setScanPr] = useState("");
  const [verifyEnabled, setVerifyEnabled] = useState(false);

  const initializedRef = useRef(false);

  const {
    data: ghVerify,
    isLoading: ghVerifyLoading,
    refetch: refetchVerify,
    isFetching: ghVerifyFetching,
  } = useGitHubVerify(verifyEnabled);

  useEffect(() => {
    if (settings && !initializedRef.current) {
      setFormData(settings);
      initializedRef.current = true;
      // Auto-check connection status on load if token is already configured
      if (settings.githubToken) setVerifyEnabled(true);
    }
  }, [settings]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate(
      { data: formData },
      {
        onSuccess: () => {
          toast({ title: "Settings saved", description: "Configuration updated successfully." });
          // Re-verify GitHub connection after saving new token
          setVerifyEnabled(true);
          setTimeout(() => refetchVerify(), 500);
        },
        onError: () => {
          toast({ title: "Failed to save settings", variant: "destructive" });
        },
      }
    );
  };

  const handleTriggerScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanRepo || !scanPr) return;

    // Strip full GitHub URLs down to owner/repo
    const normalizedRepo = scanRepo
      .replace(/^https?:\/\/github\.com\//, "")
      .replace(/\/$/, "")
      .trim();

    if (!/^[\w.-]+\/[\w.-]+$/.test(normalizedRepo)) {
      toast({
        title: "Invalid repository format",
        description: 'Use owner/repo format — e.g. "Madukalmanoj/TenderMind-AI"',
        variant: "destructive",
      });
      return;
    }
    setScanRepo(normalizedRepo);

    triggerScan.mutate(
      { data: { repoFullName: normalizedRepo, prNumber: parseInt(scanPr, 10) } },
      {
        onSuccess: (data) => {
          toast({ title: "Scan triggered", description: data.message });
          setScanRepo("");
          setScanPr("");
        },
        onError: () => {
          toast({ title: "Failed to trigger scan", variant: "destructive" });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <Skeleton className="h-8 w-48 bg-secondary" />
          <Skeleton className="h-4 w-64 bg-secondary" />
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-96 w-full bg-secondary" />
          <Skeleton className="h-64 w-full bg-secondary" />
        </div>
      </div>
    );
  }

  const tokenIsConfigured = !!settings?.githubToken;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="text-primary" />
          Settings
        </h1>
        <p className="text-muted-foreground">Configure LLM providers and GitHub integration.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="space-y-6 bg-card border border-border rounded-lg p-6">

            {/* ── LLM Configuration ── */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold border-b border-border pb-2">LLM Configuration</h2>

              <div className="space-y-2">
                <label className="text-sm font-medium">Active Provider</label>
                <select
                  className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                  value={formData.activeProvider || "gemini"}
                  onChange={(e) =>
                    setFormData({ ...formData, activeProvider: e.target.value as SettingsActiveProvider })
                  }
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="groq">Groq</option>
                  <option value="ollama">Ollama (Local)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Lock size={14} className="text-muted-foreground" /> Gemini API Key
                  </label>
                  <input
                    type="password"
                    className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-primary outline-none transition-all"
                    value={formData.geminiApiKey || ""}
                    onChange={(e) => setFormData({ ...formData, geminiApiKey: e.target.value })}
                    placeholder="AIzaSy…"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Lock size={14} className="text-muted-foreground" /> Groq API Key
                  </label>
                  <input
                    type="password"
                    className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-primary outline-none transition-all"
                    value={formData.groqApiKey || ""}
                    onChange={(e) => setFormData({ ...formData, groqApiKey: e.target.value })}
                    placeholder="gsk_…"
                  />
                </div>
              </div>

              {formData.activeProvider === "ollama" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Ollama Host</label>
                    <input
                      type="text"
                      className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-primary outline-none transition-all"
                      value={formData.ollamaHost || ""}
                      onChange={(e) => setFormData({ ...formData, ollamaHost: e.target.value })}
                      placeholder="http://localhost:11434"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Ollama Model</label>
                    <input
                      type="text"
                      className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-primary outline-none transition-all"
                      value={formData.ollamaModel || ""}
                      onChange={(e) => setFormData({ ...formData, ollamaModel: e.target.value })}
                      placeholder="llama3"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── GitHub Integration ── */}
            <div className="space-y-4 pt-4">
              <h2 className="text-xl font-bold border-b border-border pb-2 flex items-center gap-2">
                <Github size={18} /> GitHub Integration
              </h2>

              {/* Connection Status Banner */}
              <div
                className={`flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-all ${
                  ghVerify?.connected
                    ? "bg-emerald-950/40 border-emerald-700/50"
                    : ghVerify && !ghVerify.connected
                    ? "bg-red-950/30 border-red-700/40"
                    : "bg-secondary/40 border-border"
                }`}
              >
                <div className="flex items-center gap-3">
                  {ghVerify?.connected && ghVerify.identity ? (
                    <>
                      <img
                        src={ghVerify.identity.avatarUrl}
                        alt={ghVerify.identity.login}
                        className="w-7 h-7 rounded-full ring-1 ring-emerald-600"
                      />
                      <div>
                        <div className="font-medium text-emerald-300 flex items-center gap-1.5">
                          <CheckCircle2 size={14} /> GitHub Connected
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Signed in as{" "}
                          <a
                            href={ghVerify.identity.htmlUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-400 hover:underline"
                          >
                            @{ghVerify.identity.login}
                          </a>
                          {ghVerify.identity.name && ` · ${ghVerify.identity.name}`}
                        </div>
                      </div>
                    </>
                  ) : ghVerify && !ghVerify.connected ? (
                    <div>
                      <div className="font-medium text-red-400 flex items-center gap-1.5">
                        <XCircle size={14} /> Not Connected
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {ghVerify.error ?? "Token invalid or missing"}
                      </div>
                    </div>
                  ) : (
                    <div className="text-muted-foreground flex items-center gap-2">
                      {ghVerifyLoading || ghVerifyFetching ? (
                        <><Loader2 size={14} className="animate-spin" /> Verifying connection…</>
                      ) : (
                        <>{tokenIsConfigured ? "Token saved — click Verify to check" : "No token configured yet"}</>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setVerifyEnabled(true);
                    refetchVerify();
                  }}
                  disabled={ghVerifyLoading || ghVerifyFetching}
                  className="flex items-center gap-1.5 text-xs bg-secondary hover:bg-secondary/80 border border-border px-3 py-1.5 rounded-md transition-all disabled:opacity-50"
                >
                  <RefreshCw size={12} className={ghVerifyFetching ? "animate-spin" : ""} />
                  {ghVerifyFetching ? "Checking…" : "Verify"}
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Lock size={14} className="text-muted-foreground" /> GitHub Personal Access Token
                </label>
                <input
                  type="password"
                  className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-primary outline-none transition-all"
                  value={formData.githubToken || ""}
                  onChange={(e) => setFormData({ ...formData, githubToken: e.target.value })}
                  placeholder="ghp_…"
                />
                <p className="text-xs text-muted-foreground">
                  Fine-grained PAT with <code className="text-primary/80">pull_requests: write</code> and{" "}
                  <code className="text-primary/80">contents: read</code> permissions. Used to fetch PR diffs and post review comments.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Lock size={14} className="text-muted-foreground" /> Webhook Secret
                </label>
                <input
                  type="password"
                  className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-primary outline-none transition-all"
                  value={formData.webhookSecret || ""}
                  onChange={(e) => setFormData({ ...formData, webhookSecret: e.target.value })}
                  placeholder="any strong random string"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <LinkIcon size={14} className="text-muted-foreground" /> Webhook Payload URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    className="w-full bg-black/40 border border-border rounded-md px-3 py-2 text-sm font-mono text-muted-foreground cursor-not-allowed"
                    value={settings?.webhookUrl || `${window.location.origin}/api/webhook`}
                  />
                  <button
                    type="button"
                    className="bg-secondary hover:bg-secondary/80 px-3 py-2 rounded-md border border-border transition-colors text-sm whitespace-nowrap"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        settings?.webhookUrl || `${window.location.origin}/api/webhook`
                      );
                      toast({ title: "Copied to clipboard" });
                    }}
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste this into your GitHub repo → Settings → Webhooks → Payload URL.
                </p>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={updateSettings.isPending}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-bold text-sm flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {updateSettings.isPending ? (
                  <><Loader2 size={16} className="animate-spin" /> Saving…</>
                ) : (
                  <><Save size={16} /> Save Configuration</>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* ── Manual Trigger Panel ── */}
        <div className="space-y-6">
          <form
            onSubmit={handleTriggerScan}
            className="bg-card border border-border rounded-lg p-6 space-y-4"
          >
            <h2 className="text-xl font-bold border-b border-border pb-2 flex items-center gap-2">
              <Zap size={20} className="text-status-yellow" />
              Manual Scan
            </h2>
            <p className="text-sm text-muted-foreground">
              Trigger a scan manually without a webhook event.
              {!ghVerify?.connected && (
                <span className="block mt-1 text-amber-400/80">
                  No GitHub token — will run with demo diff.
                </span>
              )}
            </p>

            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Repository
                </label>
                <input
                  type="text"
                  required
                  className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-primary outline-none"
                  value={scanRepo}
                  onChange={(e) => setScanRepo(e.target.value)}
                  placeholder="owner/repo"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  PR Number
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-primary outline-none"
                  value={scanPr}
                  onChange={(e) => setScanPr(e.target.value)}
                  placeholder="123"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={triggerScan.isPending}
              className="w-full mt-2 bg-secondary hover:bg-secondary/80 text-foreground px-4 py-2 rounded-md font-bold text-sm flex items-center justify-center gap-2 border border-border transition-all disabled:opacity-50"
            >
              {triggerScan.isPending ? (
                <><Loader2 size={16} className="animate-spin" /> Running…</>
              ) : (
                "Scan Pull Request"
              )}
            </button>

            {triggerScan.isError && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>Failed to trigger scan. Check repository access and token.</span>
              </div>
            )}

            {triggerScan.isSuccess && (
              <div className="mt-4 p-3 bg-emerald-950/40 border border-emerald-700/40 text-emerald-400 text-sm rounded-md flex items-start gap-2">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                <span>Scan started! Watch progress in the Live Feed.</span>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Activity, DollarSign, RefreshCw, AlertCircle } from "lucide-react";

// One row of the LLM call log (mirrors api/migrations/stage6_llm_api_logs.sql).
interface LlmLog {
  id: string;
  provider: string;
  model: string;
  purpose: string;
  route: string | null;
  source: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
  latency_ms: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface Aggregates {
  callsToday: number; costToday: number;
  calls7d: number; cost7d: number;
  calls30d: number; cost30d: number;
  byPurpose: Record<string, { calls: number; cost: number }>;
}

interface Props {
  api: string;
  token: () => string;
}

const fmtUsd = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const fmtNum = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString());
const fmtTime = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const PROVIDER_BADGE: Record<string, string> = {
  anthropic: "bg-primary/15 text-primary",
  openai: "bg-emerald-500/15 text-emerald-400",
};
const SOURCE_BADGE: Record<string, string> = {
  user: "bg-blue-500/15 text-blue-400",
  internal: "bg-amber-500/15 text-amber-400",
  "job-pipeline": "bg-purple-500/15 text-purple-400",
};

export default function ApiUsageTab({ api, token }: Props) {
  const [logs, setLogs] = useState<LlmLog[]>([]);
  const [agg, setAgg] = useState<Aggregates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [since, setSince] = useState(7);
  const [provider, setProvider] = useState("");
  const [purpose, setPurpose] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ since: String(since), limit: "500" });
      if (provider) params.set("provider", provider);
      if (purpose) params.set("purpose", purpose);
      const res = await fetch(`${api}/llm-logs?${params}`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      setLogs(data.logs ?? []);
      setAgg(data.aggregates ?? null);
    } catch (err: any) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [api, token, since, provider, purpose]);

  useEffect(() => { load(); }, [load]);

  // Distinct purposes for the filter dropdown — from the aggregate breakdown so
  // the option list is stable even when the purpose filter narrows the table.
  const purposeOptions = useMemo(
    () => Object.keys(agg?.byPurpose ?? {}).sort(),
    [agg],
  );
  const topPurpose = useMemo(() => {
    const entries = Object.entries(agg?.byPurpose ?? {});
    if (!entries.length) return null;
    return entries.sort((a, b) => b[1].cost - a[1].cost)[0];
  }, [agg]);

  const cards = [
    { label: "Calls today", value: fmtNum(agg?.callsToday ?? 0), sub: fmtUsd(agg?.costToday ?? 0), icon: Activity },
    { label: "Calls (7d)", value: fmtNum(agg?.calls7d ?? 0), sub: fmtUsd(agg?.cost7d ?? 0), icon: Activity },
    { label: "Cost (7d)", value: fmtUsd(agg?.cost7d ?? 0), sub: `${fmtNum(agg?.calls7d ?? 0)} calls`, icon: DollarSign },
    { label: "Cost (30d)", value: fmtUsd(agg?.cost30d ?? 0), sub: topPurpose ? `top: ${topPurpose[0]}` : "—", icon: DollarSign },
  ];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-label">{c.label}</span>
                  <Icon className="h-4 w-4 text-primary/70" />
                </div>
                <div className="mt-2 text-2xl font-black tabular-nums gradient-text">{c.value}</div>
                <div className="text-[11px] text-muted-foreground/70 mt-0.5">{c.sub}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={since}
          onChange={(e) => setSince(Number(e.target.value))}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary/50"
          aria-label="Time range"
        >
          <option value={1}>Last 24h</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
        </select>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary/50"
          aria-label="Provider"
        >
          <option value="">All providers</option>
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
        </select>
        <select
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary/50"
          aria-label="Purpose"
        >
          <option value="">All purposes</option>
          {purposeOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button
          type="button"
          onClick={load}
          className="ml-auto flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Log table */}
      <Card className="border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium font-label">Time</th>
                <th className="px-3 py-2 font-medium font-label">Purpose</th>
                <th className="px-3 py-2 font-medium font-label">Provider</th>
                <th className="px-3 py-2 font-medium font-label">Model</th>
                <th className="px-3 py-2 font-medium font-label">Source</th>
                <th className="px-3 py-2 font-medium font-label text-right">In</th>
                <th className="px-3 py-2 font-medium font-label text-right">Out</th>
                <th className="px-3 py-2 font-medium font-label text-right">Cost</th>
                <th className="px-3 py-2 font-medium font-label text-right">Latency</th>
                <th className="px-3 py-2 font-medium font-label">Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-border/40 hover:bg-muted/40">
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtTime(l.created_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-medium">{l.purpose}</td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", PROVIDER_BADGE[l.provider] ?? "bg-muted text-muted-foreground")}>
                      {l.provider}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{l.model}</td>
                  <td className="px-3 py-2">
                    {l.source && (
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", SOURCE_BADGE[l.source] ?? "bg-muted text-muted-foreground")}>
                        {l.source}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtNum(l.input_tokens)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtNum(l.output_tokens)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtUsd(l.cost_usd)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{l.latency_ms == null ? "—" : `${l.latency_ms}ms`}</td>
                  <td className="px-3 py-2">
                    {l.status === "success" ? (
                      <span className="text-emerald-500">ok</span>
                    ) : (
                      <span className="text-destructive" title={l.error_message ?? undefined}>error</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && logs.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">No API calls logged in this window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

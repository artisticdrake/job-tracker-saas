import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, LabelList, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Clock, Users, Award, Target, DollarSign, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/useCountUp";

/* ── Palette ─────────────────────────────────────────────────────────────── */
const CHART_COLORS = [
  "#41e4c0", "#b9c7e4", "#bcc6e5", "#5ffbd6",
  "#74829d", "#38debb", "#d8e2ff", "#253453",
];

const TOOLTIP_STYLE: React.CSSProperties = {
  background: "rgba(37, 52, 83, 0.9)",
  border: "1px solid rgba(65, 228, 192, 0.15)",
  borderRadius: "8px",
  fontSize: 12,
  color: "hsl(225 100% 92%)",
  boxShadow: "0 4px 20px rgba(0, 13, 39, 0.4), 0 12px 40px rgba(0, 0, 0, 0.2)",
  backdropFilter: "blur(12px)",
};
const TICK_STYLE = { fontSize: 11, fill: "#94a3b8" };

/* ── Types ───────────────────────────────────────────────────────────────── */
interface AnalyticsStats {
  total: number;
  statusCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  weeks: { week: string; count: number | unknown }[];
  medianSalary: number | null;
  medianTargetSalary: number | null;
  responseRate: string | number;
  avgDaysToReject: string | null;
  avgDaysToAdvance: string | null;
  stalePipelineCount: number;
  screeningConversion: string | number;
  interviewConversion: string | number;
  offerConversion: string | number;
}

interface AnalyticsTabProps {
  stats: AnalyticsStats;
  pieData: { name: string; value: unknown }[];
  sourceData: { name: string; value: unknown }[];
  monthData: { month: string; count: number }[];
  locationData: { name: string; value: number }[];
  repeatCompanies: { company: string; count: number }[];
  salaryBuckets: { name: string; value: number }[];
  coverLetterImpact: { label: string; count: number; responseRate: number | null }[];
}

/* ── Metric config ───────────────────────────────────────────────────────── */
const METRIC_CONFIG = [
  { key: "responseRate",        label: "Response Rate",      icon: TrendingUp,   iconBg: "bg-primary/15",    iconColor: "text-primary",     numColor: "gradient-text",    kind: "percent" },
  { key: "avgDaysToAdvance",    label: "Avg. to Advance",    icon: TrendingUp,   iconBg: "bg-emerald-500/15",iconColor: "text-emerald-400", numColor: "text-emerald-600 dark:text-emerald-300", kind: "days" },
  { key: "avgDaysToReject",     label: "Avg. to Reject",     icon: Clock,        iconBg: "bg-rose-500/15",   iconColor: "text-rose-400",    numColor: "text-rose-600 dark:text-rose-300", kind: "days" },
  { key: "stalePipelineCount",  label: "Stuck >14d",         icon: AlertTriangle,iconBg: "bg-orange-500/15", iconColor: "text-orange-400",  numColor: "text-orange-600 dark:text-orange-300", kind: "count" },
  { key: "screeningConversion", label: "Screening Rate",     icon: Users,        iconBg: "bg-primary/10",    iconColor: "text-primary",     numColor: "gradient-text-cyan", kind: "percent" },
  { key: "interviewConversion", label: "Interview Rate",     icon: Target,       iconBg: "bg-amber-500/15",  iconColor: "text-amber-400",   numColor: "text-amber-600 dark:text-amber-300",   kind: "percent" },
  { key: "offerConversion",     label: "Offer Rate",         icon: Award,        iconBg: "bg-emerald-500/15",iconColor: "text-emerald-400", numColor: "text-emerald-600 dark:text-emerald-300", kind: "percent" },
  { key: "medianSalary",        label: "Median Offer",       icon: DollarSign,   iconBg: "bg-primary/15",    iconColor: "text-primary",     numColor: "gradient-text",    kind: "salary" },
  { key: "medianTargetSalary",  label: "Median Target Pay",  icon: DollarSign,   iconBg: "bg-blue-500/15",   iconColor: "text-blue-400",    numColor: "text-blue-600 dark:text-blue-300", kind: "salary" },
];

/* ── Metric Card (with count-up) ─────────────────────────────────────────── */
function MetricCard({ cfg, raw, index }: { cfg: typeof METRIC_CONFIG[0]; raw: string | number | null; index: number }) {
  const STAGGER = ["stagger-1","stagger-2","stagger-3","stagger-4","stagger-5","stagger-6"];
  const numericVal = typeof raw === "number" ? raw : parseFloat(String(raw ?? 0)) || 0;
  const animated = useCountUp(Math.round(numericVal), 800);
  const Icon = cfg.icon;

  let display: string;
  if (raw == null || raw === "—") {
    display = "—";
  } else if (cfg.kind === "salary") {
    display = `$${Math.round(numericVal).toLocaleString()}`;
  } else if (cfg.kind === "days") {
    display = `${animated}d`;
  } else if (cfg.kind === "count") {
    display = `${animated}`;
  } else {
    display = `${animated}%`;
  }

  return (
    <div className={cn(
      "group relative overflow-hidden rounded-xl border border-white/[0.06] tonal-lift p-5 transition-all duration-300 hover:border-white/[0.12] animate-slide-up",
      STAGGER[index % STAGGER.length]
    )}>
      {/* Left accent notch on hover */}
      <div className="absolute left-0 top-0 h-full w-0.5 bg-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="relative">
        <div className="flex items-center justify-between mb-3.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60">
            {cfg.label}
          </span>
          <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", cfg.iconBg)}>
            <Icon className={cn("h-3 w-3", cfg.iconColor)} />
          </span>
        </div>
        <p className={cn("text-3xl font-black tabular-nums leading-none tracking-tight number-pop", cfg.numColor)}>
          {display}
        </p>
      </div>
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-52 flex flex-col items-center justify-center gap-2">
      <div className="h-10 w-10 rounded-2xl border border-border/50 bg-muted/30 dark:border-white/[0.06] dark:bg-white/[0.03] flex items-center justify-center">
        <TrendingUp className="h-4 w-4 text-muted-foreground/20" />
      </div>
      <span className="text-xs text-muted-foreground/40">No {label.toLowerCase()} data yet</span>
    </div>
  );
}

/* ── Chart card wrapper ──────────────────────────────────────────────────── */
function ChartCard({ title, children, delay = "" }: { title: string; children: React.ReactNode; delay?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl glass animate-slide-up", delay)}>
      <div className="px-5 pt-5 pb-2">
        <h3 className="text-[13px] font-semibold text-foreground/80 font-headline">{title}</h3>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}

/* ── Monthly bar chart ───────────────────────────────────────────────────── */
function MonthlyChart({ data }: { data: { month: string; count: number }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const avg = data.reduce((s, d) => s + d.count, 0) / (data.length || 1);

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: -20 }} barCategoryGap="36%">
          <defs>
            {/* normal bar gradient */}
            <linearGradient id="mbarNorm" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#41e4c0" stopOpacity={0.85} />
              <stop offset="100%" stopColor="#41e4c0" stopOpacity={0.25} />
            </linearGradient>
            {/* peak bar gradient — brighter, near-white top */}
            <linearGradient id="mbarPeak" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#ffffff" stopOpacity={0.95} />
              <stop offset="25%"  stopColor="#5ffbd6" stopOpacity={1}    />
              <stop offset="100%" stopColor="#41e4c0" stopOpacity={0.55} />
            </linearGradient>
            {/* subtle glow filter for peak bar */}
            <filter id="peakGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />

          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />

          {/* average reference line */}
          <ReferenceLine
            y={avg}
            stroke="rgba(255,255,255,0.10)"
            strokeDasharray="4 4"
            label={{
              value: `avg ${avg.toFixed(1)}`,
              position: "insideTopRight",
              fontSize: 10,
              fill: "rgba(255,255,255,0.25)",
              fontWeight: 600,
            }}
          />

          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={false}
            formatter={(v: number) => [v, "Applications"]}
            labelStyle={{ color: "#41e4c0", fontWeight: 700, marginBottom: 2 }}
          />

          <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={56} isAnimationActive={false} activeBar={false}>
            <LabelList
              dataKey="count"
              position="top"
              style={{ fontSize: 10, fill: "#64748b", fontWeight: 700 }}
            />
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.count === maxCount ? "url(#mbarPeak)" : "url(#mbarNorm)"}
                filter={entry.count === maxCount ? "url(#peakGlow)" : undefined}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export default function AnalyticsTab({ stats, pieData, sourceData, monthData, locationData, repeatCompanies, salaryBuckets, coverLetterImpact }: AnalyticsTabProps) {
  const getRaw = (key: string): string | number | null => {
    if (key === "medianSalary") return stats.medianSalary;
    if (key === "medianTargetSalary") return stats.medianTargetSalary;
    if (key === "avgDaysToReject") return stats.avgDaysToReject ? parseFloat(stats.avgDaysToReject) : null;
    if (key === "avgDaysToAdvance") return stats.avgDaysToAdvance ? parseFloat(stats.avgDaysToAdvance) : null;
    return (stats as unknown as Record<string, unknown>)[key] as string | number | null;
  };

  const funnelData = [
    { stage: "Applied",   count: stats.statusCounts["Applied"] ?? 0,   color: "#b9c7e4", bg: "#b9c7e4" },
    { stage: "Screening", count: stats.statusCounts["Screening"] ?? 0, color: "#fbbf24", bg: "#fbbf24" },
    {
      stage: "Interview",
      count: (stats.statusCounts["Interview Scheduled"] ?? 0) + (stats.statusCounts["Interview Completed"] ?? 0),
      color: "#5ffbd6", bg: "#5ffbd6",
    },
    { stage: "Offer",     count: stats.statusCounts["Offer"] ?? 0,     color: "#41e4c0", bg: "#41e4c0" },
  ];
  const funnelMax = funnelData[0]?.count || 1;

  return (
    <div className="space-y-5">

      {/* ── Metric cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-9 gap-3">
        {METRIC_CONFIG.map((cfg, i) => (
          <MetricCard key={cfg.key} cfg={cfg} raw={getRaw(cfg.key)} index={i} />
        ))}
      </div>

      {/* ── Applications per Month ─────────────────────────────────── */}
      <ChartCard title="Applications per Month" delay="stagger-2">
        {monthData.length === 0 ? <EmptyChart label="monthly" /> : <MonthlyChart data={monthData} />}
      </ChartCard>

      {/* ── Charts ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Status Distribution */}
        <ChartCard title="Status Distribution" delay="stagger-1">
          {pieData.length === 0 ? <EmptyChart label="status" /> : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <defs>
                    {CHART_COLORS.map((c, i) => (
                      <radialGradient key={i} id={`pie-grad-${i}`} cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor={c} stopOpacity={1} />
                        <stop offset="100%" stopColor={c} stopOpacity={0.7} />
                      </radialGradient>
                    ))}
                  </defs>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    outerRadius={80} innerRadius={32}
                    dataKey="value"
                    paddingAngle={3}
                    label={({ name, percent }) =>
                      percent > 0.06 ? `${name} ${(percent * 100).toFixed(0)}%` : ""
                    }
                    labelLine={false}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={`url(#pie-grad-${i % CHART_COLORS.length})`} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {/* Application Sources */}
        <ChartCard title="Application Sources" delay="stagger-2">
          {sourceData.length === 0 ? <EmptyChart label="source" /> : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceData} margin={{ top: 4, right: 4, bottom: 4, left: -24 }}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#41e4c0" stopOpacity={1}   />
                      <stop offset="100%" stopColor="#38debb" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="name" tick={TICK_STYLE} tickLine={false} axisLine={false} />
                  <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="value" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {/* Top Locations */}
        <ChartCard title="Top Locations" delay="stagger-3">
          {locationData.length === 0 ? <EmptyChart label="location" /> : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={locationData} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <defs>
                    <linearGradient id="locBarGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%"   stopColor="#38debb" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#41e4c0" stopOpacity={1}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                  <XAxis type="number" tick={TICK_STYLE} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ ...TICK_STYLE, fontSize: 10 }} tickLine={false} axisLine={false} width={100} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="value" fill="url(#locBarGrad)" radius={[0, 6, 6, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {/* Application Trend */}
        <ChartCard title="Application Trend" delay="stagger-4">
          {stats.weeks.length === 0 ? <EmptyChart label="trend" /> : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.weeks} margin={{ top: 4, right: 4, bottom: 4, left: -24 }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#41e4c0" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#41e4c0" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="week" tick={TICK_STYLE} tickLine={false} axisLine={false} />
                  <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Area
                    type="monotone" dataKey="count"
                    stroke="#41e4c0" fill="url(#areaGrad)"
                    strokeWidth={2.5}
                    dot={{ fill: "#41e4c0", strokeWidth: 0, r: 3.5 }}
                    activeDot={{ r: 5, strokeWidth: 0, fill: "#5ffbd6" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {/* Application Funnel */}
        <ChartCard title="Application Funnel" delay="stagger-5">
          <div className="space-y-4 pt-2">
            {funnelData.map(({ stage, count, color, bg }) => {
              const pct = Math.round((count / (funnelMax as number)) * 100);
              return (
                <div key={stage} className="space-y-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[12px] font-medium text-muted-foreground">{stage}</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[13px] font-bold tabular-nums" style={{ color }}>{count}</span>
                      <span className="text-[10px] text-muted-foreground/40 tabular-nums w-7 text-right">{pct}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: bg }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>

        {/* Repeat Companies */}
        <ChartCard title="Companies You've Applied to Multiple Times" delay="stagger-6">
          {repeatCompanies.length === 0 ? <EmptyChart label="repeat company" /> : (
            <div className="space-y-3 pt-1">
              {repeatCompanies.slice(0, 6).map(({ company, count }) => (
                <div key={company} className="flex items-center justify-between gap-3">
                  <span className="text-[12px] font-medium text-muted-foreground truncate">{company}</span>
                  <span className="text-[12px] font-bold tabular-nums text-primary shrink-0">{count}×</span>
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        {/* Salary Range Applied For */}
        <ChartCard title="Salary Range Applied For (Annualized)" delay="stagger-1">
          {salaryBuckets.length === 0 ? <EmptyChart label="salary" /> : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salaryBuckets} margin={{ top: 4, right: 4, bottom: 4, left: -24 }}>
                  <defs>
                    <linearGradient id="salaryBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#41e4c0" stopOpacity={1}   />
                      <stop offset="100%" stopColor="#38debb" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="name" tick={{ ...TICK_STYLE, fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={(v: number) => [v, "Applications"]} />
                  <Bar dataKey="value" fill="url(#salaryBarGrad)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {/* Cover Letter Impact */}
        <ChartCard title="Cover Letter Impact" delay="stagger-2">
          {coverLetterImpact.every((c) => c.count === 0) ? <EmptyChart label="cover letter" /> : (
            <div className="space-y-4 pt-2">
              {coverLetterImpact.map(({ label, count, responseRate }) => (
                <div key={label} className="space-y-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[12px] font-medium text-muted-foreground">
                      {label} <span className="text-muted-foreground/40">({count})</span>
                    </span>
                    <span className="text-[13px] font-bold tabular-nums text-primary">
                      {responseRate === null ? "—" : `${responseRate}%`}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-700"
                      style={{ width: `${responseRate ?? 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>

      </div>
    </div>
  );
}

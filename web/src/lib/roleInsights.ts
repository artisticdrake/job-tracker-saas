import type { JobApplication } from "./types";

// A "response" is any status change past Applied — matches calcResponseRate
// in JobApplicationTracker.tsx (kept in sync manually; both are tiny and this
// avoids a cross-module dependency for one exclusion list).
const NO_RESPONSE_STATUSES = new Set(["Applied", "Ghosted", "Withdrawn"]);
export function hasResponded(app: Pick<JobApplication, "status">): boolean {
  return !NO_RESPONSE_STATUSES.has(app.status);
}

// Position titles are free text ("Software Engineer II - App Core", "AI/ML
// Software Engineer", "Member of Technical Staff", ...) — too varied to group
// on verbatim string. Bucket by keyword instead, checked in priority order so
// a title matching multiple categories (e.g. "AI Platform Engineer") lands in
// the more specific one. Word-boundary matching avoids false hits like "ai"
// inside "maintain" or "detail".
const ROLE_CATEGORIES: { name: string; test: (title: string) => boolean }[] = [
  { name: "AI/ML", test: (t) => /\b(ai|ml)\b|machine learning|artificial intelligence/.test(t) },
  { name: "Data", test: (t) => /\bdata\b/.test(t) },
  { name: "DevOps/Infra", test: (t) => /\bdevops\b|site reliability|\bsre\b|infrastructure/.test(t) },
  { name: "QA/Test", test: (t) => /\bqa\b|quality assurance|\btest(ing)?\b/.test(t) },
  { name: "Mobile", test: (t) => /\bmobile\b|\bios\b|\bandroid\b/.test(t) },
  { name: "Software/Backend", test: (t) => /software|backend|full.stack|frontend|developer|programmer|architect|\bengineer\b/.test(t) },
];

export function classifyRole(position: string): string {
  const title = (position || "").toLowerCase();
  for (const cat of ROLE_CATEGORIES) {
    if (cat.test(title)) return cat.name;
  }
  return "Other";
}

export interface RoleCategoryStat {
  category: string;
  count: number;
  responseRate: number;
}

export function calcRoleCategoryStats(apps: JobApplication[]): RoleCategoryStat[] {
  const buckets = new Map<string, JobApplication[]>();
  apps.forEach((a) => {
    const cat = classifyRole(a.position);
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat)!.push(a);
  });
  return Array.from(buckets.entries())
    .map(([category, list]) => ({
      category,
      count: list.length,
      responseRate: list.length ? Math.round((list.filter(hasResponded).length / list.length) * 100) : 0,
    }))
    .sort((a, b) => b.responseRate - a.responseRate || b.count - a.count);
}

// Curated, not exhaustive — general work-arrangement/seniority/stack terms
// that plausibly matter, plus sponsorship/visa specifically because it's a
// major real-world response-rate differentiator for international candidates.
const JD_SIGNAL_KEYWORDS: { label: string; test: (t: string) => boolean }[] = [
  { label: "Remote", test: (t) => /\bremote\b/.test(t) },
  { label: "Hybrid", test: (t) => /\bhybrid\b/.test(t) },
  { label: "On-site", test: (t) => /\bon-?site\b/.test(t) },
  { label: "Sponsorship/Visa mentioned", test: (t) => /\bsponsorship\b|\bvisa\b|work authorization|\bopt\b|\bcpt\b/.test(t) },
  { label: "New Grad/Entry Level", test: (t) => /new grad|entry.level|early career/.test(t) },
  { label: "Senior/Lead/Staff", test: (t) => /\bsenior\b|\blead\b|\bstaff\b/.test(t) },
  { label: "Python", test: (t) => /\bpython\b/.test(t) },
  { label: "JavaScript/TypeScript/Java", test: (t) => /\bjavascript\b|\btypescript\b|\bjava\b/.test(t) },
  { label: "React", test: (t) => /\breact\b/.test(t) },
  { label: "AWS/GCP/Azure/Cloud", test: (t) => /\baws\b|\bgcp\b|\bazure\b|\bcloud\b/.test(t) },
  { label: "SQL/Database", test: (t) => /\bsql\b|\bdatabase\b/.test(t) },
  { label: "Machine Learning/AI", test: (t) => /machine learning|artificial intelligence|\bai\b|\bml\b/.test(t) },
  { label: "Docker/Kubernetes", test: (t) => /\bdocker\b|\bkubernetes\b|\bk8s\b/.test(t) },
  { label: "Agile/Scrum", test: (t) => /\bagile\b|\bscrum\b/.test(t) },
];

export interface JdSignalStat {
  label: string;
  count: number;
  responseRate: number;
}

// Only signals with enough sample size to mean anything are returned — a
// keyword that appears in one application and got a response is not a 100%
// response-rate signal, it's noise.
const MIN_SAMPLE_SIZE = 3;

export function calcJdSignals(apps: JobApplication[]): JdSignalStat[] {
  const withJd = apps.filter((a) => a.jobDescription && a.jobDescription.trim().length > 0);
  return JD_SIGNAL_KEYWORDS
    .map(({ label, test }) => {
      const matched = withJd.filter((a) => test(a.jobDescription.toLowerCase()));
      return {
        label,
        count: matched.length,
        responseRate: matched.length ? Math.round((matched.filter(hasResponded).length / matched.length) * 100) : 0,
      };
    })
    .filter((s) => s.count >= MIN_SAMPLE_SIZE)
    .sort((a, b) => b.responseRate - a.responseRate || b.count - a.count);
}

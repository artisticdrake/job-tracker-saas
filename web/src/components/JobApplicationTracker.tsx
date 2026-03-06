import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Search,
  ExternalLink,
  Trash2,
  Edit2,
  File,
  X,
  Upload,
  Wand2,
  BarChart3,
  DatabaseBackup,
  FolderOpen,
  Files,
  ChevronDown,
  ChevronRight,
  Settings2,
  Sun,
  Moon,
  Save,
  Undo2,
  Palette,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Award,
  Eye,
  EyeOff,
  LogOut,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import { supabase } from "../lib/supabase";

const STATUSES = [
  "Applied",
  "Screening",
  "Interview Scheduled",
  "Interview Completed",
  "Offer",
  "Rejected",
  "Withdrawn",
];

const SOURCES = ["LinkedIn", "Handshake", "Jobright", "Glassdoor", "Indeed", "Interstride", "Other/Custom"];

const STATUS_COLORS = {
  Total: "#94a3b8",
  Applied: "#60a5fa",
  Screening: "#fbbf24",
  Interview: "#a78bfa",
  Offer: "#34d399",
  Rejected: "#f87171",
  Withdrawn: "#94a3b8",
  "Interview Scheduled": "#a78bfa",
  "Interview Completed": "#818cf8",
  "Application created": "#cbd5e1",
};


/** ---------- Date handling ---------- */
function parseLocalYYYYMMDD(s: string | null | undefined) {
  if (!s || typeof s !== "string") return null;
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function formatLocalYYYYMMDDToLocale(s: string | null | undefined) {
  const dt = parseLocalYYYYMMDD(s);
  if (!dt) return "";
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function startOfWeekISOFromYYYYMMDD(dateStr: string | null | undefined) {
  const d = parseLocalYYYYMMDD(dateStr);
  if (!d) return "";
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function formatShortDate(ts: any) {
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function getFileType(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  const types = { pdf: "Resume/CV", doc: "Document", docx: "Document", txt: "Cover Letter" };
  return types[ext] || "Other";
}

function ensureTimeline(app: any) {
  if (Array.isArray(app.timeline) && app.timeline.length > 0) return app;
  const base = parseLocalYYYYMMDD(app.dateApplied)?.getTime() ?? Date.now();
  return { ...app, timeline: [{ ts: base, status: "Application created" }] };
}

function getLastUpdatedTs(app: any) {
  const tl = Array.isArray(app.timeline) ? app.timeline : [];
  if (!tl.length) return parseLocalYYYYMMDD(app.dateApplied)?.getTime() ?? Date.now();
  return tl.reduce((mx, e) => Math.max(mx, Number(e?.ts || 0)), 0) || Date.now();
}

function normalizeCompanyKey(company: any) {
  return (company || "").trim().toLowerCase();
}

function median(values: any[]) {
  const arr = [...values].filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (arr.length === 0) return null;
  const mid = Math.floor(arr.length / 2);
  if (arr.length % 2 === 1) return arr[mid];
  return (arr[mid - 1] + arr[mid]) / 2;
}

function calculateResponseRate(apps: any[]) {
  const responded = apps.filter(a => !["Applied", "Withdrawn"].includes(a.status)).length;
  return apps.length > 0 ? ((responded / apps.length) * 100).toFixed(1) : 0;
}

function calculateAverageResponseTime(apps: any[]) {
  const times = apps
    .filter(a => a.timeline && a.timeline.length > 1)
    .map(a => {
      const applied = a.timeline[0]?.ts;
      const responded = a.timeline.find(t => t.status !== "Application created")?.ts;
      return responded && applied ? (responded - applied) / (1000 * 60 * 60 * 24) : null;
    })
    .filter(t => t !== null);
  
  return times.length > 0 ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1) : null;
}

function cleanFileName(filename: string) {
  // Remove timestamp prefix (numbers followed by dash)
  let clean = filename.replace(/^\d+-/, '');
  // Replace underscores with spaces
  clean = clean.replace(/_/g, ' ');
  return clean;
}

function calculateConversionRate(apps: any[], fromStatus: string, toStatus: string) {
  // Count apps with current status >= fromStatus
  const fromStatusIndex = STATUSES.indexOf(fromStatus);
  const toStatusIndex = STATUSES.indexOf(toStatus);
  
  const reachedFrom = apps.filter(a => 
    STATUSES.indexOf(a.status) >= fromStatusIndex
  ).length;
  
  const reachedTo = apps.filter(a => 
    STATUSES.indexOf(a.status) >= toStatusIndex
  ).length;
  
  return reachedFrom > 0 ? ((reachedTo / reachedFrom) * 100).toFixed(1) : 0;
}

/** ---------- Theme system ---------- */
// Theme key is scoped per-user to prevent cross-user localStorage leaks
const getThemeKey = (userId: string) => `jt.theme.v4.${userId}`;

const DEFAULT_THEME = {
  mode: "dark",
  radius: 14,
  density: 1.0,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  glowIntensity: 0.0,
  titleGlow: 0.06,
  titleColor: "#ffffff",
  palettes: {
    dark: {
      accent: "#ff0000",
      accentGlow: "#60a5fa",
      bg: "#030712",
      panel: "#0f1729",
      border: "#1e3a8a",
      text: "#dbeafe",
      muted: "#93c5fd",
    },
    light: {
      accent: "#ff0000",
      accentGlow: "#60a5fa",
      bg: "#030712",
      panel: "#0f1729",
      border: "#1e3a8a",
      text: "#dbeafe",
      muted: "#93c5fd",
    },
  },
};

const BEAUTIFUL_PRESETS = [
  {
    name: "Cyberpunk Purple",
    theme: {
      ...DEFAULT_THEME,
      mode: "dark",
      radius: 8,
      glowIntensity: 0.3,
      titleGlow: 0.03,
      titleColor: "#ffffff",
      palettes: {
        dark: {
          accent: "#00e096",
          accentGlow: "#a855f7",
          bg: "#0f0514",
          panel: "#1a0b2e",
          border: "#3b1f5c",
          text: "#f3e8ff",
          muted: "#c4b5fd",
        },
        light: {
          accent: "#9333ea",
          accentGlow: "#9333ea",
          bg: "#faf5ff",
          panel: "#ffffff",
          border: "#e9d5ff",
          text: "#581c87",
          muted: "#7c3aed",
        },
      },
    },
  },
  {
    name: "Neon Ocean",
    theme: {
      ...DEFAULT_THEME,
      mode: "dark",
      radius: 23,
      glowIntensity: 0.7,
      titleGlow: 0.6,
      titleColor: "#ffffff",
      palettes: {
        dark: {
          accent: "#00d9ff",
          accentGlow: "#22d3ee",
          bg: "#020617",
          panel: "#0c1929",
          border: "#1e3a5f",
          text: "#e0f2fe",
          muted: "#67e8f9",
        },
        light: {
          accent: "#0891b2",
          accentGlow: "#06b6d4",
          bg: "#f0fdff",
          panel: "#ffffff",
          border: "#a5f3fc",
          text: "#164e63",
          muted: "#0e7490",
        },
      },
    },
  },
  {
    name: "Sunset Ember",
    theme: {
      ...DEFAULT_THEME,
      mode: "dark",
      radius: 24,
      glowIntensity: 0.75,
      titleGlow: 0.60,
      titleColor: "#ffa96b",
      palettes: {
        dark: {
          accent: "#f97316",
          accentGlow: "#fb923c",
          bg: "#18120c",
          panel: "#1f1611",
          border: "#3d2817",
          text: "#fff7ed",
          muted: "#fdba74",
        },
        light: {
          accent: "#ea580c",
          accentGlow: "#f97316",
          bg: "#fff7ed",
          panel: "#ffffff",
          border: "#fed7aa",
          text: "#7c2d12",
          muted: "#c2410c",
        },
      },
    },
  },
  {
    name: "Emerald Matrix",
    theme: {
      ...DEFAULT_THEME,
      mode: "dark",
      radius: 7,
      glowIntensity: 0.7,
      titleGlow: 0.06,
      titleColor: "#F7FBFC",
      palettes: {
        dark: {
          accent: "#00d1a7",
          accentGlow: "#7CCBC2",
          bg: "#0E3A43",
          panel: "#002124",
          border: "#334d4a",
          text: "#e0f2fe",
          muted: "#38ffd7",
        },
        light: {
          accent: "#00d1a7",
          accentGlow: "#7CCBC2",
          bg: "#0E3A43",
          panel: "#002124",
          border: "#334d4a",
          text: "#e0f2fe",
          muted: "#38ffd7",
        },
      },
    },
  },
  {
    name: "Rose Gold",
    theme: {
      ...DEFAULT_THEME,
      mode: "dark",
      radius: 18,
      glowIntensity: 0.65,
      titleGlow: 0.06,
      titleColor: "#feeccd",
      palettes: {
        dark: {
          accent: "#f43f5e",
          accentGlow: "#ffa200",
          bg: "#18080e",
          panel: "#1f0b14",
          border: "#664100",
          text: "#ffe4e6",
          muted: "#fda4af",
        },
        light: {
          accent: "#e11d48",
          accentGlow: "#f43f5e",
          bg: "#fff1f2",
          panel: "#ffffff",
          border: "#fecdd3",
          text: "#881337",
          muted: "#be123c",
        },
      },
    },
  },
  {
    name: "Classic Blue",
    theme: {
      ...DEFAULT_THEME,
      mode: "dark",
      radius: 14,
      glowIntensity: 0.0,
      titleColor: "#ffffff",
      titleGlow: 0.06,
      palettes: {
        dark: {
          accent: "#ff0000",
          accentGlow: "#60a5fa",
          bg: "#030712",
          panel: "#0f1729",
          border: "#1e3a8a",
          text: "#dbeafe",
          muted: "#93c5fd",
        },
        light: {
          accent: "#ff0000",
          accentGlow: "#60a5fa",
          bg: "#030712",
          panel: "#0f1729",
          border: "#1e3a8a",
          text: "#dbeafe",
          muted: "#93c5fd",
        },
      },
    },
  },
];

// Read from user-scoped localStorage cache (fast, but NOT authoritative — cloud wins)
function loadCachedTheme(userId: string) {
  try {
    const stored = localStorage.getItem(getThemeKey(userId));
    if (!stored) return null;
    return { ...DEFAULT_THEME, ...JSON.parse(stored) };
  } catch {
    return null;
  }
}

// Write to user-scoped localStorage cache
function writeCachedTheme(userId: string, t: any) {
  try {
    localStorage.setItem(getThemeKey(userId), JSON.stringify(t));
  } catch {
    // storage quota exceeded or private browsing — silently ignore
  }
}

const CLASSIC_BLUE_THEME =
  BEAUTIFUL_PRESETS.find((p) => p.name === "Classic Blue")?.theme ?? DEFAULT_THEME;

function applyThemeToDom(t: any) {
  const pal = t.palettes[t.mode];
  document.documentElement.style.setProperty("--jt-accent", pal.accent);
  document.documentElement.style.setProperty("--jt-accent-glow", pal.accentGlow);
  document.documentElement.style.setProperty("--jt-bg", pal.bg);
  document.documentElement.style.setProperty("--jt-panel", pal.panel);
  document.documentElement.style.setProperty("--jt-border", pal.border);
  document.documentElement.style.setProperty("--jt-text", pal.text);
  document.documentElement.style.setProperty("--jt-muted", pal.muted);
  document.documentElement.style.setProperty("--jt-radius", `${t.radius}px`);
  document.documentElement.style.setProperty("--jt-density", String(t.density));
  document.documentElement.style.setProperty("--jt-glow", String(t.glowIntensity));
  document.documentElement.style.setProperty("--jt-title-glow", String(t.titleGlow));
  document.documentElement.style.setProperty("--jt-title", t.titleColor || pal.accent);
  document.body.style.fontFamily = t.fontFamily;
}

/** ---------- Main Component ---------- */
export default function JobApplicationTracker({ session }: { session: any }) {

  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const userId: string = session?.user?.id ?? "";

  // Start with DEFAULT_THEME — fetchProfile will immediately replace this with either
  // the user's cloud-saved theme or Classic Blue. We do NOT load from localStorage here
  // to prevent cross-user state leakage.
  const [theme, setTheme] = useState<any>(DEFAULT_THEME);
  const [previewTheme, setPreviewTheme] = useState<any>(DEFAULT_THEME);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState("applications");
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [expandedApp, setExpandedApp] = useState(null);
  const [aiProvider, setAiProvider] = useState({ useOpenAI: false, hasApiKey: false });
  const [backupState, setBackupState] = useState({ busy: false, msg: "" });

  useEffect(() => {
  // AI provider settings are stored server-side in later tiers.
}, []);

  const [formData, setFormData] = useState({
    company: "",
    position: "",
    location: "",
    salary: "",
    dateApplied: todayISO(),
    status: "Applied",
    jobUrl: "",
    source: "LinkedIn",
    notes: "",
    documents: [],
  });

  // Autofill suggestions
  const [companySuggestions, setCompanySuggestions] = useState([]);
  const [positionSuggestions, setPositionSuggestions] = useState([]);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [showCompanySuggestions, setShowCompanySuggestions] = useState(false);
  const [showPositionSuggestions, setShowPositionSuggestions] = useState(false);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

  const [aiSummary, setAiSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);

  const generateAiSummary = async () => {
  // Tier 4: AI summaries (server-side). Disabled in Tier 0 web SaaS scope.
  return;
};

  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  useEffect(() => {
    if (activeTab === "customization") {
      applyThemeToDom(previewTheme);
    } else {
      applyThemeToDom(theme);
    }
  }, [previewTheme, activeTab, theme]);

  // Generate autofill suggestions
  useEffect(() => {
    const companies = [...new Set(apps.map(a => a.company).filter(Boolean))];
    const positions = [...new Set(apps.map(a => a.position).filter(Boolean))];
    const locations = [...new Set(apps.map(a => a.location).filter(Boolean))];
    setCompanySuggestions(companies);
    setPositionSuggestions(positions);
    setLocationSuggestions(locations);
  }, [apps]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };
  
  const fetchApps = async () => {
    if (!session?.access_token) {
      setApps([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/applications`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `Failed to fetch applications (${res.status})`);
      }

      const data = await res.json();
      const list = data?.data || [];

      const mapped = list.map((app: any) => {
        const dateApplied = (app.date_applied || app.dateApplied || "").slice?.(0, 10) || todayISO();
        return ensureTimeline({
          ...app,
          jobUrl: app.job_url ?? app.jobUrl ?? "",
          dateApplied,
          documents: app.documents ?? app.documents_json ?? app.documents ?? [],
          timeline: [
            {
              status: "Applied",
              ts: new Date(dateApplied).getTime(),
            },
          ],
        });
      });

      setApps(mapped);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Failed to load applications.");
      setApps([]);
    } finally {
      setLoading(false);
    }
  };

  // saveTheme is inside the component so it has access to session and userId
  const saveTheme = async (t: any) => {
    setTheme(t);
    writeCachedTheme(userId, t); // cache for this specific user
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) return;
      const response = await fetch(`${import.meta.env.VITE_API_URL}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify({ theme_settings: t }),
      });
      const result = await response.json();
      console.log("Cloud Save Response:", result);
    } catch (error) {
      console.error("Error saving theme to cloud:", error);
    }
  };

  const fetchProfile = async () => {
    if (!userId) return;
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) return;

      // Optimistic: apply user's localStorage cache instantly while we wait for cloud
      const cached = loadCachedTheme(userId);
      if (cached) {
        setTheme(cached);
        setPreviewTheme(cached);
      }

      const res = await fetch(`${import.meta.env.VITE_API_URL}/profile`, {
        headers: { Authorization: `Bearer ${currentSession.access_token}` },
      });
      const data = await res.json();

      if (data?.success && data?.data?.theme_settings && Object.keys(data.data.theme_settings).length > 0) {
        // Cloud is the source of truth — always wins over cache
        const cloudTheme = data.data.theme_settings;
        setTheme(cloudTheme);
        setPreviewTheme(cloudTheme);
        writeCachedTheme(userId, cloudTheme);
      } else {
        // New user with no saved theme → force Classic Blue
        setTheme(DEFAULT_THEME);
        setPreviewTheme(DEFAULT_THEME);
        writeCachedTheme(userId, DEFAULT_THEME);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };
  
  useEffect(() => {
    if (session?.access_token) {
      fetchApps();
      fetchProfile();
    }
  }, [session]);

  const handleApplyTheme = () => {
    setTheme(previewTheme);
    saveTheme(previewTheme); // <-- ONLY save when the user clicks this button
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 3000);
  };

  const handleResetPreview = () => {
    setPreviewTheme(theme);
  };

  const filteredApps = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return apps.filter(
      (a) =>
        a.company?.toLowerCase().includes(term) ||
        a.position?.toLowerCase().includes(term) ||
        a.location?.toLowerCase().includes(term)
    );
  }, [apps, searchTerm]);

  const sortedApps = useMemo(() => {
    return [...filteredApps].sort((a, b) => getLastUpdatedTs(b) - getLastUpdatedTs(a));
  }, [filteredApps]);

  const stats = useMemo(() => {
    const statusCounts = {};
    STATUSES.forEach((s) => (statusCounts[s] = 0));
    apps.forEach((a) => {
      if (statusCounts[a.status] !== undefined) statusCounts[a.status]++;
    });

    const sourceCounts = {};
    SOURCES.forEach((s) => (sourceCounts[s] = 0));
    apps.forEach((a) => {
      if (sourceCounts[a.source] !== undefined) sourceCounts[a.source]++;
    });

    const weekMap = {};
    apps.forEach((a) => {
      const wk = startOfWeekISOFromYYYYMMDD(a.dateApplied);
      if (wk) weekMap[wk] = (weekMap[wk] || 0) + 1;
    });

    const weeks = Object.entries(weekMap)
      .map(([wk, count]) => ({ week: wk, count }))
      .sort((a, b) => a.week.localeCompare(b.week));

    const salaries = apps
      .filter((a) => a.status === "Offer" && a.salary)
      .map((a) => {
        const num = parseFloat(String(a.salary).replace(/[^0-9.]/g, ""));
        return Number.isFinite(num) ? num : null;
      })
      .filter((v) => v !== null);

    const medianSalary = median(salaries);
    const responseRate = calculateResponseRate(apps);
    const avgResponseTime = calculateAverageResponseTime(apps);
    const screeningConversion = calculateConversionRate(apps, "Applied", "Screening");
    const interviewConversion = calculateConversionRate(apps, "Screening", "Interview Scheduled");
    const offerConversion = calculateConversionRate(apps, "Interview Completed", "Offer");

    return {
      total: apps.length,
      statusCounts,
      sourceCounts,
      weeks,
      medianSalary,
      responseRate,
      avgResponseTime,
      screeningConversion,
      interviewConversion,
      offerConversion,
    };
  }, [apps]);

  const pieData = useMemo(() => {
    return Object.entries(stats.statusCounts)
      .filter(([, val]) => val > 0)
      .map(([name, value]) => ({ name, value }));
  }, [stats.statusCounts]);

  const sourceData = useMemo(() => {
    return Object.entries(stats.sourceCounts)
      .filter(([, val]) => val > 0)
      .map(([name, value]) => ({ name, value }));
  }, [stats.sourceCounts]);

  // Files organized by company and role
  const filesByCompany = useMemo(() => {
    const organized = {};
    apps.forEach(app => {
      if (app.documents && app.documents.length > 0) {
        if (!organized[app.company]) {
          organized[app.company] = {};
        }
        if (!organized[app.company][app.position]) {
          organized[app.company][app.position] = [];
        }
        organized[app.company][app.position].push(...app.documents.map(doc => ({
          ...doc,
          appId: app.id,
          dateApplied: app.dateApplied
        })));
      }
    });
    return organized;
  }, [apps]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const dup = apps.find(
      (a: any) =>
        a.id !== editId &&
        normalizeCompanyKey(a.company) === normalizeCompanyKey(formData.company) &&
        a.position?.toLowerCase() === formData.position?.toLowerCase()
    );
    if (dup) {
      alert(`Duplicate found: ${dup.company} - ${dup.position}`);
      return;
    }

    if (!session?.access_token) {
      alert("You are not signed in.");
      return;
    }

    const payload: any = {
      company: formData.company,
      position: formData.position,
      location: formData.location,
      salary: formData.salary,
      date_applied: formData.dateApplied,
      status: formData.status,
      job_url: formData.jobUrl,
      source: formData.source,
      notes: formData.notes,
    };

    try {
      if (editId) {
        // Best-effort update (endpoint may be added in Tier 1+)
        const res = await fetch(`${import.meta.env.VITE_API_URL}/applications/${editId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          throw new Error(msg || `Failed to update application (${res.status})`);
        }
      } else {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/applications`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          throw new Error(msg || `Failed to create application (${res.status})`);
        }
      }

      await fetchApps();
      resetForm();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Failed to save application.");
    }
  };

  const resetForm = () => {
    setFormData({
      company: "",
      position: "",
      location: "",
      salary: "",
      dateApplied: todayISO(),
      status: "Applied",
      jobUrl: "",
      source: "LinkedIn",
      notes: "",
      documents: [],
    });
    setShowForm(false);
    setEditId(null);
  };

  const handleEdit = (app: any) => {
    setFormData({ ...app });
    setEditId(app.id);
    setShowForm(true);
  };

  const handleDelete = async (id: any) => {
    if (!confirm("Delete this application?")) return;

    if (!session?.access_token) {
      alert("You are not signed in.");
      return;
    }

    // Optimistic UI update
    setApps((prev: any[]) => prev.filter((a: any) => a.id !== id));

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/applications/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `Failed to delete application (${res.status})`);
      }

      await fetchApps();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Failed to delete application.");
      await fetchApps();
    }
  };

  const handleFileAttach = async () => {
  alert("File upload coming in Tier 4");
};

const handleAutofill = async () => {
  alert("Extension import coming in Tier 6");
};

  const handleRemoveDoc = (idx: number) => {
    setFormData((prev) => ({
      ...prev,
      documents: prev.documents.filter((_, i) => i !== idx),
    }));
  };

  const openDoc = async (_doc: any) => {
  alert("File viewing coming in Tier 4");
};

  const exportCsv = () => {
    const headers = ["Company", "Position", "Location", "Salary", "Date Applied", "Status", "Source", "Job URL", "Notes"];
    const rows = apps.map((a) => [
      a.company,
      a.position,
      a.location,
      a.salary,
      a.dateApplied,
      a.status,
      a.source,
      a.jobUrl,
      a.notes,
    ]);

    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job-applications-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const createBackupZip = async () => {
    setBackupState({ busy: false, msg: "Cloud Sync Active. Your data is automatically backed up to the cloud." });
  };

  const restoreBackupZip = async () => {
    setBackupState({ busy: false, msg: "Cloud Sync Active. Your data is automatically backed up to the cloud." });
  };

  const S = {
    button: (variant = "primary") => ({
      padding: "10px 16px",
      borderRadius: "var(--jt-radius)",
      border: variant === "primary" ? "none" : "1px solid var(--jt-border)",
      background: variant === "primary" ? "var(--jt-accent)" : "var(--jt-panel)",
      color: variant === "primary" ? "#fff" : "var(--jt-text)",
      cursor: "pointer",
      fontWeight: 600,
      fontSize: 14,
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      transition: "all 0.2s ease",
      boxShadow: variant === "primary" ? `0 0 20px rgba(${hexToRgb(theme.palettes[theme.mode].accentGlow)}, calc(var(--jt-glow) * 0.4))` : "none",
    }),
    input: {
      width: "100%",
      boxSizing: "border-box",
      padding: "10px 14px",
      borderRadius: "var(--jt-radius)",
      border: "1px solid var(--jt-border)",
      background: "var(--jt-panel)",
      color: "var(--jt-text)",
      fontSize: 14,
      outline: "none",
      transition: "all 0.2s ease",
    },
    panel: {
      background: "var(--jt-panel)",
      borderRadius: "var(--jt-radius)",
      border: "1px solid var(--jt-border)",
      boxShadow: `0 0 30px rgba(${hexToRgb(theme.palettes[theme.mode].accentGlow)}, calc(var(--jt-glow) * 0.15))`,
    },
    card: {
      background: "var(--jt-panel)",
      borderRadius: "var(--jt-radius)",
      border: "1px solid var(--jt-border)",
      boxShadow: `0 8px 32px rgba(0, 0, 0, 0.3), 0 0 40px rgba(${hexToRgb(theme.palettes[theme.mode].accentGlow)}, calc(var(--jt-glow) * 0.2))`,
      overflow: "hidden",
    },
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--jt-bg)", color: "var(--jt-text)", fontFamily: theme.fontFamily }}>
      <style>{`
        .jt-card { background: var(--jt-panel); border-radius: var(--jt-radius); border: 1px solid var(--jt-border); }
        .jt-soft { color: var(--jt-muted); }
        .jt-modal {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .jt-tab {
          padding: 12px 24px;
          background: transparent;
          border: none;
          color: var(--jt-muted);
          cursor: pointer;
          font-weight: 600;
          font-size: 15px;
          position: relative;
          transition: all 0.3s ease;
        }
        .jt-tab:hover {
          color: var(--jt-text);
        }
        .jt-tab.active {
          color: var(--jt-accent);
        }
        .jt-tab.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: var(--jt-accent);
          border-radius: 2px;
          box-shadow: 0 0 15px var(--jt-accent-glow);
        }
        .preset-card {
          padding: 16px;
          border-radius: var(--jt-radius);
          border: 2px solid var(--jt-border);
          background: var(--jt-panel);
          cursor: pointer;
          transition: all 0.3s ease;
        }
        .preset-card:hover {
          border-color: var(--jt-accent);
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(${hexToRgb(theme.palettes[theme.mode].accentGlow)}, calc(var(--jt-glow) * 0.3));
        }
        .stat-card {
          background: var(--jt-panel);
          border-radius: var(--jt-radius);
          border: 1px solid var(--jt-border);
          padding: 20px;
          box-shadow: 0 0 30px rgba(${hexToRgb(theme.palettes[theme.mode].accentGlow)}, calc(var(--jt-glow) * 0.15));
          transition: all 0.3s ease;
        }
        .stat-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(${hexToRgb(theme.palettes[theme.mode].accentGlow)}, calc(var(--jt-glow) * 0.25));
        }
        input:focus, textarea:focus, select:focus {
          border-color: var(--jt-accent);
          box-shadow: 0 0 0 3px rgba(${hexToRgb(theme.palettes[theme.mode].accentGlow)}, calc(var(--jt-glow) * 0.2));
        }
        .autofill-suggestions {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--jt-panel);
          border: 1px solid var(--jt-border);
          border-radius: var(--jt-radius);
          margin-top: 4px;
          max-height: 200px;
          overflow-y: auto;
          z-index: 100;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        }
        .autofill-item {
          padding: 10px 14px;
          cursor: pointer;
          transition: background 0.2s ease;
          font-size: 14px;
        }
        .autofill-item:hover {
          background: var(--jt-bg);
        }
      `}</style>

      <div style={{ maxWidth: 1600, margin: "0 auto", padding: 24 }}>
        {/* Header */}
<div style={{ marginBottom: 32 }}>
  <h1 style={{ fontSize: 42, fontWeight: 900, margin: 0, marginBottom: 8, color: "var(--jt-title)", textShadow: `0 0 calc(50px * var(--jt-title-glow)) var(--jt-title)` }}>
  Job Application Tracker
</h1>
  <p style={{ color: "var(--jt-muted)", fontSize: 16, margin: 0, marginBottom: 16 }}>
    Powered by Qwen 2.5 Pro 
  </p>
  <button onClick={handleLogout} style={S.button("secondary")}>
    <LogOut size={16} /> Logout
  </button>
 {/* AI Summary */}
{apps.length > 0 && (
  <div style={{
    ...S.panel,
    padding: 20,
    marginTop: 16,
    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(168, 85, 247, 0.05))',
    borderLeft: '3px solid var(--jt-accent)',
    position: 'relative'
  }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <Sparkles size={20} style={{ color: 'var(--jt-accent)', marginTop: 2, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ 
          fontSize: 13, 
          fontWeight: 600, 
          color: 'var(--jt-accent)', 
          marginBottom: 8,
          letterSpacing: '0.5px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Mira's Insight
            <span style={{ 
              fontSize: 10, 
              padding: '2px 6px', 
              background: 'var(--jt-panel)', 
              borderRadius: 4,
              color: 'var(--jt-muted)',
              fontWeight: 500
            }}>
              {aiProvider.useOpenAI ? 'GPT-4o' : 'Qwen 2.5'}
            </span>
          </div>
          
          {/* AI Provider Toggle */}
<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
  <span style={{ fontSize: 11, color: 'var(--jt-muted)' }}>Local</span>
  <button
    onClick={() => {
      const newValue = !aiProvider.useOpenAI;
      setAiProvider((prev: any) => ({ ...prev, useOpenAI: newValue }));
    }}
    style={{
      width: 44,
      height: 24,
      borderRadius: 12,
      border: 'none',
      background: aiProvider.useOpenAI ? 'var(--jt-accent)' : 'var(--jt-title)',
      position: 'relative',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      padding: 0
    }}
  >
    <div style={{
      width: 16,
      height: 16,
      borderRadius: '50%',
      background: '#d0d0d0',
      position: 'absolute',
      top: 4,
      left: aiProvider.useOpenAI ? 24 : 4,
      transition: 'all 0.3s ease'
    }} />
  </button>
  <span style={{ fontSize: 11, color: 'var(--jt-muted)' }}>GPT-4o</span>
</div>
        </div>
        {loadingSummary ? (
          <div style={{ color: 'var(--jt-muted)', fontSize: 14, fontStyle: 'italic' }}>
            Mira is analyzing your applications...
          </div>
        ) : aiSummary ? (
          <div style={{ 
            fontSize: 14, 
            lineHeight: 1.6, 
            color: 'var(--jt-text)',
            whiteSpace: 'pre-line'
          }}>
            {aiSummary}
          </div>
        ) : null}
      </div>
      <button
        onClick={generateAiSummary}
        disabled={loadingSummary}
        style={{
          ...S.button('secondary'),
          padding: '6px 12px',
          fontSize: 12,
          flexShrink: 0
        }}
        title="Ask Mira to refresh"
      >
        <Wand2 size={14} />
      </button>
    </div>
  </div>
)}
</div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, borderBottom: "2px solid var(--jt-border)", marginBottom: 32 }}>
          <button
            className={`jt-tab ${activeTab === "applications" ? "active" : ""}`}
            onClick={() => setActiveTab("applications")}
          >
            Applications ({apps.length})
          </button>
          <button
            className={`jt-tab ${activeTab === "files" ? "active" : ""}`}
            onClick={() => setActiveTab("files")}
          >
            <Files size={18} /> Files
          </button>
          <button
            className={`jt-tab ${activeTab === "analytics" ? "active" : ""}`}
            onClick={() => setActiveTab("analytics")}
          >
            <BarChart3 size={18} /> Analytics
          </button>
          <button
            className={`jt-tab ${activeTab === "customization" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("customization");
              setPreviewTheme(theme);
            }}
          >
            <Palette size={18} /> Customization
          </button>
          <button
            className={`jt-tab ${activeTab === "backup" ? "active" : ""}`}
            onClick={() => setActiveTab("backup")}
          >
            <DatabaseBackup size={18} /> Backup
          </button>
        </div>

        {/* Applications Tab */}
        {activeTab === "applications" && (
          <>
            {/* Dashboard Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
              <div className="stat-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: "var(--jt-muted)" }}>Total</div>
                  <CheckCircle size={20} color="#94a3b8" />
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#94a3b8" }}>{stats.total}</div>
              </div>

              <div className="stat-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: "var(--jt-muted)" }}>Applied</div>
                  <Clock size={20} color="#60a5fa" />
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#60a5fa" }}>{stats.statusCounts["Applied"]}</div>
              </div>

              <div className="stat-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: "var(--jt-muted)" }}>Screening</div>
                  <AlertCircle size={20} color="#fbbf24" />
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#fbbf24" }}>{stats.statusCounts["Screening"]}</div>
              </div>

              <div className="stat-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: "var(--jt-muted)" }}>Interview</div>
                  <TrendingUp size={20} color="#a78bfa" />
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#a78bfa" }}>
                  {stats.statusCounts["Interview Scheduled"] + stats.statusCounts["Interview Completed"]}
                </div>
              </div>

              <div className="stat-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: "var(--jt-muted)" }}>Offers</div>
                  <Award size={20} color="#34d399" />
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#34d399" }}>{stats.statusCounts["Offer"]}</div>
              </div>

              <div className="stat-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: "var(--jt-muted)" }}>Rejected</div>
                  <XCircle size={20} color="#f87171" />
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#f87171" }}>{stats.statusCounts["Rejected"]}</div>
              </div>
            </div>

            {/* Search & Actions */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
              <div style={{ flex: "1 1 300px", position: "relative" }}>
                <Search size={18} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--jt-muted)" }} />
                <input
                  type="text"
                  placeholder="Search companies, positions, locations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ ...S.input, paddingLeft: 44 }}
                />
              </div>
              <button onClick={() => setShowForm(true)} style={S.button("primary")}>
                <Plus size={18} /> Add Application
              </button>
              <button onClick={exportCsv} style={S.button("secondary")}>
                <Upload size={18} /> Export CSV
              </button>
            </div>

            {/* Applications Table */}
            <div style={S.card}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--jt-border)" }}>
                      <th style={{ padding: "16px", textAlign: "left", fontWeight: 700, fontSize: 13, color: "var(--jt-muted)" }}>Company</th>
                      <th style={{ padding: "16px", textAlign: "left", fontWeight: 700, fontSize: 13, color: "var(--jt-muted)" }}>Position</th>
                      <th style={{ padding: "16px", textAlign: "left", fontWeight: 700, fontSize: 13, color: "var(--jt-muted)" }}>Status</th>
                      <th style={{ padding: "16px", textAlign: "left", fontWeight: 700, fontSize: 13, color: "var(--jt-muted)" }}>Last Updated</th>
                      <th style={{ padding: "16px", textAlign: "left", fontWeight: 700, fontSize: 13, color: "var(--jt-muted)" }}>Applied</th>
                      <th style={{ padding: "16px", textAlign: "left", fontWeight: 700, fontSize: 13, color: "var(--jt-muted)" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 48, textAlign: "center", color: "var(--jt-muted)" }}>
                          Loading applications...
                        </td>
                      </tr>
                    ) : sortedApps.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 48, textAlign: "center", color: "var(--jt-muted)" }}>
                          No applications yet. Click "Add Application" to get started!
                        </td>
                      </tr>
                    ) : (
                      sortedApps.map((app) => (
                        <React.Fragment key={app.id}>
                          <tr style={{ borderBottom: "1px solid var(--jt-border)", transition: "background 0.2s ease" }}>
                            <td style={{ padding: "16px" }}>
                              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{app.company}</div>
                              <div style={{ fontSize: 13, color: "var(--jt-muted)" }}> {app.location || "Remote"}</div>
                            </td>
                            <td style={{ padding: "16px" }}>
                              <div style={{ fontSize: 14 }}>{app.position}</div>
                              {app.salary && <div style={{ fontSize: 13, color: "var(--jt-muted)", marginTop: 4 }}> USD{app.salary}</div>}
                            </td>
                            <td style={{ padding: "16px" }}>
                              <div
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: "var(--jt-radius)",
                                  background: STATUS_COLORS[app.status] || STATUS_COLORS.Applied,
                                  color: "#fff",
                                  fontWeight: 600,
                                  fontSize: 12,
                                  display: "inline-block",
                                  boxShadow: `0 0 15px ${STATUS_COLORS[app.status]}80`,
                                }}
                              >
                                {app.status}
                              </div>
                            </td>
                            <td style={{ padding: "16px", fontSize: 14, color: "var(--jt-text)" }}>
                              {formatShortDate(getLastUpdatedTs(app))}
                            </td>
                            <td style={{ padding: "16px", fontSize: 14, color: "var(--jt-muted)" }}>
                              {formatLocalYYYYMMDDToLocale(app.dateApplied)}
                            </td>
                            <td style={{ padding: "16px" }}>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => handleEdit(app)} style={{ ...S.button("secondary"), padding: "6px 10px" }} title="Edit">
                                  <Edit2 size={14} />
                                </button>
                                {app.jobUrl && (
                                  <button onClick={() => window.open(app.jobUrl, "_blank")} style={{ ...S.button("secondary"), padding: "6px 10px" }} title="Open URL">
                                    <ExternalLink size={14} />
                                  </button>
                                )}
                                <button onClick={() => handleDelete(app.id)} style={{ ...S.button("secondary"), padding: "6px 10px" }} title="Delete">
                                  <Trash2 size={14} />
                                </button>
                                <button
                                  onClick={() => setExpandedApp(expandedApp === app.id ? null : app.id)}
                                  style={{ ...S.button("secondary"), padding: "6px 10px" }}
                                  title="Expand"
                                >
                                  {expandedApp === app.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                              </div>
                            </td>
                          </tr>
                          {expandedApp === app.id && (
                            <tr style={{ borderBottom: "1px solid var(--jt-border)" }}>
                              <td colSpan={6} style={{ padding: "20px", background: "var(--jt-bg)" }}>
                                {app.notes && (
                                  <div style={{ marginBottom: 16 }}>
                                    <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Notes:</div>
                                    <div style={{ color: "var(--jt-muted)", fontSize: 14, whiteSpace: "pre-wrap" }}>{app.notes}</div>
                                  </div>
                                )}

                                {app.documents && app.documents.length > 0 && (
                                  <div style={{ marginBottom: 16 }}>
                                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Documents:</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                      {app.documents.map((doc, i) => (
                                        <button
                                          key={i}
                                          onClick={() => openDoc(doc)}
                                          style={{
                                            ...S.button("secondary"),
                                            padding: "8px 12px",
                                            fontSize: 13,
                                          }}
                                        >
                                          <File size={14} /> {doc.name}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div>
                                  <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Timeline:</div>
                                  <div style={{ display: "grid", gap: 8 }}>
                                    {(app.timeline || []).map((t, i) => (
                                      <div
                                        key={i}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 12,
                                          padding: "8px 12px",
                                          background: "var(--jt-panel)",
                                          borderRadius: "8px",
                                          fontSize: 13,
                                        }}
                                      >
                                        <div
                                          style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: "50%",
                                            background: STATUS_COLORS[t.status] || STATUS_COLORS.Applied,
                                            boxShadow: `0 0 8px ${STATUS_COLORS[t.status]}`,
                                          }}
                                        />
                                        <div style={{ flex: 1, fontWeight: 600 }}>{t.status}</div>
                                        <div style={{ color: "var(--jt-muted)" }}>{formatShortDate(t.ts)}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Files Tab */}
        {activeTab === "files" && (
          <div style={{ display: "grid", gap: 24 }}>
            {Object.keys(filesByCompany).length === 0 ? (
              <div style={{ ...S.panel, padding: 48, textAlign: "center" }}>
                <FolderOpen size={48} style={{ color: "var(--jt-muted)", margin: "0 auto 16px" }} />
                <div style={{ fontSize: 18, color: "var(--jt-muted)" }}>No files attached yet</div>
              </div>
            ) : (
              Object.entries(filesByCompany).map(([company, roles]) => (
                <div key={company} style={S.card}>
                  <div style={{ padding: 20, borderBottom: "1px solid var(--jt-border)" }}>
                    <h3 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{company}</h3>
                  </div>
                  <div style={{ padding: 20 }}>
                    {Object.entries(roles).map(([position, docs]) => (
                      <div key={position} style={{ marginBottom: 24, paddingBottom: 29, borderBottom: "1px solid var(--jt-border)" }}>
                        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "var(--jt-accent)" }}>
                          {position}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
                          {docs.map((doc, i) => (
                            <div
                              key={i}
                              onClick={() => openDoc(doc)}
                              style={{
                                ...S.panel,
                                padding: 14,
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = "translateY(-2px)";
                                e.currentTarget.style.borderColor = "var(--jt-accent)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = "translateY(0)";
                                e.currentTarget.style.borderColor = "var(--jt-border)";
                              }}
                            >
                              <File size={25} color="var(--jt-accent)" />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{cleanFileName(doc.name)}</div>
                                <div style={{ fontSize: 12, color: "var(--jt-muted)" }}>
                                  {formatLocalYYYYMMDDToLocale(doc.dateApplied)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === "analytics" && (
          <div style={{ display: "grid", gap: 24 }}>
            {/* Key Metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              <div className="stat-card">
                <div style={{ fontSize: 13, color: "var(--jt-muted)", marginBottom: 4 }}>Response Rate</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#10b981" }}>{stats.responseRate}%</div>
              </div>

              <div className="stat-card">
                <div style={{ fontSize: 13, color: "var(--jt-muted)", marginBottom: 4 }}>Avg Response Time</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#3b82f6" }}>
                  {stats.avgResponseTime ? `${stats.avgResponseTime}d` : "N/A"}
                </div>
              </div>

              <div className="stat-card">
                <div style={{ fontSize: 13, color: "var(--jt-muted)", marginBottom: 4 }}>Screening Rate</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#f59e0b" }}>{stats.screeningConversion}%</div>
              </div>

              <div className="stat-card">
                <div style={{ fontSize: 13, color: "var(--jt-muted)", marginBottom: 4 }}>Interview Rate</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#8b5cf6" }}>{stats.interviewConversion}%</div>
              </div>

              <div className="stat-card">
                <div style={{ fontSize: 13, color: "var(--jt-muted)", marginBottom: 4 }}>Offer Rate</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#ec4899" }}>{stats.offerConversion}%</div>
              </div>

              {stats.medianSalary !== null && (
                <div className="stat-card">
                  <div style={{ fontSize: 13, color: "var(--jt-muted)", marginBottom: 4 }}>Median Offer</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: "#10b981" }}>${stats.medianSalary.toLocaleString()}</div>
                </div>
              )}
            </div>

            {/* Charts */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 24 }}>
              {/* Status Distribution */}
              <div style={S.card}>
                <div style={{ padding: 20 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Status Distribution</div>
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={STATUS_COLORS[entry.name] || "#94a3b8"} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: "var(--jt-panel)", border: "1px solid var(--jt-border)", borderRadius: "8px" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--jt-muted)" }}>
                      No data available
                    </div>
                  )}
                </div>
              </div>

              {/* Source Distribution */}
              <div style={S.card}>
                <div style={{ padding: 20 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Application Sources</div>
                  {sourceData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={sourceData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--jt-border)" />
                        <XAxis dataKey="name" tick={{ fill: "var(--jt-muted)", fontSize: 11 }} angle={-45} textAnchor="end" height={100} />
                        <YAxis tick={{ fill: "var(--jt-muted)" }} />
                        <Tooltip contentStyle={{ background: "var(--jt-panel)", border: "1px solid var(--jt-border)", borderRadius: "8px" }} />
                        <Bar dataKey="value" fill="var(--jt-accent)" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--jt-muted)" }}>
                      No data available
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Weekly Trend */}
            <div style={S.card}>
              <div style={{ padding: 20 }}>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Application Trend Over Time</div>
                {stats.weeks.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={stats.weeks}>
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--jt-accent)" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="var(--jt-accent)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--jt-border)" />
                      <XAxis
                        dataKey="week"
                        tick={{ fill: "var(--jt-muted)", fontSize: 12 }}
                        tickFormatter={(v) => formatLocalYYYYMMDDToLocale(v)}
                      />
                      <YAxis tick={{ fill: "var(--jt-muted)" }} />
                      <Tooltip
                        contentStyle={{ background: "var(--jt-panel)", border: "1px solid var(--jt-border)", borderRadius: "8px" }}
                        labelFormatter={(v) => formatLocalYYYYMMDDToLocale(v)}
                      />
                      <Area type="monotone" dataKey="count" stroke="var(--jt-accent)" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--jt-muted)" }}>
                    No data available
                  </div>
                )}
              </div>
            </div>

            {/* Funnel Analysis */}
            <div style={S.card}>
              <div style={{ padding: 20 }}>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Application Funnel</div>
                <div style={{ display: "grid", gap: 12 }}>
                  {[
                    { label: "Applied", count: stats.statusCounts["Applied"] + stats.statusCounts["Screening"] + stats.statusCounts["Interview Scheduled"] + stats.statusCounts["Interview Completed"] + stats.statusCounts["Offer"], color: "#60a5fa" },
                    { label: "Screening", count: stats.statusCounts["Screening"] + stats.statusCounts["Interview Scheduled"] + stats.statusCounts["Interview Completed"] + stats.statusCounts["Offer"], color: "#fbbf24" },
                    { label: "Interview", count: stats.statusCounts["Interview Scheduled"] + stats.statusCounts["Interview Completed"] + stats.statusCounts["Offer"], color: "#a78bfa" },
                    { label: "Offer", count: stats.statusCounts["Offer"], color: "#34d399" },
                  ].map((stage, i) => {
                    const maxCount = stats.total;
                    const percentage = maxCount > 0 ? ((stage.count / maxCount) * 100).toFixed(1) : 0;
                    return (
                      <div key={i}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14 }}>
                          <span style={{ fontWeight: 600 }}>{stage.label}</span>
                          <span style={{ color: "var(--jt-muted)" }}>{stage.count} ({percentage}%)</span>
                        </div>
                        <div style={{ background: "var(--jt-bg)", borderRadius: "var(--jt-radius)", height: 32, overflow: "hidden", position: "relative" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${percentage}%`,
                              background: stage.color,
                              transition: "width 0.5s ease",
                              boxShadow: `0 0 15px ${stage.color}`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Customization Tab */}
        {activeTab === "customization" && (
  <CustomizationTab
  previewTheme={previewTheme}
  setPreviewTheme={setPreviewTheme}
  onApply={handleApplyTheme}
  onReset={handleResetPreview}
  showSaveSuccess={showSaveSuccess}
  S={S}
/>
)}

        {/* Backup Tab */}
        {activeTab === "backup" && (
          <div style={{ maxWidth: 800, margin: "0 auto" }}>
            <div style={S.card}>
              <div style={{ padding: 32 }}>
                <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                  <DatabaseBackup size={28} />
                  Backup & Restore
                </div>
                <div style={{ color: "var(--jt-muted)", marginBottom: 24, fontSize: 15 }}>
                  Create complete backups including all your applications and attached documents. Restore will overwrite your current data.
                </div>

                <div style={{ ...S.panel, padding: 16, fontSize: 14 }}>
                  Cloud Sync Active. Your data is automatically backed up to the cloud.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit Form Modal */}
        {showForm && (
          <div className="jt-modal">
            <div className="jt-card" style={{ width: "min(700px, 100%)", maxHeight: "90vh", overflow: "auto", overflowX: "hidden" }}>
              <form onSubmit={handleSubmit}>
                <div style={{ padding: 24, borderBottom: "1px solid var(--jt-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{editId ? "Edit Application" : "New Application"}</div>
                  <button type="button" onClick={resetForm} style={S.button("secondary")}>
                    <X size={18} />
                  </button>
                </div>

                <div style={{ padding: 24, display: "grid", gap: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                    <div style={{ position: "relative" }}>
                      <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Company *</label>
                      <input
                        required
                        value={formData.company}
                        onChange={(e) => {
                          setFormData((p) => ({ ...p, company: e.target.value }));
                          setShowCompanySuggestions(e.target.value.length > 0);
                        }}
                        onFocus={() => setShowCompanySuggestions(formData.company.length > 0)}
                        onBlur={() => setTimeout(() => setShowCompanySuggestions(false), 200)}
                        style={S.input}
                      />
                      {showCompanySuggestions && companySuggestions.filter(c => c.toLowerCase().includes(formData.company.toLowerCase())).length > 0 && (
                        <div className="autofill-suggestions">
                          {companySuggestions
                            .filter(c => c.toLowerCase().includes(formData.company.toLowerCase()))
                            .slice(0, 5)
                            .map((suggestion, i) => (
                              <div
                                key={i}
                                className="autofill-item"
                                onClick={() => {
                                  setFormData((p) => ({ ...p, company: suggestion }));
                                  setShowCompanySuggestions(false);
                                }}
                              >
                                {suggestion}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                    <div style={{ position: "relative" }}>
                      <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Position *</label>
                      <input
                        required
                        value={formData.position}
                        onChange={(e) => {
                          setFormData((p) => ({ ...p, position: e.target.value }));
                          setShowPositionSuggestions(e.target.value.length > 0);
                        }}
                        onFocus={() => setShowPositionSuggestions(formData.position.length > 0)}
                        onBlur={() => setTimeout(() => setShowPositionSuggestions(false), 200)}
                        style={S.input}
                      />
                      {showPositionSuggestions && positionSuggestions.filter(p => p.toLowerCase().includes(formData.position.toLowerCase())).length > 0 && (
                        <div className="autofill-suggestions">
                          {positionSuggestions
                            .filter(p => p.toLowerCase().includes(formData.position.toLowerCase()))
                            .slice(0, 5)
                            .map((suggestion, i) => (
                              <div
                                key={i}
                                className="autofill-item"
                                onClick={() => {
                                  setFormData((p) => ({ ...p, position: suggestion }));
                                  setShowPositionSuggestions(false);
                                }}
                              >
                                {suggestion}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                    <div style={{ position: "relative" }}>
                      <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Location</label>
                      <input
                        value={formData.location}
                        onChange={(e) => {
                          setFormData((p) => ({ ...p, location: e.target.value }));
                          setShowLocationSuggestions(e.target.value.length > 0);
                        }}
                        onFocus={() => setShowLocationSuggestions(formData.location.length > 0)}
                        onBlur={() => setTimeout(() => setShowLocationSuggestions(false), 200)}
                        style={S.input}
                      />
                      {showLocationSuggestions && locationSuggestions.filter(l => l.toLowerCase().includes(formData.location.toLowerCase())).length > 0 && (
                        <div className="autofill-suggestions">
                          {locationSuggestions
                            .filter(l => l.toLowerCase().includes(formData.location.toLowerCase()))
                            .slice(0, 5)
                            .map((suggestion, i) => (
                              <div
                                key={i}
                                className="autofill-item"
                                onClick={() => {
                                  setFormData((p) => ({ ...p, location: suggestion }));
                                  setShowLocationSuggestions(false);
                                }}
                              >
                                {suggestion}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Salary</label>
                      <input
                        value={formData.salary}
                        onChange={(e) => setFormData((p) => ({ ...p, salary: e.target.value }))}
                        style={S.input}
                        placeholder="e.g., 120000"
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                    <div>
                      <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Date Applied *</label>
                      <input
                        required
                        type="date"
                        value={formData.dateApplied}
                        onChange={(e) => setFormData((p) => ({ ...p, dateApplied: e.target.value }))}
                        style={S.input}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Status *</label>
                      <select
                        required
                        value={formData.status}
                        onChange={(e) => setFormData((p) => ({ ...p, status: e.target.value }))}
                        style={S.input}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                    <div>
                      <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Source</label>
                      <select
                        value={formData.source}
                        onChange={(e) => setFormData((p) => ({ ...p, source: e.target.value }))}
                        style={S.input}
                      >
                        {SOURCES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Job URL</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          value={formData.jobUrl}
                          onChange={(e) => setFormData((p) => ({ ...p, jobUrl: e.target.value }))}
                          style={{ ...S.input, flex: 1 }}
                          placeholder="https://..."
                        />
                        <button
                          type="button"
                          onClick={handleAutofill}
                          style={{ ...S.button("secondary"), padding: "10px 16px" }}
                          title="Autofill company and position from URL"
                        >
                          <Wand2 size={18} />
                        </button>
                      </div>
                  </div>
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                      style={{ ...S.input, minHeight: 80, resize: "vertical" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Documents</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                      {(formData.documents || []).map((doc, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 12px",
                            background: "var(--jt-bg)",
                            borderRadius: "var(--jt-radius)",
                            fontSize: 13,
                          }}
                        >
                          <File size={14} />
                          {doc.name}
                          <button
                            type="button"
                            onClick={() => handleRemoveDoc(i)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--jt-muted)",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={handleFileAttach} style={S.button("secondary")}>
                      <Upload size={16} /> Attach File
                    </button>
                    <div style={{ marginTop: 8, fontSize: 12, color: "var(--jt-muted)" }}>
                      File upload coming in Tier 4
                    </div>
                  </div>
                </div>

                <div style={{ padding: 24, borderTop: "1px solid var(--jt-border)", display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" onClick={resetForm} style={S.button("secondary")}>
                    Cancel
                  </button>
                  <button type="submit" style={S.button("primary")}>
                    {editId ? "Update" : "Create"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const ColorInput = ({ label, value, onChange }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontSize: 13, color: "var(--jt-muted)", marginBottom: 6 }}>{label}</div>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 50, height: 40, border: "none", borderRadius: "var(--jt-radius)", cursor: "pointer" }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          padding: "8px 12px",
          borderRadius: "var(--jt-radius)",
          border: "1px solid var(--jt-border)",
          background: "var(--jt-panel)",
          color: "var(--jt-text)",
          fontSize: 13,
        }}
      />
    </div>
  </div>
);
/** ---------- Customization Tab Component ---------- */
function CustomizationTab({previewTheme, 
  setPreviewTheme, 
  onApply, 
  onReset, 
  showSaveSuccess, 
  S 
}: any) {
  const [selectedPreset, setSelectedPreset] = useState(null);

  const applyPreset = (preset) => {
    setPreviewTheme(preset.theme);
    setSelectedPreset(preset.name);
  };

  

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Action Buttons */}
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button onClick={onReset} style={S.button("secondary")}>
          <Undo2 size={18} /> Reset Preview
        </button>
        <button onClick={onApply} style={S.button("primary")}>
          <Save size={18} /> Apply Changes
        </button>
        {showSaveSuccess && (
          <div style={{
            position: 'fixed',
            top: 20,
            right: 20,
            background: 'var(--jt-accent)',
            color: 'white',
            padding: '12px 20px',
            borderRadius: 'var(--jt-radius)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontWeight: 600,
            zIndex: 9999
          }}>
            <CheckCircle size={18} />
            Theme saved successfully!
          </div>
        )}
      </div>

      {/* Presets */}
      <div style={S.card}>
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles size={22} /> Beautiful Presets
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
            {BEAUTIFUL_PRESETS.map((preset) => (
              <div
                key={preset.name}
                className="preset-card"
                onClick={() => applyPreset(preset)}
                style={{
                  borderColor: selectedPreset === preset.name ? "var(--jt-accent)" : "var(--jt-border)",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>{preset.name}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {Object.values(preset.theme.palettes.dark).slice(0, 6).map((color, i) => (
                    <div
                      key={i}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: color,
                        boxShadow: `0 0 10px ${color}60`,
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Theme Settings */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: 24 }}>
        {/* General */}
        <div style={S.card}>
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>General Settings</span>
              <button
                onClick={() => setPreviewTheme((t) => ({ ...t, mode: t.mode === "dark" ? "light" : "dark" }))}
                style={S.button("secondary")}
              >
                {previewTheme.mode === "dark" ? <Moon size={16} /> : <Sun size={16} />}
                {previewTheme.mode === "dark" ? "Dark" : "Light"}
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "var(--jt-muted)", marginBottom: 6 }}>Title Color</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="color"
                  value={previewTheme.titleColor}
                  onChange={(e) => setPreviewTheme((t) => ({ ...t, titleColor: e.target.value }))}
                  style={{ width: 50, height: 40, border: "none", borderRadius: "var(--jt-radius)", cursor: "pointer" }}
                />
                <input
                  type="text"
                  value={previewTheme.titleColor}
                  onChange={(e) => setPreviewTheme((t) => ({ ...t, titleColor: e.target.value }))}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "var(--jt-radius)",
                    border: "1px solid var(--jt-border)",
                    background: "var(--jt-panel)",
                    color: "var(--jt-text)",
                    fontSize: 13,
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "var(--jt-muted)", marginBottom: 6 }}>Font Family</div>
              <input
                value={previewTheme.fontFamily}
                onChange={(e) => setPreviewTheme((t) => ({ ...t, fontFamily: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "var(--jt-radius)",
                  border: "1px solid var(--jt-border)",
                  background: "var(--jt-panel)",
                  color: "var(--jt-text)",
                  fontSize: 14,
                }}
                placeholder='e.g., "Inter", system-ui'
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "var(--jt-muted)", marginBottom: 6 }}>
                Border Radius: {previewTheme.radius}px
              </div>
              <input
                type="range"
                min={6}
                max={24}
                value={previewTheme.radius}
                onChange={(e) => setPreviewTheme((t) => ({ ...t, radius: Number(e.target.value) }))}
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "var(--jt-muted)", marginBottom: 6 }}>
                Density: {previewTheme.density.toFixed(2)}
              </div>
              <input
                type="range"
                min={0.85}
                max={1.2}
                step={0.01}
                value={previewTheme.density}
                onChange={(e) => setPreviewTheme((t) => ({ ...t, density: Number(e.target.value) }))}
                style={{ width: "100%" }}
              />
            </div>

            <div>
            <div style={{ fontSize: 13, color: "var(--jt-muted)", marginBottom: 6 }}>
              Panel Glow Intensity: {previewTheme.glowIntensity.toFixed(2)}
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={previewTheme.glowIntensity}
              onChange={(e) => setPreviewTheme((t) => ({ ...t, glowIntensity: Number(e.target.value) }))}
              style={{ width: "100%" }}
            />
          </div>

          {/* Add Title Glow slider here */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, color: "var(--jt-muted)", marginBottom: 6 }}>
              Title Glow Intensity: {previewTheme.titleGlow.toFixed(2)}
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={previewTheme.titleGlow}
              onChange={(e) => setPreviewTheme((t) => ({ ...t, titleGlow: Number(e.target.value) }))}
              style={{ width: "100%" }}
            />
          </div>
          </div>
        </div>

        {/* Dark Mode Colors */}
        <div style={S.card}>
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Dark Mode Palette</div>
            <ColorInput
              label="Accent"
              value={previewTheme.palettes.dark.accent}
              onChange={(v) =>
                setPreviewTheme((t) => ({
                  ...t,
                  palettes: { ...t.palettes, dark: { ...t.palettes.dark, accent: v } },
                }))
              }
            />
            <ColorInput
              label="Accent Glow"
              value={previewTheme.palettes.dark.accentGlow}
              onChange={(v) =>
                setPreviewTheme((t) => ({
                  ...t,
                  palettes: { ...t.palettes, dark: { ...t.palettes.dark, accentGlow: v } },
                }))
              }
            />
            <ColorInput
              label="Background"
              value={previewTheme.palettes.dark.bg}
              onChange={(v) =>
                setPreviewTheme((t) => ({
                  ...t,
                  palettes: { ...t.palettes, dark: { ...t.palettes.dark, bg: v } },
                }))
              }
            />
            <ColorInput
              label="Panel"
              value={previewTheme.palettes.dark.panel}
              onChange={(v) =>
                setPreviewTheme((t) => ({
                  ...t,
                  palettes: { ...t.palettes, dark: { ...t.palettes.dark, panel: v } },
                }))
              }
            />
            <ColorInput
              label="Border"
              value={previewTheme.palettes.dark.border}
              onChange={(v) =>
                setPreviewTheme((t) => ({
                  ...t,
                  palettes: { ...t.palettes, dark: { ...t.palettes.dark, border: v } },
                }))
              }
            />
            <ColorInput
              label="Text"
              value={previewTheme.palettes.dark.text}
              onChange={(v) =>
                setPreviewTheme((t) => ({
                  ...t,
                  palettes: { ...t.palettes, dark: { ...t.palettes.dark, text: v } },
                }))
              }
            />
            <ColorInput
              label="Muted"
              value={previewTheme.palettes.dark.muted}
              onChange={(v) =>
                setPreviewTheme((t) => ({
                  ...t,
                  palettes: { ...t.palettes, dark: { ...t.palettes.dark, muted: v } },
                }))
              }
            />
          </div>
        </div>

        {/* Light Mode Colors */}
        <div style={S.card}>
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Light Mode Palette</div>
            <ColorInput
              label="Accent"
              value={previewTheme.palettes.light.accent}
              onChange={(v) =>
                setPreviewTheme((t) => ({
                  ...t,
                  palettes: { ...t.palettes, light: { ...t.palettes.light, accent: v } },
                }))
              }
            />
            <ColorInput
              label="Accent Glow"
              value={previewTheme.palettes.light.accentGlow}
              onChange={(v) =>
                setPreviewTheme((t) => ({
                  ...t,
                  palettes: { ...t.palettes, light: { ...t.palettes.light, accentGlow: v } },
                }))
              }
            />
            <ColorInput
              label="Background"
              value={previewTheme.palettes.light.bg}
              onChange={(v) =>
                setPreviewTheme((t) => ({
                  ...t,
                  palettes: { ...t.palettes, light: { ...t.palettes.light, bg: v } },
                }))
              }
            />
            <ColorInput
              label="Panel"
              value={previewTheme.palettes.light.panel}
              onChange={(v) =>
                setPreviewTheme((t) => ({
                  ...t,
                  palettes: { ...t.palettes, light: { ...t.palettes.light, panel: v } },
                }))
              }
            />
            <ColorInput
              label="Border"
              value={previewTheme.palettes.light.border}
              onChange={(v) =>
                setPreviewTheme((t) => ({
                  ...t,
                  palettes: { ...t.palettes, light: { ...t.palettes.light, border: v } },
                }))
              }
            />
            <ColorInput
              label="Text"
              value={previewTheme.palettes.light.text}
              onChange={(v) =>
                setPreviewTheme((t) => ({
                  ...t,
                  palettes: { ...t.palettes, light: { ...t.palettes.light, text: v } },
                }))
              }
            />
            <ColorInput
              label="Muted"
              value={previewTheme.palettes.light.muted}
              onChange={(v) =>
                setPreviewTheme((t) => ({
                  ...t,
                  palettes: { ...t.palettes, light: { ...t.palettes.light, muted: v } },
                }))
              }
            />
          </div>
        </div>
      </div>

      {/* Info */}
      <div style={{ ...S.panel, padding: 20 }}>
        <div style={{ fontSize: 14, color: "var(--jt-muted)" }}>
          💡 <strong>Tip:</strong> Changes are previewed live but won't be saved until you click "Apply Changes". The color picker stays open so you can easily adjust colors.
        </div>
      </div>
    </div>
  );
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : "99, 102, 241";
}
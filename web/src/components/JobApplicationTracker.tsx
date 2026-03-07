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
  User,
  UserCircle2,
  Camera,
  Mail,
  Calendar,
  Shield,
  Pencil,
  AlertTriangle,
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
  // Prefer the DB last_updated timestamp if available
  if (app.last_updated) return new Date(app.last_updated).getTime();
  const tl = Array.isArray(app.timeline) ? app.timeline : [];
  if (!tl.length) return parseLocalYYYYMMDD(app.dateApplied)?.getTime() ?? Date.now();
  return tl.reduce((mx: number, e: any) => Math.max(mx, Number(e?.ts || 0)), 0) || Date.now();
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
const getProfileKey = (userId: string) => `jt.profile.v1.${userId}`;

// Provided avatar options (emoji-based, theme-aware)
const AVATAR_OPTIONS = [
  { id: "rocket",    emoji: "🚀", label: "Rocket"    },
  { id: "star",      emoji: "⭐", label: "Star"      },
  { id: "fire",      emoji: "🔥", label: "Fire"      },
  { id: "lightning", emoji: "⚡", label: "Lightning" },
  { id: "diamond",   emoji: "💎", label: "Diamond"   },
  { id: "crown",     emoji: "👑", label: "Crown"     },
  { id: "ninja",     emoji: "🥷", label: "Ninja"     },
  { id: "robot",     emoji: "🤖", label: "Robot"     },
  { id: "alien",     emoji: "👾", label: "Alien"     },
  { id: "fox",       emoji: "🦊", label: "Fox"       },
  { id: "dragon",    emoji: "🐉", label: "Dragon"    },
  { id: "owl",       emoji: "🦉", label: "Owl"       },
];

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
  const googleName: string = session?.user?.user_metadata?.full_name ?? session?.user?.email ?? "";
  const googleEmail: string = session?.user?.email ?? "";

  // Profile state
  const [displayName, setDisplayName] = useState<string>("");
  const [avatarId, setAvatarId] = useState<string>("rocket");
  const [joinedAt, setJoinedAt] = useState<string | null>(null);
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput, setNameInput] = useState("");

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
  // AI summary state

  const [formData, setFormData] = useState({
    company: "",
    position: "",
    location: "",
    salary: "",
    dateApplied: todayISO(),
    status: "Applied",
    jobUrl: "",
    source: "LinkedIn",
    referral: "No",
    notes: "",
    jobDescription: "",
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

  // Resume vault state
  const [resumes, setResumes] = useState<any[]>([]);
  const [resumesLoading, setResumesLoading] = useState(false);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeParseStatus, setResumeParseStatus] = useState<Record<string, "idle"|"parsing"|"done"|"error">>({});
  const [showMatchPanel, setShowMatchPanel] = useState(false);
  const [matchResumeId, setMatchResumeId] = useState<string>("");
  const [matchAppId, setMatchAppId] = useState<string>("");
  const [matchJD, setMatchJD] = useState<string>("");
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchResult, setMatchResult] = useState<any>(null);
  const [matchError, setMatchError] = useState<string | null>(null);

  // Match dialog — opened from the table row button
  const [matchDialogApp, setMatchDialogApp] = useState<any>(null);
  // Cache of scores per app id: { [appId]: number }
  const [appScores, setAppScores] = useState<Record<string, number>>({});

  const generateAiSummary = async () => {
    if (!apps.length || !session?.access_token) return;
    setLoadingSummary(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/summary`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apps: apps.map((a: any) => ({
            company: a.company,
            position: a.position,
            status: a.status,
            dateApplied: a.dateApplied,
            jobDescription: a.jobDescription || '',
          })),
        }),
      });
      const data = await res.json();
      if (data.success) setAiSummary(data.summary);
    } catch (err) {
      console.error('Mira summary failed:', err);
    } finally {
      setLoadingSummary(false);
    }
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
        // Use timeline from DB if it exists, otherwise seed with Applied entry
        const existingTimeline = Array.isArray(app.timeline) && app.timeline.length > 0
          ? app.timeline
          : [{ status: app.status || "Applied", ts: new Date(dateApplied).getTime() }];
        return ensureTimeline({
          ...app,
          jobUrl: app.job_url ?? app.jobUrl ?? "",
          jobDescription: app.job_description ?? app.jobDescription ?? "",
          referral: app.referral ?? "No",
          dateApplied,
          documents: app.documents ?? app.documents_json ?? app.documents ?? [],
          timeline: existingTimeline,
        });
      });

      setApps(mapped);
      // Load any previously cached match scores for the score column
      loadCachedScores(mapped);
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

  const saveProfileMeta = async (name: string, avatar: string) => {
    setDisplayName(name);
    setAvatarId(avatar);
    // persist locally too
    try {
      const cached = JSON.parse(localStorage.getItem(getProfileKey(userId)) || "{}");
      localStorage.setItem(getProfileKey(userId), JSON.stringify({ ...cached, displayName: name, avatarId: avatar }));
    } catch {}
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) return;
      await fetch(`${import.meta.env.VITE_API_URL}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentSession.access_token}` },
        body: JSON.stringify({ display_name: name, avatar_id: avatar }),
      });
    } catch (error) {
      console.error("Error saving profile meta:", error);
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
      // Also load cached profile meta
      try {
        const cachedMeta = JSON.parse(localStorage.getItem(getProfileKey(userId)) || "{}");
        if (cachedMeta.displayName) setDisplayName(cachedMeta.displayName);
        if (cachedMeta.avatarId) setAvatarId(cachedMeta.avatarId);
      } catch {}

      const res = await fetch(`${import.meta.env.VITE_API_URL}/profile`, {
        headers: { Authorization: `Bearer ${currentSession.access_token}` },
      });

      // 400/404 means no profile row exists (e.g. after account deletion + re-signup)
      // Treat this as a brand new user
      if (!res.ok) {
        setTheme(DEFAULT_THEME);
        setPreviewTheme(DEFAULT_THEME);
        writeCachedTheme(userId, DEFAULT_THEME);
        setNameInput(googleName);
        setShowNameModal(true);
        return;
      }

      const data = await res.json();

      if (data?.success && data?.data) {
        const profile = data.data;

        // Theme — cloud is source of truth
        if (profile.theme_settings && Object.keys(profile.theme_settings).length > 0) {
          setTheme(profile.theme_settings);
          setPreviewTheme(profile.theme_settings);
          writeCachedTheme(userId, profile.theme_settings);
        } else {
          setTheme(DEFAULT_THEME);
          setPreviewTheme(DEFAULT_THEME);
          writeCachedTheme(userId, DEFAULT_THEME);
        }

        // Display name
        if (profile.display_name) {
          setDisplayName(profile.display_name);
          try {
            const cm = JSON.parse(localStorage.getItem(getProfileKey(userId)) || "{}");
            localStorage.setItem(getProfileKey(userId), JSON.stringify({ ...cm, displayName: profile.display_name }));
          } catch {}
        } else {
          // First login — no name yet, show the name prompt modal
          setNameInput(googleName);
          setShowNameModal(true);
        }

        // Avatar
        if (profile.avatar_id) {
          setAvatarId(profile.avatar_id);
        }

        // Joined date from profile created_at
        if (profile.created_at) {
          setJoinedAt(profile.created_at);
        }
      } else {
        // New user with no profile at all
        setTheme(DEFAULT_THEME);
        setPreviewTheme(DEFAULT_THEME);
        writeCachedTheme(userId, DEFAULT_THEME);
        setNameInput(googleName);
        setShowNameModal(true);
      }
    } catch (error) {
      // Treat any error (including 400 "no rows found" after account deletion)
      // as a new user — show the welcome modal so they can set up fresh
      console.error("Error fetching profile — treating as new user:", error);
      setTheme(DEFAULT_THEME);
      setPreviewTheme(DEFAULT_THEME);
      setNameInput(googleName);
      setShowNameModal(true);
    }
  };
  
  useEffect(() => {
    if (session?.access_token) {
      fetchApps();
      fetchProfile();
    }
  }, [session]);

  // Auto-generate Mira summary when apps first load
  useEffect(() => {
    if (apps.length > 0 && !aiSummary && !loadingSummary) {
      generateAiSummary();
    }
  }, [apps]);

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

    const now = Date.now();

    // Build updated timeline — append new entry only if status changed
    let updatedTimeline: any[];
    if (editId) {
      const existingApp = apps.find((a: any) => a.id === editId);
      const prevTimeline: any[] = Array.isArray(existingApp?.timeline) ? existingApp.timeline : [];
      const lastStatus = prevTimeline[prevTimeline.length - 1]?.status;
      if (lastStatus !== formData.status) {
        updatedTimeline = [...prevTimeline, { status: formData.status, ts: now }];
      } else {
        updatedTimeline = prevTimeline;
      }
    } else {
      // New application — seed timeline with Applied entry
      updatedTimeline = [{ status: formData.status || "Applied", ts: now }];
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
      referral: formData.referral ?? "No",
      notes: formData.notes,
      job_description: formData.jobDescription,
      timeline: updatedTimeline,
      last_updated: new Date(now).toISOString(),
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
    referral: "No",
      notes: "",
      jobDescription: "",
      documents: [],
    });
    setShowForm(false);
    setEditId(null);
  };

  const handleEdit = (app: any) => {
    setFormData({ ...app, jobDescription: app.jobDescription ?? "" });
    setEditId(app.id);
    setShowForm(true);
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDelete = async (id: any) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = async (id: any) => {
    setDeleteConfirmId(null);

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

  const [autofillLoading, setAutofillLoading] = useState(false);

  const handleAutofill = async () => {
    if (!formData.jobUrl?.startsWith('http')) {
      alert('Paste a valid job URL first.');
      return;
    }
    setAutofillLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/autofill`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: formData.jobUrl }),
      });
      const data = await res.json();
      if (data.success) {
        const { company, position, location, salary, jobDescription } = data.data;
        setFormData((p) => ({
          ...p,
          ...(company        && { company }),
          ...(position       && { position }),
          ...(location       && { location }),
          ...(salary         && { salary }),
          ...(jobDescription && { jobDescription }),
        }));
      } else {
        alert(data.error || 'Autofill failed.');
      }
    } catch (err: any) {
      alert(err.message || 'Autofill failed.');
    } finally {
      setAutofillLoading(false);
    }
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
      a.company, a.position, a.location, a.salary, a.dateApplied,
      a.status, a.source, a.jobUrl, a.notes,
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

  // Open the match dialog for a specific app, pre-load cached score + resume list
  const openMatchDialog = async (app: any) => {
    setMatchDialogApp(app);
    setMatchResult(null);
    setMatchError(null);
    // Pre-fetch resumes if not already loaded
    if (resumes.length === 0) await fetchResumes();
    // Load any cached match result for this app
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/match/${app.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const d = await res.json();
        if (d.success && d.data) {
          setMatchResult(d.data);
          setAppScores(prev => ({ ...prev, [app.id]: d.data.score }));
        }
      }
    } catch {}
  };

  // After apps load, fetch cached scores for all apps in one pass
  const loadCachedScores = async (appList: any[]) => {
    const scores: Record<string, number> = {};
    await Promise.all(appList.map(async (app) => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/match/${app.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const d = await res.json();
          if (d.success && d.data?.score != null) scores[app.id] = d.data.score;
        }
      } catch {}
    }));
    setAppScores(scores);
  };

  const fetchResumes = async () => {
    if (!session?.access_token) return;
    setResumesLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/resumes`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.success) setResumes(data.data || []);
    } catch (err) {
      console.error("Failed to fetch resumes:", err);
    } finally {
      setResumesLoading(false);
    }
  };

  const handleResumeUpload = async (file: File) => {
    setResumeError(null);
    const allowed = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowed.includes(file.type)) {
      setResumeError("Only PDF, DOC, and DOCX files are accepted.");
      return;
    }
    if (resumes.length >= 3) {
      setResumeError("You've reached the 3-resume limit. Delete one to upload a new one.");
      return;
    }
    setResumeUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(",")[1];
        const res = await fetch(`${import.meta.env.VITE_API_URL}/resumes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type,
            fileData: base64,
            fileSize: file.size,
          }),
        });
        const data = await res.json();
        if (data.success) {
          await fetchResumes();
        } else {
          setResumeError(data.error || "Upload failed.");
        }
        setResumeUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setResumeError(err?.message || "Upload failed.");
      setResumeUploading(false);
    }
  };

  const handleResumeDelete = async (id: string) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/resumes/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.success) {
        setResumes((prev) => prev.filter((r) => r.id !== id));
      } else {
        setResumeError(data.error || "Delete failed.");
      }
    } catch (err: any) {
      setResumeError(err?.message || "Delete failed.");
    }
  };

  const handleResumeDownload = async (id: string) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/resumes/${id}/download`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.success) {
        const a = document.createElement("a");
        a.href = data.url;
        a.download = data.fileName;
        a.target = "_blank";
        a.click();
      } else {
        setResumeError(data.error || "Download failed.");
      }
    } catch (err: any) {
      setResumeError(err?.message || "Download failed.");
    }
  };

  const handleResumeParse = async (id: string) => {
    setResumeParseStatus((p) => ({ ...p, [id]: "parsing" }));
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/resumes/${id}/parse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.success) {
        setResumeParseStatus((p) => ({ ...p, [id]: "done" }));
        await fetchResumes();
      } else {
        setResumeParseStatus((p) => ({ ...p, [id]: "error" }));
        setResumeError(data.error || "Parse failed.");
      }
    } catch (err: any) {
      setResumeParseStatus((p) => ({ ...p, [id]: "error" }));
      setResumeError(err?.message || "Parse failed.");
    }
  };

  const handleRunMatch = async () => {
    if (!matchResumeId || !matchAppId || !matchJD.trim()) {
      setMatchError("Please select a resume, an application, and paste a job description.");
      return;
    }
    setMatchLoading(true);
    setMatchError(null);
    setMatchResult(null);
    try {
      // Set chosen resume as active first
      await fetch(`${import.meta.env.VITE_API_URL}/resumes/${matchResumeId}/active`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const res = await fetch(`${import.meta.env.VITE_API_URL}/match`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ applicationId: matchAppId, jdText: matchJD }),
      });
      const data = await res.json();
      if (data.success) {
        setMatchResult(data.data);
      } else {
        setMatchError(data.error || "Match failed.");
      }
    } catch (err: any) {
      setMatchError(err?.message || "Match failed.");
    } finally {
      setMatchLoading(false);
    }
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
<div style={{ marginBottom: 32, position: "relative" }}>
  <h1 style={{ fontSize: 42, fontWeight: 900, margin: 0, marginBottom: 8, color: "var(--jt-title)", textShadow: `0 0 calc(50px * var(--jt-title-glow)) var(--jt-title)` }}>
    {displayName ? `Welcome, ${displayName} 👋` : "Job Application Tracker"}
  </h1>
  {/* Avatar button — top right corner */}
  <button
    onClick={() => setActiveTab("profile")}
    title="My Profile"
    style={{
      position: "absolute",
      top: 0,
      right: 0,
      width: 48,
      height: 48,
      borderRadius: "50%",
      border: "2px solid var(--jt-accent)",
      background: "var(--jt-panel)",
      cursor: "pointer",
      fontSize: 24,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: `0 0 16px rgba(${hexToRgb(theme.palettes[theme.mode].accentGlow)}, calc(var(--jt-glow) * 0.5))`,
      transition: "all 0.2s ease",
    }}
  >
    {AVATAR_OPTIONS.find(a => a.id === avatarId)?.emoji ?? "🚀"}
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
          justifyContent: 'flex-start'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Mira's Insight
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
            onClick={() => { setActiveTab("files"); fetchResumes(); }}
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
            className={`jt-tab ${activeTab === "profile" ? "active" : ""}`}
            onClick={() => setActiveTab("profile")}
          >
            <User size={18} /> Profile
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
                      <th style={{ padding: "16px", textAlign: "left", fontWeight: 700, fontSize: 13, color: "var(--jt-muted)" }}>Referral</th>
                      <th style={{ padding: "16px", textAlign: "left", fontWeight: 700, fontSize: 13, color: "var(--jt-muted)" }}>Last Updated</th>
                      <th style={{ padding: "16px", textAlign: "left", fontWeight: 700, fontSize: 13, color: "var(--jt-muted)" }}>Applied</th>
                      <th style={{ padding: "16px", textAlign: "left", fontWeight: 700, fontSize: 13, color: "var(--jt-muted)" }}>Match</th>
                      <th style={{ padding: "16px", textAlign: "left", fontWeight: 700, fontSize: 13, color: "var(--jt-muted)" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={8} style={{ padding: 48, textAlign: "center", color: "var(--jt-muted)" }}>
                          Loading applications...
                        </td>
                      </tr>
                    ) : sortedApps.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ padding: 48, textAlign: "center", color: "var(--jt-muted)" }}>
                          No applications yet. Click "Add Application" to get started!
                        </td>
                      </tr>
                    ) : (
                      sortedApps.map((app) => (
                        <React.Fragment key={app.id}>
                          <tr
                            onClick={() => setExpandedApp(app.id)}
                            style={{
                              borderBottom: "1px solid var(--jt-border)",
                              transition: "background 0.2s ease",
                              cursor: "pointer",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--jt-panel)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
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
                            <td style={{ padding: "16px" }}>
                              {app.referral === "Yes" ? (
                                <div style={{
                                  display: "inline-flex", alignItems: "center", gap: 4,
                                  padding: "4px 10px", borderRadius: 999,
                                  fontSize: 12, fontWeight: 600,
                                  color: "#34d399",
                                  background: "rgba(52,211,153,0.1)",
                                  border: "1px solid rgba(52,211,153,0.35)",
                                }}>✓ Yes</div>
                              ) : (
                                <div style={{ fontSize: 13, color: "var(--jt-muted)" }}>N/A</div>
                              )}
                            </td>
                            <td style={{ padding: "16px", fontSize: 14, color: "var(--jt-text)" }}>
                              {formatShortDate(getLastUpdatedTs(app))}
                            </td>
                            <td style={{ padding: "16px", fontSize: 14, color: "var(--jt-muted)" }}>
                              {formatLocalYYYYMMDDToLocale(app.dateApplied)}
                            </td>
                            {/* Match Score column */}
                            <td style={{ padding: "16px" }}>
                              {appScores[app.id] != null ? (() => {
                                const s = appScores[app.id];
                                const color = s >= 75 ? "#34d399" : s >= 50 ? "#f59e0b" : "#f87171";
                                return (
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                    <div style={{
                                      width: 36, height: 36, borderRadius: "50%",
                                      border: `2px solid ${color}`,
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                      fontSize: 11, fontWeight: 800, color,
                                      boxShadow: `0 0 10px ${color}60`,
                                    }}>{s}</div>
                                  </div>
                                );
                              })() : (
                                <div style={{ fontSize: 12, color: "var(--jt-muted)", fontStyle: "italic" }}>—</div>
                              )}
                            </td>
                            <td style={{ padding: "16px" }}>
                              <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
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
                                  onClick={() => openMatchDialog(app)}
                                  style={{ ...S.button("secondary"), padding: "6px 10px", borderColor: "rgba(99,102,241,0.5)", color: "var(--jt-accent)" }}
                                  title="Match Resume"
                                >
                                  <Sparkles size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
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

            {/* Resume Vault */}
            <div style={S.card}>
              <div style={{ padding: 28 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                    <File size={22} /> Resume Vault
                  </div>
                  <div style={{
                    fontSize: 13, color: "var(--jt-muted)",
                    padding: "4px 12px", borderRadius: 999,
                    border: "1px solid var(--jt-border)",
                    background: "var(--jt-panel)",
                  }}>
                    {resumes.length} / 3 slots used
                  </div>
                </div>
                <div style={{ color: "var(--jt-muted)", fontSize: 13, marginBottom: 24 }}>
                  Store up to 3 resumes. Accepted formats: PDF, DOC, DOCX.
                </div>

                {/* Error banner */}
                {resumeError && (
                  <div style={{
                    padding: "12px 16px", borderRadius: "var(--jt-radius)",
                    background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.4)",
                    color: "#f87171", fontSize: 14, marginBottom: 20,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    {resumeError}
                    <button onClick={() => setResumeError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#f87171" }}>
                      <X size={16} />
                    </button>
                  </div>
                )}

                {/* Resume slots */}
                {resumesLoading ? (
                  <div style={{ color: "var(--jt-muted)", fontSize: 14, padding: "24px 0", textAlign: "center" }}>
                    Loading resumes...
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
                    {resumes.map((resume) => {
                      const ext = resume.file_name.split(".").pop()?.toUpperCase();
                      const sizeKb = resume.file_size ? `${(resume.file_size / 1024).toFixed(1)} KB` : "";
                      const uploadedDate = new Date(resume.uploaded_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
                      const extColor = ext === "PDF" ? "#f87171" : "#60a5fa";

                      return (
                        <div key={resume.id} style={{
                          ...S.panel,
                          padding: "16px 20px",
                          display: "flex", alignItems: "center", gap: 16,
                          transition: "all 0.2s ease",
                        }}>
                          {/* File type badge */}
                          <div style={{
                            width: 44, height: 44, borderRadius: 10,
                            background: `${extColor}18`,
                            border: `1px solid ${extColor}40`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 800, color: extColor, flexShrink: 0,
                          }}>
                            {ext}
                          </div>

                          {/* File info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {resume.file_name}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--jt-muted)" }}>
                              {sizeKb}{sizeKb && " · "}Uploaded {uploadedDate}
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                            {/* Parsed badge */}
                            {resume.extracted_text && (
                              <span style={{
                                fontSize: 11, fontWeight: 700, padding: "3px 8px",
                                borderRadius: 999, background: "rgba(16,185,129,0.15)",
                                border: "1px solid rgba(16,185,129,0.4)", color: "#10b981",
                              }}>✓ Parsed</span>
                            )}
                            {/* Parse button */}
                            <button
                              onClick={() => handleResumeParse(resume.id)}
                              disabled={resumeParseStatus[resume.id] === "parsing"}
                              title={resume.extracted_text ? "Re-parse" : "Parse for matching"}
                              style={{ ...S.button("secondary"), padding: "8px 14px", fontSize: 13 }}
                            >
                              {resumeParseStatus[resume.id] === "parsing" ? "Parsing…" : resume.extracted_text ? "Re-parse" : "Parse"}
                            </button>
                            <button
                              onClick={() => handleResumeDownload(resume.id)}
                              title="Download"
                              style={{ ...S.button("secondary"), padding: "8px 14px", fontSize: 13 }}
                            >
                              <ExternalLink size={15} /> View
                            </button>
                            <button
                              onClick={() => handleResumeDelete(resume.id)}
                              title="Delete"
                              style={{ ...S.button("secondary"), padding: "8px 12px", border: "1px solid rgba(248,113,113,0.4)", color: "#f87171" }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Empty slots */}
                    {Array.from({ length: 3 - resumes.length }).map((_, i) => (
                      <label key={`empty-${i}`} style={{
                        ...S.panel,
                        padding: "16px 20px",
                        display: "flex", alignItems: "center", gap: 16,
                        cursor: resumeUploading ? "not-allowed" : "pointer",
                        border: "1px dashed var(--jt-border)",
                        opacity: resumeUploading ? 0.6 : 1,
                        transition: "all 0.2s ease",
                      }}
                        onMouseEnter={(e) => { if (!resumeUploading) e.currentTarget.style.borderColor = "var(--jt-accent)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--jt-border)"; }}
                      >
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx"
                          style={{ display: "none" }}
                          disabled={resumeUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleResumeUpload(file);
                            e.target.value = "";
                          }}
                        />
                        <div style={{
                          width: 44, height: 44, borderRadius: 10,
                          background: "var(--jt-panel)",
                          border: "1px dashed var(--jt-border)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          {resumeUploading && i === 0 ? (
                            <div style={{ width: 16, height: 16, border: "2px solid var(--jt-accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                          ) : (
                            <Upload size={18} color="var(--jt-muted)" />
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--jt-muted)" }}>
                            {resumeUploading && i === 0 ? "Uploading..." : "Empty slot — click to upload"}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--jt-muted)", marginTop: 2 }}>PDF, DOC, DOCX</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Resume Match ── */}
            <div style={S.card}>
              <div style={{ padding: 28 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                    🎯 Resume Match
                  </div>
                  <button
                    onClick={() => { setShowMatchPanel(!showMatchPanel); setMatchResult(null); setMatchError(null); }}
                    style={{ ...S.button("secondary"), padding: "8px 16px", fontSize: 13 }}
                  >
                    {showMatchPanel ? "Hide" : "Match Resume to Job"}
                  </button>
                </div>
                <div style={{ color: "var(--jt-muted)", fontSize: 13 }}>
                  Score how well a parsed resume fits a specific job description.
                </div>

                {showMatchPanel && (
                  <div style={{ marginTop: 24, display: "grid", gap: 16 }}>
                    {matchError && (
                      <div style={{ padding: "12px 16px", borderRadius: "var(--jt-radius)", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.4)", color: "#f87171", fontSize: 14 }}>
                        {matchError}
                      </div>
                    )}

                    {/* Resume selector */}
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Select Resume</label>
                      <select
                        value={matchResumeId}
                        onChange={(e) => setMatchResumeId(e.target.value)}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--jt-radius)", border: "1px solid var(--jt-border)", background: "var(--jt-panel)", color: "var(--jt-text)", fontSize: 14 }}
                      >
                        <option value="">— choose a parsed resume —</option>
                        {resumes.filter((r) => r.extracted_text).map((r) => (
                          <option key={r.id} value={r.id}>{r.file_name}</option>
                        ))}
                      </select>
                      {resumes.filter((r) => r.extracted_text).length === 0 && (
                        <div style={{ fontSize: 12, color: "var(--jt-muted)", marginTop: 4 }}>No parsed resumes yet — hit Parse on a resume above first.</div>
                      )}
                    </div>

                    {/* Application selector */}
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Select Application</label>
                      <select
                        value={matchAppId}
                        onChange={(e) => setMatchAppId(e.target.value)}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--jt-radius)", border: "1px solid var(--jt-border)", background: "var(--jt-panel)", color: "var(--jt-text)", fontSize: 14 }}
                      >
                        <option value="">— choose an application —</option>
                        {apps.map((app: any) => (
                          <option key={app.id} value={app.id}>{app.company} — {app.position}</option>
                        ))}
                      </select>
                    </div>

                    {/* JD textarea */}
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Paste Job Description</label>
                      <textarea
                        value={matchJD}
                        onChange={(e) => setMatchJD(e.target.value)}
                        placeholder="Paste the full job description here…"
                        rows={8}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--jt-radius)", border: "1px solid var(--jt-border)", background: "var(--jt-panel)", color: "var(--jt-text)", fontSize: 14, resize: "vertical", boxSizing: "border-box" }}
                      />
                    </div>

                    <button
                      onClick={handleRunMatch}
                      disabled={matchLoading}
                      style={{ ...S.button("primary"), padding: "12px 24px", fontSize: 15, width: "fit-content" }}
                    >
                      {matchLoading ? "Analyzing…" : "Run Match"}
                    </button>

                    {/* Results */}
                    {matchResult && (
                      <div style={{ marginTop: 8, display: "grid", gap: 16 }}>
                        {/* Score card */}
                        <div style={{ ...S.panel, padding: 24, display: "flex", alignItems: "center", gap: 24 }}>
                          <div style={{ textAlign: "center", flexShrink: 0 }}>
                            <div style={{ fontSize: 52, fontWeight: 900, color: matchResult.score >= 70 ? "#10b981" : matchResult.score >= 45 ? "#f59e0b" : "#f87171", lineHeight: 1 }}>
                              {matchResult.score}
                            </div>
                            <div style={{ fontSize: 13, color: "var(--jt-muted)", marginTop: 4 }}>/ 100</div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                              {matchResult.score >= 70 ? "Strong Match 🟢" : matchResult.score >= 45 ? "Moderate Match 🟡" : "Weak Match 🔴"}
                            </div>
                            {matchResult.gpt_summary && (
                              <div style={{ fontSize: 14, color: "var(--jt-muted)", lineHeight: 1.5 }}>{matchResult.gpt_summary}</div>
                            )}
                          </div>
                        </div>

                        {/* Breakdown */}
                        {matchResult.breakdown && (
                          <div style={{ ...S.panel, padding: 20 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Score Breakdown</div>
                            {Object.entries(matchResult.breakdown).map(([key, val]: any) => (
                              <div key={key} style={{ marginBottom: 10 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                                  <span style={{ textTransform: "capitalize" }}>{key.replace(/_/g, " ")}</span>
                                  <span style={{ fontWeight: 700 }}>{val}</span>
                                </div>
                                <div style={{ height: 6, borderRadius: 3, background: "var(--jt-border)", overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${Math.min(100, (val / (key === "skills" ? 35 : key === "stack" ? 25 : key === "title" ? 20 : 10)) * 100)}%`, background: "var(--jt-accent)", borderRadius: 3, transition: "width 0.5s ease" }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Matched / Missing skills */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                          {matchResult.matched_skills?.length > 0 && (
                            <div style={{ ...S.panel, padding: 16 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#10b981" }}>✓ Matched Skills</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {matchResult.matched_skills.map((s: string) => (
                                  <span key={s} style={{ fontSize: 12, padding: "3px 8px", borderRadius: 999, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981" }}>{s}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {matchResult.missing_skills?.length > 0 && (
                            <div style={{ ...S.panel, padding: 16 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#f87171" }}>✗ Missing Skills</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {matchResult.missing_skills.map((s: string) => (
                                  <span key={s} style={{ fontSize: 12, padding: "3px 8px", borderRadius: 999, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171" }}>{s}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Application Documents (existing) */}
            {Object.keys(filesByCompany).length > 0 && (
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "var(--jt-muted)" }}>
                  Application Documents
                </div>
                {Object.entries(filesByCompany).map(([company, roles]) => (
                  <div key={company} style={{ ...S.card, marginBottom: 16 }}>
                    <div style={{ padding: 20, borderBottom: "1px solid var(--jt-border)" }}>
                      <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{company}</h3>
                    </div>
                    <div style={{ padding: 20 }}>
                      {Object.entries(roles).map(([position, docs]: any) => (
                        <div key={position} style={{ marginBottom: 20 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: "var(--jt-accent)" }}>{position}</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 10 }}>
                            {docs.map((doc: any, i: number) => (
                              <div key={i} onClick={() => openDoc(doc)} style={{
                                ...S.panel, padding: 14, cursor: "pointer",
                                display: "flex", alignItems: "center", gap: 12,
                                transition: "all 0.2s ease",
                              }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--jt-accent)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--jt-border)"; }}
                              >
                                <File size={22} color="var(--jt-accent)" />
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 600 }}>{cleanFileName(doc.name)}</div>
                                  <div style={{ fontSize: 11, color: "var(--jt-muted)", marginTop: 2 }}>{formatLocalYYYYMMDDToLocale(doc.dateApplied)}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Spinner keyframe */}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <ProfileTab
            displayName={displayName}
            avatarId={avatarId}
            googleEmail={googleEmail}
            joinedAt={joinedAt}
            appsCount={apps.length}
            onSaveProfileMeta={saveProfileMeta}
            onLogout={handleLogout}
            onExportCsv={exportCsv}
            onDeleteProfile={async () => {
              try {
                const { data: { session: cs } } = await supabase.auth.getSession();
                if (cs) await fetch(`${import.meta.env.VITE_API_URL}/profile`, { method: "DELETE", headers: { Authorization: `Bearer ${cs.access_token}` } });
              } catch {}
              localStorage.removeItem(getProfileKey(userId));
              localStorage.removeItem(getThemeKey(userId));
              await supabase.auth.signOut();
            }}
            S={S}
            theme={theme}
          />
        )}

        {/* Welcome / Name Modal — shown on first login */}
        {showNameModal && (
          <div className="jt-modal" style={{ zIndex: 2000 }}>
            <div className="jt-card" style={{ width: "min(480px, 100%)", padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>👋</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Welcome aboard!</div>
              <div style={{ color: "var(--jt-muted)", fontSize: 15, marginBottom: 28 }}>
                Let's set up your profile. What should we call you?
              </div>
              <input
                autoFocus
                placeholder="Enter your name"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && nameInput.trim()) {
                    saveProfileMeta(nameInput.trim(), avatarId);
                    setShowNameModal(false);
                  }
                }}
                style={{ ...S.input, fontSize: 16, textAlign: "center", marginBottom: 24 }}
              />
              <div style={{ fontSize: 14, color: "var(--jt-muted)", marginBottom: 16 }}>Pick an avatar</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 28 }}>
                {AVATAR_OPTIONS.map(av => (
                  <button
                    key={av.id}
                    title={av.label}
                    onClick={() => setAvatarId(av.id)}
                    style={{
                      width: "100%", aspectRatio: "1", borderRadius: "50%",
                      border: avatarId === av.id ? "2px solid var(--jt-accent)" : "2px solid var(--jt-border)",
                      background: avatarId === av.id ? `rgba(${hexToRgb(theme.palettes[theme.mode].accentGlow)}, 0.15)` : "var(--jt-panel)",
                      fontSize: 24, cursor: "pointer", transition: "all 0.2s ease",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {av.emoji}
                  </button>
                ))}
              </div>
              <button
                disabled={!nameInput.trim()}
                onClick={() => {
                  if (nameInput.trim()) {
                    saveProfileMeta(nameInput.trim(), avatarId);
                    setShowNameModal(false);
                  }
                }}
                style={{ ...S.button("primary"), width: "100%", justifyContent: "center", padding: "14px 0", fontSize: 16, opacity: nameInput.trim() ? 1 : 0.5 }}
              >
                Let's go! 🚀
              </button>
            </div>
          </div>
        )}

        {/* Application Detail Modal */}
        {expandedApp && (() => {
          const app = sortedApps.find((a) => a.id === expandedApp);
          if (!app) return null;
          return (
            <div className="jt-modal" style={{ zIndex: 1500, alignItems: "flex-start", paddingTop: 40 }}>
              <div className="jt-card" style={{ width: "min(740px, 100%)", maxHeight: "85vh", overflow: "auto", display: "flex", flexDirection: "column" }}>
                {/* Header */}
                <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--jt-border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{app.company}</div>
                    <div style={{ fontSize: 15, color: "var(--jt-muted)", marginBottom: 10 }}>{app.position}{app.location ? ` · ${app.location}` : ""}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{
                        padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                        background: STATUS_COLORS[app.status] || STATUS_COLORS.Applied,
                        color: "#fff", boxShadow: `0 0 12px ${STATUS_COLORS[app.status]}80`,
                      }}>{app.status}</div>
                      {app.source && <div style={{ padding: "4px 12px", borderRadius: 999, fontSize: 12, border: "1px solid var(--jt-border)", color: "var(--jt-muted)" }}>{app.source}</div>}
                      {app.salary && <div style={{ padding: "4px 12px", borderRadius: 999, fontSize: 12, border: "1px solid var(--jt-border)", color: "var(--jt-muted)" }}>USD {app.salary}</div>}
                      {app.referral === "Yes" && (
                        <div style={{
                          padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                          border: "1px solid rgba(52,211,153,0.5)",
                          color: "#34d399",
                          background: "rgba(52,211,153,0.1)",
                        }}>Referral</div>
                      )}

                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    {app.jobUrl && (
                      <button onClick={() => window.open(app.jobUrl, "_blank")} style={{ ...S.button("secondary"), padding: "8px 12px" }} title="Open Job URL">
                        <ExternalLink size={15} />
                      </button>
                    )}
                    <button onClick={() => { handleEdit(app); setExpandedApp(null); }} style={{ ...S.button("secondary"), padding: "8px 12px" }} title="Edit">
                      <Edit2 size={15} />
                    </button>
                    <button onClick={() => setExpandedApp(null)} style={{ ...S.button("secondary"), padding: "8px 12px" }}>
                      <X size={15} />
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div style={{ padding: 28, display: "grid", gap: 24, overflow: "auto" }}>

                  {/* Key info row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                    {[
                      { label: "Applied", value: formatLocalYYYYMMDDToLocale(app.dateApplied) },
                      { label: "Last Updated", value: formatShortDate(getLastUpdatedTs(app)) },
                      { label: "Source", value: app.source || "—" },
                      { label: "Salary", value: app.salary ? `USD ${app.salary}` : "—" },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ ...S.panel, padding: "12px 16px" }}>
                        <div style={{ fontSize: 11, color: "var(--jt-muted)", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Job Description */}
                  {app.jobDescription && (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--jt-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Job Description</div>
                      <div style={{
                        ...S.panel, padding: 16,
                        fontSize: 14, lineHeight: 1.7, color: "var(--jt-text)",
                        whiteSpace: "pre-wrap", maxHeight: 220, overflowY: "auto",
                      }}>
                        {app.jobDescription}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {app.notes && (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--jt-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Notes</div>
                      <div style={{ ...S.panel, padding: 16, fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                        {app.notes}
                      </div>
                    </div>
                  )}

                  {/* Timeline */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--jt-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Timeline</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {(app.timeline || []).map((t: any, i: number) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "10px 14px", background: "var(--jt-panel)",
                          borderRadius: "var(--jt-radius)", fontSize: 14,
                        }}>
                          <div style={{
                            width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                            background: STATUS_COLORS[t.status] || STATUS_COLORS.Applied,
                            boxShadow: `0 0 8px ${STATUS_COLORS[t.status]}`,
                          }} />
                          <div style={{ flex: 1, fontWeight: 600 }}>{t.status}</div>
                          <div style={{ color: "var(--jt-muted)", fontSize: 13 }}>{formatShortDate(t.ts)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Documents */}
                  {app.documents && app.documents.length > 0 && (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--jt-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Documents</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {app.documents.map((doc: any, i: number) => (
                          <button key={i} onClick={() => openDoc(doc)} style={{ ...S.button("secondary"), padding: "8px 14px", fontSize: 13 }}>
                            <File size={14} /> {doc.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Resume Match Dialog ── */}
        {matchDialogApp && (() => {
          const app = matchDialogApp;
          const parsedResumes = resumes.filter((r: any) => r.resume_hash);
          const activeResume = parsedResumes.find((r: any) => r.is_active) || parsedResumes[0];
          const selectedResume = resumes.find((r: any) => r.id === matchResumeId) || activeResume;

          const scoreColor = (s: number) => s >= 75 ? "#34d399" : s >= 50 ? "#f59e0b" : "#f87171";
          const scoreLabel = (s: number) => s >= 75 ? "Strong Match 🟢" : s >= 50 ? "Partial Match 🟡" : "Weak Match 🔴";

          const runMatch = async () => {
            const resumeId = selectedResume?.id;
            if (!resumeId) { setMatchError("No parsed resume found. Go to Files → Parse a resume first."); return; }
            setMatchLoading(true);
            setMatchError(null);
            setMatchResult(null);
            try {
              const res = await fetch(`${import.meta.env.VITE_API_URL}/match`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ applicationId: app.id, resumeId }),
              });
              const d = await res.json();
              if (!d.success) throw new Error(d.error || "Match failed");
              setMatchResult(d.data);
              // Update the score badge in the table
              setAppScores(prev => ({ ...prev, [app.id]: d.data.score }));
            } catch (e: any) {
              setMatchError(e.message);
            } finally {
              setMatchLoading(false);
            }
          };

          return (
            <div className="jt-modal" style={{ zIndex: 1600, alignItems: "flex-start", paddingTop: 40 }}>
              <div className="jt-card" style={{ width: "min(680px, 100%)", maxHeight: "88vh", overflow: "auto", display: "flex", flexDirection: "column" }}>

                {/* Header */}
                <div style={{ padding: "22px 28px", borderBottom: "1px solid var(--jt-border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <Sparkles size={18} color="var(--jt-accent)" />
                      <span style={{ fontSize: 18, fontWeight: 800 }}>Resume Match</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--jt-muted)" }}>{app.company} — {app.position}</div>
                  </div>
                  <button onClick={() => { setMatchDialogApp(null); setMatchResult(null); setMatchError(null); }} style={{ ...S.button("secondary"), padding: "8px 12px" }}>
                    <X size={15} />
                  </button>
                </div>

                {/* Body */}
                <div style={{ padding: 28, display: "grid", gap: 20, overflow: "auto" }}>

                  {/* Resume selector */}
                  {parsedResumes.length === 0 ? (
                    <div style={{ padding: "14px 18px", borderRadius: "var(--jt-radius)", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b", fontSize: 14 }}>
                      ⚠ No parsed resumes found. Go to <strong>Files</strong> and click <strong>Parse</strong> on a resume first.
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--jt-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Resume</div>
                      <select
                        value={matchResumeId || activeResume?.id || ""}
                        onChange={e => setMatchResumeId(e.target.value)}
                        style={{ width: "100%", padding: "10px 12px", background: "var(--jt-panel)", border: "1px solid var(--jt-border)", borderRadius: "var(--jt-radius)", color: "var(--jt-text)", fontSize: 14 }}
                      >
                        {parsedResumes.map((r: any) => (
                          <option key={r.id} value={r.id}>{r.file_name}{r.is_active ? " ✓ active" : ""}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* JD status */}
                  <div style={{ padding: "12px 16px", borderRadius: "var(--jt-radius)", background: app.jobDescription ? "rgba(52,211,153,0.07)" : "rgba(99,102,241,0.07)", border: `1px solid ${app.jobDescription ? "rgba(52,211,153,0.25)" : "rgba(99,102,241,0.25)"}`, fontSize: 13 }}>
                    {app.jobDescription
                      ? <span style={{ color: "#34d399" }}>✓ Job description found — ready to match</span>
                      : <span style={{ color: "var(--jt-muted)" }}>⚠ No job description on this application. Edit the application and add one for best results.</span>
                    }
                  </div>

                  {/* Error */}
                  {matchError && (
                    <div style={{ padding: "12px 16px", borderRadius: "var(--jt-radius)", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.35)", color: "#f87171", fontSize: 13 }}>
                      {matchError}
                    </div>
                  )}

                  {/* Run button */}
                  {!matchResult && (
                    <button
                      onClick={runMatch}
                      disabled={matchLoading || parsedResumes.length === 0}
                      style={{ ...S.button("primary"), justifyContent: "center", padding: "13px 0", fontSize: 15, opacity: (matchLoading || parsedResumes.length === 0) ? 0.6 : 1 }}
                    >
                      {matchLoading ? (
                        <>
                          <span style={{ width: 16, height: 16, border: "2px solid #ffffff40", borderTop: "2px solid #fff", borderRadius: "50%", display: "inline-block", animation: "jt-spin 0.8s linear infinite" }} />
                          Analyzing… this takes 10–15 seconds
                        </>
                      ) : (
                        <><Sparkles size={16} /> Run Match</>
                      )}
                    </button>
                  )}

                  {/* Loading state — progressive message */}
                  {matchLoading && (
                    <div style={{ textAlign: "center", color: "var(--jt-muted)", fontSize: 13, lineHeight: 1.8 }}>
                      <div>Parsing job description and resume with AI…</div>
                      <div>Computing skill overlap…</div>
                      <div>Generating personalized suggestions…</div>
                    </div>
                  )}

                  {/* Results */}
                  {matchResult && !matchLoading && (() => {
                    const score = matchResult.score;
                    const bd = matchResult.score_breakdown;
                    const exp = matchResult.explanation || {};
                    return (
                      <div style={{ display: "grid", gap: 16 }}>
                        <style>{`@keyframes jt-spin { to { transform: rotate(360deg); } }`}</style>

                        {/* Score ring + breakdown */}
                        <div style={{ ...S.panel, padding: "20px 24px", display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap", borderColor: `${scoreColor(score)}40` }}>
                          <div style={{ textAlign: "center", flexShrink: 0 }}>
                            <div style={{ fontSize: 56, fontWeight: 900, color: scoreColor(score), lineHeight: 1 }}>{score}</div>
                            <div style={{ fontSize: 13, color: "var(--jt-muted)", marginTop: 2 }}>/100</div>
                            <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: scoreColor(score) }}>{scoreLabel(score)}</div>
                          </div>
                          {bd && (
                            <div style={{ flex: 1, minWidth: 200, display: "grid", gap: 8 }}>
                              {([
                                ["Required Skills", bd.requiredScore ?? bd.skillOverlap, 50],
                                ["Preferred Skills", bd.preferredScore ?? bd.stackOverlap, 30],
                                ["Experience", bd.experienceScore ?? bd.titleSimilarity, 20],
                              ] as [string, number, number][]).map(([label, val, max]) => (
                                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ fontSize: 11, color: "var(--jt-muted)", width: 110, flexShrink: 0 }}>{label}</div>
                                  <div style={{ flex: 1, height: 5, background: "var(--jt-bg)", borderRadius: 3, overflow: "hidden" }}>
                                    <div style={{ width: `${Math.max(0, (val / max) * 100)}%`, height: "100%", background: scoreColor(score), borderRadius: 3, transition: "width 0.6s ease" }} />
                                  </div>
                                  <div style={{ fontSize: 11, color: "var(--jt-muted)", width: 36, textAlign: "right" }}>{val}/{max}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* AI Summary */}
                        {exp.summary && (
                          <div style={{ ...S.panel, padding: "14px 18px", borderLeft: `3px solid ${scoreColor(score)}`, fontSize: 14, lineHeight: 1.7 }}>
                            {exp.summary}
                          </div>
                        )}

                        {/* Matched / Missing skills */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div style={{ ...S.panel, padding: "14px 16px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#34d399", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                              ✓ Matched ({matchResult.matched_skills?.length || 0})
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                              {(matchResult.matched_skills || []).slice(0, 12).map((s: string) => (
                                <span key={s} style={{ padding: "3px 8px", borderRadius: 999, fontSize: 11, background: "rgba(52,211,153,0.1)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }}>{s}</span>
                              ))}
                              {!matchResult.matched_skills?.length && <span style={{ color: "var(--jt-muted)", fontSize: 12 }}>None detected</span>}
                            </div>
                          </div>
                          <div style={{ ...S.panel, padding: "14px 16px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                              ✗ Missing ({matchResult.missing_skills?.length || 0})
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                              {(matchResult.missing_skills || []).slice(0, 12).map((s: string) => (
                                <span key={s} style={{ padding: "3px 8px", borderRadius: 999, fontSize: 11, background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.25)" }}>{s}</span>
                              ))}
                              {!matchResult.missing_skills?.length && <span style={{ color: "var(--jt-muted)", fontSize: 12 }}>None</span>}
                            </div>
                          </div>
                        </div>

                        {/* Bullet observations */}
                        {exp.bulletPoints?.length > 0 && (
                          <div style={{ ...S.panel, padding: "14px 18px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--jt-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Observations</div>
                            {exp.bulletPoints.map((b: string, i: number) => (
                              <div key={i} style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 6, paddingLeft: 14, position: "relative" }}>
                                <span style={{ position: "absolute", left: 0, color: "var(--jt-accent)" }}>•</span>{b}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Resume rewrites */}
                        {exp.resumeRewrites?.length > 0 && (
                          <div style={{ ...S.panel, padding: "14px 18px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--jt-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>Suggested Rewrites</div>
                            {exp.resumeRewrites.map((rw: any, i: number) => (
                              <div key={i} style={{ marginBottom: 14 }}>
                                <div style={{ fontSize: 12, color: "#f87171", textDecoration: "line-through", marginBottom: 4, opacity: 0.8 }}>{rw.original}</div>
                                <div style={{ fontSize: 13, color: "#34d399", paddingLeft: 10, borderLeft: "2px solid #34d39940" }}>{rw.rewritten}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Action steps */}
                        {exp.actionSteps?.length > 0 && (
                          <div style={{ ...S.panel, padding: "14px 18px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--jt-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Action Steps</div>
                            {exp.actionSteps.map((step: string, i: number) => (
                              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, fontSize: 13, lineHeight: 1.5 }}>
                                <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: "50%", background: "var(--jt-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>{i + 1}</span>
                                {step}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Re-run button */}
                        <button
                          onClick={() => { setMatchResult(null); setMatchError(null); }}
                          style={{ ...S.button("secondary"), width: "fit-content", fontSize: 13 }}
                        >
                          ↩ Re-run with different resume
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Delete Confirmation Dialog */}
        {deleteConfirmId && (
          <div className="jt-modal" style={{ zIndex: 1500 }}>
            <div className="jt-card" style={{
              width: "min(380px, 100%)",
              padding: 32,
              textAlign: "center",
              animation: "none",
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Delete Application?</div>
              <div style={{ color: "var(--jt-muted)", fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
                This will permanently remove the application from your tracker. This cannot be undone.
              </div>
              <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  style={S.button("secondary")}
                >
                  Cancel
                </button>
                <button
                  onClick={() => confirmDelete(deleteConfirmId)}
                  style={{ ...S.button("secondary"), border: "1px solid rgba(248,113,113,0.5)", color: "#f87171" }}
                >
                  <Trash2 size={15} /> Delete
                </button>
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
                      <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Referral</label>
                      <select
                        value={formData.referral ?? "No"}
                        onChange={(e) => setFormData((p) => ({ ...p, referral: e.target.value }))}
                        style={S.input}
                      >
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
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
                          disabled={autofillLoading}
                          style={{ ...S.button("secondary"), padding: "10px 16px", minWidth: 44 }}
                          title="Autofill from URL"
                        >
                          {autofillLoading
                            ? <div style={{ width: 16, height: 16, border: "2px solid var(--jt-accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                            : <Wand2 size={18} />}
                        </button>
                      </div>
                  </div>
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Job Description</label>
                    <textarea
                      value={formData.jobDescription}
                      onChange={(e) => setFormData((p) => ({ ...p, jobDescription: e.target.value }))}
                      placeholder="Paste the job description here..."
                      style={{ ...S.input, minHeight: 120, resize: "vertical", fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 }}>Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                      style={{ ...S.input, minHeight: 80, resize: "vertical" }}
                    />
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
/** ---------- Profile Tab Component ---------- */
function ProfileTab({ displayName, avatarId, googleEmail, joinedAt, appsCount, onSaveProfileMeta, onLogout, onExportCsv, onDeleteProfile, S, theme }: any) {
  const [editingName, setEditingName] = useState(false);
  const [localName, setLocalName] = useState(displayName);
  const [localAvatar, setLocalAvatar] = useState(avatarId);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Sync local state when parent updates
  useEffect(() => { setLocalName(displayName); }, [displayName]);
  useEffect(() => { setLocalAvatar(avatarId); }, [avatarId]);

  const memberDays = joinedAt
    ? Math.floor((Date.now() - new Date(joinedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const memberSince = joinedAt
    ? new Date(joinedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "—";
  const glowColor = hexToRgb(theme.palettes[theme.mode].accentGlow);

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", display: "grid", gap: 24 }}>

      {/* Identity Card */}
      <div style={S.card}>
        <div style={{ padding: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 28 }}>
            <div style={{
              width: 80, height: 80, borderRadius: "50%",
              border: "3px solid var(--jt-accent)",
              background: "var(--jt-panel)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 42, flexShrink: 0,
              boxShadow: `0 0 24px rgba(${glowColor}, calc(var(--jt-glow) * 0.6))`,
            }}>
              {AVATAR_OPTIONS.find(a => a.id === localAvatar)?.emoji ?? "🚀"}
            </div>
            <div style={{ flex: 1 }}>
              {editingName ? (
                <input
                  autoFocus
                  value={localName}
                  onChange={e => setLocalName(e.target.value)}
                  style={{ ...S.input, fontSize: 22, fontWeight: 700, marginBottom: 8 }}
                  onKeyDown={e => { if (e.key === "Enter") { onSaveProfileMeta(localName, localAvatar); setEditingName(false); } }}
                />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 26, fontWeight: 800 }}>{displayName || "—"}</span>
                  <button onClick={() => { setLocalName(displayName); setEditingName(true); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--jt-muted)", padding: 4 }}>
                    <Pencil size={16} />
                  </button>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--jt-muted)", fontSize: 14 }}>
                <Mail size={14} /> {googleEmail}
              </div>
            </div>
            {editingName && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { onSaveProfileMeta(localName, localAvatar); setEditingName(false); }} style={S.button("primary")}>
                  <Save size={15} /> Save
                </button>
                <button onClick={() => setEditingName(false)} style={S.button("secondary")}>
                  <X size={15} />
                </button>
              </div>
            )}
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {[
              { label: "Member Since", value: memberSince, icon: <Calendar size={18} /> },
              { label: "Days Active", value: memberDays !== null ? `${memberDays} days` : "—", icon: <Clock size={18} /> },
              { label: "Applications", value: appsCount, icon: <BarChart3 size={18} /> },
            ].map(({ label, value, icon }) => (
              <div key={label} style={{ ...S.panel, padding: "16px 20px", textAlign: "center" }}>
                <div style={{ color: "var(--jt-accent)", marginBottom: 6, display: "flex", justifyContent: "center" }}>{icon}</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
                <div style={{ color: "var(--jt-muted)", fontSize: 12, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Avatar Picker */}
      <div style={S.card}>
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <Camera size={20} /> Choose Your Avatar
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
            {AVATAR_OPTIONS.map(av => (
              <button
                key={av.id}
                title={av.label}
                onClick={() => { setLocalAvatar(av.id); onSaveProfileMeta(displayName, av.id); }}
                style={{
                  width: "100%", aspectRatio: "1", borderRadius: "50%",
                  border: localAvatar === av.id ? "2px solid var(--jt-accent)" : "2px solid var(--jt-border)",
                  background: localAvatar === av.id ? `rgba(${glowColor}, 0.15)` : "var(--jt-panel)",
                  fontSize: 28, cursor: "pointer", transition: "all 0.2s ease",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: localAvatar === av.id ? `0 0 16px rgba(${glowColor}, 0.4)` : "none",
                }}
              >
                {av.emoji}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Account Settings */}
      <div style={S.card}>
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <Shield size={20} /> Account Settings
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ ...S.panel, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Sign-in Method</div>
                <div style={{ color: "var(--jt-muted)", fontSize: 13, marginTop: 2 }}>Google OAuth</div>
              </div>
              <div style={{ padding: "4px 12px", borderRadius: 999, background: "rgba(52,211,153,0.12)", color: "#34d399", fontSize: 12, fontWeight: 600, border: "1px solid rgba(52,211,153,0.3)" }}>
                Active
              </div>
            </div>
            <div style={{ ...S.panel, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Data Storage</div>
                <div style={{ color: "var(--jt-muted)", fontSize: 13, marginTop: 2 }}>Supabase (PostgreSQL) — encrypted at rest</div>
              </div>
              <div style={{ padding: "4px 12px", borderRadius: 999, background: "rgba(99,102,241,0.12)", color: "var(--jt-accent)", fontSize: 12, fontWeight: 600, border: "1px solid rgba(99,102,241,0.3)" }}>
                Secure
              </div>
            </div>
            <button onClick={onLogout} style={{ ...S.button("secondary"), justifyContent: "flex-start", padding: "14px 18px", borderRadius: "var(--jt-radius)", width: "100%" }}>
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Backup */}
      <div style={S.card}>
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
            <DatabaseBackup size={20} /> Backup
          </div>
          <div style={{ color: "var(--jt-muted)", fontSize: 13, marginBottom: 20 }}>
            Download a full copy of your applications as a CSV file. Your data is also automatically synced to the cloud.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              onClick={onExportCsv}
              style={{ ...S.button("primary"), gap: 8 }}
            >
              <Upload size={16} /> Download Backup (.csv)
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--jt-muted)", fontSize: 13 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px #34d399" }} />
              Cloud sync active — {appsCount} application{appsCount !== 1 ? "s" : ""} stored
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div style={{ ...S.card, border: "1px solid rgba(248,113,113,0.35)" }}>
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#f87171", display: "flex", alignItems: "center", gap: 10 }}>
            <AlertTriangle size={20} /> Danger Zone
          </div>
          {!showDeleteConfirm ? (
            <button onClick={() => setShowDeleteConfirm(true)} style={{ ...S.button("secondary"), border: "1px solid rgba(248,113,113,0.5)", color: "#f87171" }}>
              <Trash2 size={16} /> Delete My Profile & All Data
            </button>
          ) : (
            <div style={{ ...S.panel, padding: 20, border: "1px solid rgba(248,113,113,0.4)" }}>
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--jt-muted)" }}>
                This will permanently delete your profile settings. Your applications will remain until you remove them manually. This cannot be undone.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={onDeleteProfile} style={{ ...S.button("secondary"), border: "1px solid rgba(248,113,113,0.5)", color: "#f87171" }}>
                  Yes, delete everything
                </button>
                <button onClick={() => setShowDeleteConfirm(false)} style={S.button("secondary")}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

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
import { useState } from "react";
import { LayoutDashboard, BookOpen, BarChart3, User, LogOut, Briefcase, FileText, Wand2, Target, Activity, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type TabId = "applications" | "master-info" | "analytics" | "profile" | "resume-builder" | "tailor" | "jobs" | "api-usage";

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onLogout: () => void;
  displayName: string;
  googleEmail: string;
  googleAvatarUrl: string | null;
  appCount: number;
}

const NAV_ITEMS: { id: TabId; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: "applications",    label: "Applications",   icon: ({ className }) => <LayoutDashboard className={className} /> },
  { id: "jobs",            label: "Jobs",           icon: ({ className }) => <Target className={className} />        },
  { id: "master-info",     label: "Master Info",    icon: ({ className }) => <BookOpen className={className} />     },
  { id: "analytics",      label: "Analytics",      icon: ({ className }) => <BarChart3 className={className} />      },
  { id: "resume-builder", label: "Resume Builder", icon: ({ className }) => <FileText className={className} />       },
  { id: "tailor",         label: "Tailor",         icon: ({ className }) => <Wand2 className={className} />          },
  { id: "api-usage",      label: "API Usage",      icon: ({ className }) => <Activity className={className} />       },
  { id: "profile",        label: "Profile",        icon: ({ className }) => <User className={className} />           },
];

function Logo({ onClick }: { onClick?: () => void }) {
  const content = (
    <>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary shadow-md shadow-primary/20">
        <Briefcase className="h-4 w-4 text-primary-foreground" />
      </div>
      <div>
        <span className="font-bold text-[14px] tracking-tight text-foreground font-headline">
          Zenith
        </span>
        <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground font-label leading-tight">
          Command Center
        </p>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="flex items-center gap-2.5">
        {content}
      </button>
    );
  }
  return <div className="flex items-center gap-2.5">{content}</div>;
}

export default function Sidebar({
  activeTab, onTabChange, onLogout,
  displayName, googleEmail, googleAvatarUrl, appCount,
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const initials = (displayName || googleEmail || "?")
    .split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  const handleTabChange = (tab: TabId) => {
    onTabChange(tab);
    setMobileOpen(false);
  };

  const NavButton = ({ id, label, icon: Icon }: (typeof NAV_ITEMS)[0]) => {
    const isActive = activeTab === id;
    return (
      <button
        onClick={() => handleTabChange(id)}
        className={cn(
          "relative w-full flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium transition-all duration-150 rounded-lg",
          isActive
            ? "bg-primary text-primary-foreground shadow-sm dark:bg-primary/[0.08] dark:text-primary dark:shadow-none"
            : "text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-white/[0.04] dark:hover:text-foreground"
        )}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-[18px] w-0.5 rounded-r-full hidden dark:block dark:bg-primary" />
        )}
        <span className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
          isActive ? "bg-white/20 dark:bg-primary/15" : "bg-transparent"
        )}>
          <Icon className={cn(
            "h-3.5 w-3.5",
            isActive ? "text-primary-foreground dark:text-primary" : ""
          )} />
        </span>
        <span className="font-label">{label}</span>
        {id === "applications" && appCount > 0 && (
          <span className={cn(
            "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums font-label",
            isActive
              ? "bg-white/25 text-primary-foreground dark:bg-primary/20 dark:text-primary"
              : "bg-muted-foreground/10 text-muted-foreground dark:bg-white/[0.06]"
          )}>
            {appCount}
          </span>
        )}
      </button>
    );
  };

  const UserFooter = () => (
    <div className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted dark:hover:bg-white/[0.04] cursor-default">
      <Avatar className="h-7 w-7 shrink-0 ring-1 ring-border">
        {googleAvatarUrl && <AvatarImage src={googleAvatarUrl} alt={displayName} />}
        <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary dark:bg-primary/20">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-foreground truncate leading-tight">
          {displayName || "User"}
        </p>
        <p className="text-[10px] text-muted-foreground truncate font-label">{googleEmail}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onLogout}
      >
        <LogOut className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  return (
    <TooltipProvider delayDuration={0}>
      {/* ── Mobile top bar ─────────────────────────────────────────── */}
      <div className="flex md:hidden h-[56px] shrink-0 items-center justify-between gap-2 px-3 border-b border-border bg-sidebar/95 backdrop-blur-xl">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-muted dark:hover:bg-white/[0.06] transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0 flex justify-center">
          <Logo onClick={() => handleTabChange("applications")} />
        </div>
        <button
          type="button"
          aria-label="Open profile"
          onClick={() => handleTabChange("profile")}
          className="shrink-0 rounded-full"
        >
          <Avatar className="h-8 w-8 ring-1 ring-border">
            {googleAvatarUrl && <AvatarImage src={googleAvatarUrl} alt={displayName} />}
            <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary dark:bg-primary/20">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </div>

      {/* ── Mobile drawer ──────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-[80%] max-w-[300px] flex flex-col bg-sidebar shadow-2xl animate-slide-up">
            <div className="flex h-[56px] shrink-0 items-center justify-between px-4 border-b border-border">
              <Logo onClick={() => handleTabChange("applications")} />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted dark:hover:bg-white/[0.06] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 space-y-0.5 px-2 py-3 overflow-y-auto">
              {NAV_ITEMS.map((item) => <NavButton key={item.id} {...item} />)}
            </nav>
            <div className="border-t border-border p-2 shrink-0">
              <UserFooter />
            </div>
          </aside>
        </div>
      )}

      {/* ── Desktop sidebar ────────────────────────────────────────── */}
      <aside className="hidden md:flex h-screen w-[220px] shrink-0 flex-col bg-sidebar/90 backdrop-blur-xl border-r border-border">
        <div className="flex h-[60px] items-center px-4 border-b border-border">
          <Logo onClick={() => handleTabChange("applications")} />
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-3">
          {NAV_ITEMS.map((item) => {
            const { id, label } = item;
            return (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <div><NavButton {...item} /></div>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <div className="border-t border-border p-2">
          <UserFooter />
        </div>
      </aside>
    </TooltipProvider>
  );
}

import { Home, Inbox, Plus, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/projects";

interface Props {
  projects: Project[];
  unassignedCount: number;
  screen: "home" | "project" | "meeting" | "settings";
  activeProjectId: string | null | undefined;
  query: string;
  onQueryChange: (q: string) => void;
  onHome: () => void;
  onUnassigned: () => void;
  onProject: (id: string) => void;
  onSettings: () => void;
  onNewRecording: () => void;
  onNewProject: () => void;
  recordingActive: boolean;
}

function NavItem({
  active,
  onClick,
  icon,
  children,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium transition-colors",
        active ? "bg-brand-soft text-brand" : "text-foreground hover:bg-hairline",
      )}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {!!badge && (
        <Badge variant="secondary" className="h-4.5 px-1.5">
          {badge}
        </Badge>
      )}
    </button>
  );
}

export function AppSidebar({
  projects,
  unassignedCount,
  screen,
  activeProjectId,
  query,
  onQueryChange,
  onHome,
  onUnassigned,
  onProject,
  onSettings,
  onNewRecording,
  onNewProject,
  recordingActive,
}: Props) {
  return (
    <div className="flex h-full w-56 shrink-0 flex-col gap-1 border-r border-hairline bg-glass p-3 backdrop-blur-xl">
      <div className="relative mb-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search"
          className="w-full rounded-lg border border-hairline bg-card/60 py-1.5 pl-8 pr-2.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </div>

      <Button
        onClick={onNewRecording}
        disabled={recordingActive}
        className="mb-2 h-8 w-full justify-center bg-brand text-brand-foreground hover:bg-brand/90"
      >
        <Plus className="size-4" />
        New Recording
      </Button>

      <NavItem active={screen === "home"} onClick={onHome} icon={<Home className="size-4" />}>
        Home
      </NavItem>
      <NavItem
        active={screen === "project" && activeProjectId === null}
        onClick={onUnassigned}
        icon={<Inbox className="size-4" />}
        badge={unassignedCount}
      >
        Unassigned
      </NavItem>

      <div className="mt-3 mb-1 flex items-center justify-between px-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Projects
        </span>
        <Button
          onClick={onNewProject}
          variant="ghost"
          size="icon-xs"
          aria-label="New project"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {projects.length === 0 ? (
          <p className="px-2.5 text-xs text-muted-foreground">No projects yet.</p>
        ) : (
          projects.map((p) => (
            <NavItem
              key={p.id}
              active={screen === "project" && activeProjectId === p.id}
              onClick={() => onProject(p.id)}
            >
              {p.name}
            </NavItem>
          ))
        )}
      </div>

      <NavItem active={screen === "settings"} onClick={onSettings} icon={<Settings className="size-4" />}>
        Settings
      </NavItem>
    </div>
  );
}

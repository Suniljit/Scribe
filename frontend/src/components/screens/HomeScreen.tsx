import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common";
import type { Project } from "@/lib/projects";

interface Props {
  projects: Project[];
  query: string;
  meetingCount: (projectId: string) => number;
  unassignedCount: number;
  onOpenProject: (id: string) => void;
  onOpenUnassigned: () => void;
  onNewProject: () => void;
}

export function HomeScreen({ projects, query, meetingCount, unassignedCount, onOpenProject, onOpenUnassigned, onNewProject }: Props) {
  const filtered = projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Projects</h1>
        <Button variant="outline" size="sm" onClick={onNewProject}>
          <Plus className="size-4" />
          New Project
        </Button>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Use New Recording to capture a meeting, or New Project to start organizing your work."
        />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects match “{query}”.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => onOpenProject(p.id)}
              className="flex flex-col items-start gap-3 rounded-2xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
            >
              <div>
                <p className="text-sm font-semibold">{p.name}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.description || "No description"}</p>
              </div>
              <Badge variant="secondary">{meetingCount(p.id)} meetings</Badge>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={onOpenUnassigned}
        className="flex items-center gap-2.5 rounded-2xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
      >
        <span className="text-sm font-semibold">Unassigned</span>
        <Badge variant="secondary">{unassignedCount}</Badge>
      </button>
    </div>
  );
}

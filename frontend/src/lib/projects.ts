import { useCallback, useEffect, useState } from "react";

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

const PROJECTS_KEY = "scribe-projects";
const ASSIGNMENTS_KEY = "scribe-meeting-projects";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

/** Meeting id -> project id. Absent entry means unassigned. */
type Assignments = Record<string, string>;

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>(() => load(PROJECTS_KEY, []));
  const [assignments, setAssignments] = useState<Assignments>(() => load(ASSIGNMENTS_KEY, {}));

  useEffect(() => save(PROJECTS_KEY, projects), [projects]);
  useEffect(() => save(ASSIGNMENTS_KEY, assignments), [assignments]);

  const createProject = useCallback((name: string, description: string) => {
    const project: Project = {
      id: crypto.randomUUID(),
      name,
      description,
      createdAt: new Date().toISOString(),
    };
    setProjects((prev) => [project, ...prev]);
    return project;
  }, []);

  const renameProject = useCallback((id: string, name: string, description: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name, description } : p)));
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setAssignments((prev) => {
      const next = { ...prev };
      for (const meetingId of Object.keys(next)) {
        if (next[meetingId] === id) delete next[meetingId];
      }
      return next;
    });
  }, []);

  const assignMeeting = useCallback((meetingId: string, projectId: string | null) => {
    setAssignments((prev) => {
      const next = { ...prev };
      if (projectId === null) delete next[meetingId];
      else next[meetingId] = projectId;
      return next;
    });
  }, []);

  const meetingCount = useCallback(
    (projectId: string) => Object.values(assignments).filter((id) => id === projectId).length,
    [assignments],
  );

  return { projects, assignments, createProject, renameProject, deleteProject, assignMeeting, meetingCount };
}

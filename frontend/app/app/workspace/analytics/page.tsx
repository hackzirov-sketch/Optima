'use client';

import { useEffect, useMemo, useState } from "react";
import { Bell, Database, Filter, Plus, Save, ShieldCheck, Timer } from "lucide-react";
import { PageShell, Pill, ProgressBar, SectionTitle, SurfaceCard } from "@/components/app/DesignSystem";
import { WORKSPACE_ZONE } from "@/data/ecosystemData";
import type { Profession } from "@/types";
import { storage } from "@/utils/storage";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useProjects } from "@/hooks/useProjects";
import { useAllWorkspaceTasks } from "@/hooks/useTasks";
import { useMembers } from "@/hooks/useMembers";
import { useWorkspaceAnalytics } from "@/hooks/useWorkspaceAnalytics";
import {
  PROFESSION_PRESETS,
  BASE_INTEGRATIONS,
  type CreatedWorkspaceItem,
  type WorkspaceSnapshot,
  type WorkspaceField,
  type WorkspaceRule,
  DEFAULT_WORKSPACE_FIELDS,
  DEFAULT_WORKSPACE_RULES,
} from "../_workspace";

export default function AnalyticsPage() {
  const { activeWorkspace } = useWorkspace();
  const { projects: realProjects } = useProjects(activeWorkspace?.id);
  const projectIds = useMemo(() => realProjects.map((p) => p.id), [realProjects]);
  const { tasks: realTasks } = useAllWorkspaceTasks(activeWorkspace?.id, projectIds);
  const { members: realMembers } = useMembers(activeWorkspace?.id);
  useWorkspaceAnalytics(activeWorkspace?.id);

  const [activeProfession] = useState<Profession>(
    () => storage.getWorkspaceProfession() ?? "student",
  );
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshot[]>(
    () => storage.getWorkspaceSnapshots<WorkspaceSnapshot>(),
  );
  const [createdItems] = useState<CreatedWorkspaceItem[]>(
    () => storage.getWorkspaceCreatedItems<CreatedWorkspaceItem>(),
  );
  const [integrationState] = useState<Record<string, boolean>>(
    () => ({ ...BASE_INTEGRATIONS, ...(storage.getIntegrations() ?? {}) }),
  );
  const [workspaceFields] = useState<WorkspaceField[]>(() => {
    const saved = storage.getWorkspaceFields<WorkspaceField>();
    return saved.length > 0 ? saved : DEFAULT_WORKSPACE_FIELDS;
  });
  const [workspaceRules] = useState<WorkspaceRule[]>(() => {
    const saved = storage.getWorkspaceRules<WorkspaceRule>();
    return saved.length > 0 ? saved : DEFAULT_WORKSPACE_RULES;
  });

  const activePreset = PROFESSION_PRESETS[activeProfession] ?? PROFESSION_PRESETS.developer;
  const missingRecommended = activePreset.integrations.filter((id) => !integrationState[id]);
  const integrationCoverage = Math.round(
    ((activePreset.integrations.length - missingRecommended.length) / Math.max(activePreset.integrations.length, 1)) * 100,
  );
  const enabledRules = workspaceRules.filter((r) => r.enabled).length;
  const enabledFields = workspaceFields.filter((f) => f.enabled).length;
  const automationScore = Math.round((enabledRules / Math.max(workspaceRules.length, 1)) * 100);
  const fieldScore = Math.min(100, enabledFields * 18);
  const savedScore = Math.min(100, snapshots.length * 24 + createdItems.length * 12);

  const avgProgress = useMemo(() => {
    if (realTasks.length === 0) return 0;
    const progMap: Record<string, number> = { done: 100, in_progress: 50, review: 75, blocked: 25 };
    return Math.round(realTasks.reduce((s, t) => s + (progMap[t.status] ?? 0), 0) / realTasks.length);
  }, [realTasks]);

  const highPriorityCount = realTasks.filter((t) => t.priority === 'high').length;
  const reviewCount = realTasks.filter((t) => t.status === 'review' || t.status === 'blocked').length;
  const readinessScore = Math.round(
    (WORKSPACE_ZONE.health + avgProgress + integrationCoverage + savedScore + automationScore + fieldScore) / 6,
  );

  const workspaceSignals = [
    { label: "Task progress", value: avgProgress, tone: "indigo" as const },
    { label: "Integration match", value: integrationCoverage, tone: (missingRecommended.length ? "amber" : "green") as "amber" | "green" },
    { label: "Saved control", value: savedScore, tone: (snapshots.length ? "blue" : "slate") as "blue" | "slate" },
    { label: "Automation rules", value: automationScore, tone: (enabledRules ? "indigo" : "slate") as "indigo" | "slate" },
    { label: "Custom fields", value: fieldScore, tone: (enabledFields > 2 ? "green" : "amber") as "green" | "amber" },
    { label: "Zone health", value: WORKSPACE_ZONE.health, tone: "green" as const },
  ];

  const workloadLanes = useMemo(() => {
    const wl = new Map<string, { owner: string; tasks: number; progress: number; risk: number; focus: string }>();
    const progMap: Record<string, number> = { done: 100, in_progress: 50, review: 75, blocked: 25 };
    realTasks.forEach((t) => {
      const assignee = 'Unassigned';
      const existing = wl.get(assignee) ?? { owner: assignee, tasks: 0, progress: 0, risk: 0, focus: '' };
      existing.tasks += 1;
      existing.progress += progMap[t.status] ?? 0;
      existing.risk += t.priority === 'high' || t.status === 'blocked' ? 1 : 0;
      wl.set(assignee, existing);
    });
    return Array.from(wl.values()).slice(0, 4).map((lane) => ({
      ...lane,
      capacity: Math.min(100, Math.round((lane.tasks / Math.max(realTasks.length, 1)) * 100) + lane.risk * 12),
      progress: Math.round(lane.progress / Math.max(lane.tasks, 1)),
    }));
  }, [realTasks]);

  const restoreSnapshot = (snap: WorkspaceSnapshot) => {
    storage.saveWorkspaceProfession(snap.profession);
    storage.saveActiveView(snap.view);
    storage.saveActiveBoard(snap.board);
    setSnapshots((cur) => cur);
  };

  return (
    <PageShell>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Workspace health, signals and saved states</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 px-5 py-3 text-center dark:from-indigo-500/10 dark:to-blue-500/10">
          <p className="text-3xl font-black text-foreground">{readinessScore}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">readiness</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Readiness signals */}
        <SurfaceCard>
          <SectionTitle icon={ShieldCheck} title="Workspace signals" description="Health breakdown across all dimensions." />
          <div className="space-y-3">
            {workspaceSignals.map((signal) => (
              <div key={signal.label}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">{signal.label}</span>
                  <Pill tone={signal.tone}>{signal.value}%</Pill>
                </div>
                <ProgressBar value={signal.value} />
              </div>
            ))}
          </div>
        </SurfaceCard>

        {/* Signal feed */}
        <SurfaceCard>
          <SectionTitle icon={Bell} title="Signal feed" description="Active alerts for this workspace." />
          <div className="space-y-3">
            {[
              { title: "Review pressure", body: `${reviewCount + highPriorityCount} items need attention.`, icon: ShieldCheck, tone: reviewCount ? "amber" as const : "green" as const },
              { title: "Integration coverage", body: missingRecommended.length ? `${missingRecommended.length} recommended tools not connected.` : "All recommended tools connected.", icon: Database, tone: missingRecommended.length ? "amber" as const : "green" as const },
              { title: "Saved workspace", body: `${snapshots.length} snapshots and ${createdItems.length} local objects.`, icon: Save, tone: snapshots.length ? "indigo" as const : "slate" as const },
              { title: "Task progress", body: `${avgProgress}% average task completion across workspace.`, icon: Filter, tone: "blue" as const },
            ].map(({ title, body, icon: Icon, tone }) => (
              <div key={title} className="flex items-start gap-3 rounded-2xl border border-border bg-muted p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-card text-indigo-600 shadow-sm">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black text-foreground">{title}</p>
                    <Pill tone={tone}>Signal</Pill>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Workload */}
        <SurfaceCard>
          <SectionTitle icon={Timer} title="Workload" description="Capacity overview by assignee." />
          {workloadLanes.length === 0 ? (
            <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground ring-1 ring-border">No workload data yet.</p>
          ) : (
            <div className="space-y-3">
              {workloadLanes.map((lane) => (
                <div key={lane.owner} className="rounded-2xl border border-border bg-muted p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-black text-foreground">{lane.owner}</p>
                      <p className="text-xs text-muted-foreground">{lane.tasks} tasks</p>
                    </div>
                    <Pill tone={lane.capacity > 72 ? "amber" : "green"}>{lane.capacity}% capacity</Pill>
                  </div>
                  <ProgressBar value={lane.progress} label={`${lane.risk} risk items`} />
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>

        {/* Saved states */}
        <div className="space-y-4">
          <SurfaceCard>
            <SectionTitle icon={Save} title="Saved states" description="Restore a previously saved view." />
            {snapshots.length === 0 ? (
              <p className="rounded-2xl bg-muted p-3 text-sm text-muted-foreground">No saved states yet. Use Save view on the Board tab.</p>
            ) : (
              <div className="space-y-2">
                {snapshots.map((snap) => (
                  <button
                    key={snap.id}
                    type="button"
                    onClick={() => restoreSnapshot(snap)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-muted p-3 text-left transition-colors hover:bg-card hover:shadow-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-foreground">{snap.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{snap.createdAt}</span>
                    </span>
                    <Pill tone="blue">Restore</Pill>
                  </button>
                ))}
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle icon={Plus} title="Created locally" description="Boards, docs and automations you created." />
            {createdItems.length === 0 ? (
              <p className="rounded-2xl bg-muted p-3 text-sm text-muted-foreground">No items created yet.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {createdItems.slice(0, 6).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border bg-muted p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Pill tone={item.type === "Automation" ? "amber" : item.type === "Dashboard" ? "indigo" : "blue"}>{item.type}</Pill>
                      <span className="text-[10px] text-muted-foreground">{item.createdAt}</span>
                    </div>
                    <p className="mt-2 text-sm font-black text-foreground">{item.title}</p>
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>
        </div>
      </div>
    </PageShell>
  );
}

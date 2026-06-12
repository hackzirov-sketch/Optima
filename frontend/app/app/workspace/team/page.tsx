'use client';

import { useMemo } from "react";
import { ArrowRight, LockKeyhole, Settings, Timer, UserPlus, Users } from "lucide-react";
import { PageShell, Pill, ProgressBar, SectionTitle, SurfaceCard, cn } from "@/components/app/DesignSystem";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useProjects } from "@/hooks/useProjects";
import { useAllWorkspaceTasks } from "@/hooks/useTasks";
import { useMembers } from "@/hooks/useMembers";
import { ROLE_MATRIX } from "../_workspace";

const SUB_PAGES = [
  { label: "Members",  desc: "View and manage all team members",    href: "/app/workspace/members",  icon: Users,     accent: "#6366F1" },
  { label: "Invites",  desc: "Pending and sent workspace invites",   href: "/app/workspace/invites",  icon: UserPlus,  accent: "#3B82F6" },
  { label: "Settings", desc: "Workspace name, roles & configuration", href: "/app/workspace/settings", icon: Settings,  accent: "#10B981" },
];

export default function TeamPage() {
  const { activeWorkspace } = useWorkspace();
  const { projects: realProjects } = useProjects(activeWorkspace?.id);
  const projectIds = useMemo(() => realProjects.map((p) => p.id), [realProjects]);
  const { tasks: realTasks } = useAllWorkspaceTasks(activeWorkspace?.id, projectIds);
  const { members: realMembers } = useMembers(activeWorkspace?.id);

  const workloadLanes = useMemo(() => {
    const wl = new Map<string, { owner: string; tasks: number; progress: number; risk: number }>();
    const progMap: Record<string, number> = { done: 100, in_progress: 50, review: 75, blocked: 25 };

    realMembers.forEach((member) => {
      const name = member.user
        ? `${member.user.firstName ?? ''} ${member.user.lastName ?? ''}`.trim() || member.user.email
        : 'Unknown';
      const memberTasks = realTasks.filter((t) => t.assigneeId === member.userId);
      const risk = memberTasks.filter((t) => t.priority === 'high' || t.status === 'blocked').length;
      const progress = memberTasks.length > 0
        ? Math.round(memberTasks.reduce((s, t) => s + (progMap[t.status] ?? 0), 0) / memberTasks.length)
        : 0;
      wl.set(member.userId ?? name, { owner: name, tasks: memberTasks.length, progress, risk });
    });

    return Array.from(wl.values()).slice(0, 6).map((lane) => ({
      ...lane,
      capacity: Math.min(100, Math.round((lane.tasks / Math.max(realTasks.length, 1)) * 100) + lane.risk * 12),
    }));
  }, [realMembers, realTasks]);

  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground">Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">Access control, workload and workspace management</p>
      </div>

      {/* Sub-page shortcuts */}
      <div className="grid gap-3 sm:grid-cols-3">
        {SUB_PAGES.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <span
              className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl"
              style={{ background: `${item.accent}14`, color: item.accent }}
            >
              <item.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-black text-foreground">{item.label}</p>
              <p className="truncate text-xs text-muted-foreground">{item.desc}</p>
            </div>
            <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </a>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Access matrix */}
        <SurfaceCard>
          <SectionTitle icon={LockKeyhole} title="Access matrix" description="Permission overview for workspace roles." />
          <div className="overflow-hidden rounded-2xl border border-border">
            {ROLE_MATRIX.map((row) => (
              <div
                key={row.role}
                className="grid gap-2 border-b border-border bg-card p-3 last:border-b-0 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center"
              >
                <div>
                  <p className="font-black text-foreground">{row.role}</p>
                  <p className="text-xs text-muted-foreground">{row.note}</p>
                </div>
                {([["Create", row.canCreate], ["Save", row.canSave], ["Connect", row.canConnect]] as [string, boolean][]).map(([label, allowed]) => (
                  <div key={label} className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-1.5 text-xs font-bold text-foreground">
                    <span className={cn("h-2 w-2 rounded-full", allowed ? "bg-emerald-500" : "bg-slate-300")} />
                    {label}
                  </div>
                ))}
                <Pill tone={row.role === "Owner" ? "indigo" : row.role === "Viewer" ? "slate" : "blue"}>
                  {row.role === "Owner" ? "Full" : "Scoped"}
                </Pill>
              </div>
            ))}
          </div>
        </SurfaceCard>

        {/* Team workload */}
        <SurfaceCard>
          <SectionTitle icon={Timer} title="Team workload" description="Capacity by member from current task data." />
          {workloadLanes.length === 0 ? (
            <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground ring-1 ring-border">
              {activeWorkspace ? "No members or tasks yet." : "Select a workspace to see workload."}
            </p>
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
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl bg-card p-3 ring-1 ring-border">
                      <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-muted-foreground">Progress</p>
                      <ProgressBar value={lane.progress} />
                    </div>
                    <div className="rounded-xl bg-card p-3 ring-1 ring-border">
                      <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Risk load</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xl font-black text-foreground">{lane.risk}</span>
                        <Pill tone={lane.risk ? "amber" : "green"}>{lane.risk ? "Watch" : "Clear"}</Pill>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>
      </div>
    </PageShell>
  );
}

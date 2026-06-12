'use client';

import { useEffect, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Columns3,
  Database,
  Figma,
  Github,
  HardDrive,
  NotepadText,
  PlayCircle,
  Plus,
  Settings,
  Slack,
  Workflow,
} from "lucide-react";
import { PageShell, Pill, SectionTitle, SurfaceCard, cn } from "@/components/app/DesignSystem";
import type { Profession } from "@/types";
import { storage } from "@/utils/storage";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  PROFESSION_PRESETS,
  BASE_INTEGRATIONS,
  CONTROL_SWITCHES,
  DEFAULT_WORKSPACE_FIELDS,
  DEFAULT_WORKSPACE_RULES,
  type WorkspaceField,
  type WorkspaceRule,
} from "../_workspace";

const INTEGRATIONS = [
  { id: "github",   name: "GitHub",  icon: Github,      desc: "Repo, PR, issue and commit activity." },
  { id: "drive",    name: "Drive",   icon: HardDrive,   desc: "Docs, files, assets and handoff folders." },
  { id: "calendar", name: "Calendar",icon: Calendar,    desc: "Deadlines, meetings and reminder sync." },
  { id: "slack",    name: "Slack",   icon: Slack,       desc: "Team notifications and channel mirroring." },
  { id: "figma",    name: "Figma",   icon: Figma,       desc: "Design files, exports and review comments." },
  { id: "notion",   name: "Notion",  icon: NotepadText, desc: "Knowledge import and wiki bridge." },
];

export default function AutomationPage() {
  const { activeWorkspace } = useWorkspace();

  const [activeProfession] = useState<Profession>(
    () => storage.getWorkspaceProfession() ?? "student",
  );
  const [integrationState, setIntegrationState] = useState<Record<string, boolean>>(
    () => ({ ...BASE_INTEGRATIONS, ...(storage.getIntegrations() ?? {}) }),
  );
  const [workspaceFields, setWorkspaceFields] = useState<WorkspaceField[]>(() => {
    const saved = storage.getWorkspaceFields<WorkspaceField>();
    return saved.length > 0 ? saved : DEFAULT_WORKSPACE_FIELDS;
  });
  const [workspaceRules, setWorkspaceRules] = useState<WorkspaceRule[]>(() => {
    const saved = storage.getWorkspaceRules<WorkspaceRule>();
    return saved.length > 0 ? saved : DEFAULT_WORKSPACE_RULES;
  });
  const [controls, setControls] = useState<Record<(typeof CONTROL_SWITCHES)[number]["id"], boolean>>(
    { autoSave: true, reviewGate: true, integrationGuard: true },
  );
  const [fieldDraft, setFieldDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => storage.saveIntegrations(integrationState), [integrationState]);
  useEffect(() => storage.saveWorkspaceFields(workspaceFields), [workspaceFields]);
  useEffect(() => storage.saveWorkspaceRules(workspaceRules), [workspaceRules]);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(t);
  }, [notice]);

  const activePreset = PROFESSION_PRESETS[activeProfession] ?? PROFESSION_PRESETS.developer;
  const enabledRules = workspaceRules.filter((r) => r.enabled).length;
  const enabledFields = workspaceFields.filter((f) => f.enabled).length;

  const addCustomField = () => {
    const label = fieldDraft.trim();
    if (!label) return;
    setWorkspaceFields((cur) => [
      { id: `field-${Date.now()}`, label, type: "Text" as const, enabled: true },
      ...cur,
    ].slice(0, 10));
    setFieldDraft("");
    setNotice(`${label} field added`);
  };

  return (
    <>
      <PageShell>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Automation</h1>
          <p className="mt-1 text-sm text-muted-foreground">Rules, custom fields, controls and integrations</p>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          {/* Automation rules */}
          <SurfaceCard>
            <div className="flex items-start justify-between gap-3">
              <SectionTitle icon={Workflow} title="Automation rules" description="Toggle review gates, deadline and AI rules." />
              <Pill tone={enabledRules ? "green" : "slate"}>{enabledRules}/{workspaceRules.length} active</Pill>
            </div>
            <div className="space-y-3">
              {workspaceRules.map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  onClick={() => setWorkspaceRules((cur) => cur.map((r) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r))}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-all hover:shadow-sm",
                    rule.enabled
                      ? "border-indigo-100 bg-indigo-50/60 dark:border-indigo-500/25 dark:bg-indigo-500/10"
                      : "border-border bg-muted hover:bg-card",
                  )}
                >
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", rule.enabled ? "bg-card text-indigo-600 shadow-sm" : "bg-card text-muted-foreground ring-1 ring-border")}>
                    <PlayCircle className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-foreground">{rule.title}</span>
                      <Pill tone={rule.enabled ? "green" : "slate"}>{rule.enabled ? "On" : "Off"}</Pill>
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{rule.trigger} → {rule.action}</span>
                  </span>
                </button>
              ))}
            </div>
          </SurfaceCard>

          {/* Custom fields */}
          <SurfaceCard>
            <div className="flex items-start justify-between gap-3">
              <SectionTitle icon={Columns3} title="Custom fields" description="Control what every board tracks." />
              <Pill tone={enabledFields > 2 ? "green" : "amber"}>{enabledFields} enabled</Pill>
            </div>
            <div className="flex gap-2">
              <input
                value={fieldDraft}
                onChange={(e) => setFieldDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCustomField(); }}
                placeholder="Add field: Client, Budget…"
                className="h-10 flex-1 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-indigo-300"
              />
              <button
                type="button"
                onClick={addCustomField}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white hover:bg-indigo-500"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {workspaceFields.map((field) => (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => setWorkspaceFields((cur) => cur.map((f) => f.id === field.id ? { ...f, enabled: !f.enabled } : f))}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-colors",
                    field.enabled
                      ? "border-emerald-100 bg-emerald-50/70 dark:border-emerald-500/25 dark:bg-emerald-500/10"
                      : "border-border bg-muted hover:bg-card",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-foreground">{field.label}</span>
                    <span className="text-xs text-muted-foreground">{field.type}</span>
                  </span>
                  <Pill tone={field.enabled ? "green" : "slate"}>{field.enabled ? "Visible" : "Hidden"}</Pill>
                </button>
              ))}
            </div>
          </SurfaceCard>
        </div>

        {/* Control switches */}
        <SurfaceCard>
          <SectionTitle icon={Settings} title="Workspace controls" description="Toggle workspace behaviour settings." />
          <div className="grid gap-3 md:grid-cols-3">
            {CONTROL_SWITCHES.map((control) => (
              <button
                key={control.id}
                type="button"
                onClick={() => setControls((cur) => ({ ...cur, [control.id]: !cur[control.id] }))}
                className={cn(
                  "rounded-2xl border p-4 text-left transition-all",
                  controls[control.id] ? "border-indigo-100 bg-card shadow-sm dark:border-indigo-500/25" : "border-border bg-muted",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-foreground">{control.label}</span>
                  <span className={cn("h-5 w-9 rounded-full p-0.5 transition-colors", controls[control.id] ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700")}>
                    <span className={cn("block h-4 w-4 rounded-full bg-card transition-transform", controls[control.id] && "translate-x-4")} />
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{control.detail}</p>
              </button>
            ))}
          </div>
        </SurfaceCard>

        {/* Integration ecosystem */}
        <SurfaceCard>
          <SectionTitle icon={Database} title="Integration ecosystem" description={`Recommended for ${activePreset.label}: ${activePreset.integrations.join(', ')}`} />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {INTEGRATIONS.map(({ id, name, icon: Icon, desc }) => {
              const connected = integrationState[id];
              const recommended = activePreset.integrations.includes(id);
              return (
                <div
                  key={id}
                  className={cn(
                    "rounded-2xl border p-4",
                    recommended ? "border-indigo-100 bg-indigo-50/45 dark:border-indigo-500/25 dark:bg-indigo-500/10" : "border-border bg-muted",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-card text-indigo-600 shadow-sm">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="flex gap-1">
                      {recommended && <Pill tone="indigo">Recommended</Pill>}
                      <Pill tone={connected ? "green" : "slate"}>{connected ? "Connected" : "Ready"}</Pill>
                    </div>
                  </div>
                  <h3 className="mt-3 font-black text-foreground">{name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
                  <button
                    type="button"
                    onClick={() => setIntegrationState((cur) => ({ ...cur, [id]: !cur[id] }))}
                    className={cn(
                      "mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-black transition-colors",
                      connected
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25"
                        : "bg-card text-muted-foreground ring-1 ring-border hover:text-indigo-700 dark:hover:text-indigo-300",
                    )}
                  >
                    {connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    {connected ? "Connected" : "Connect"}
                  </button>
                </div>
              );
            })}
          </div>
        </SurfaceCard>
      </PageShell>

      {notice && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl glass px-5 py-3 text-sm font-semibold text-foreground">
          {notice}
        </div>
      )}
    </>
  );
}

import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Briefcase,
  Code2,
  GraduationCap,
  Megaphone,
  Palette,
  Video,
} from "lucide-react";
import type { Profession, TaskView } from "@/types";

export type WorkspaceItemType = "Board" | "Doc" | "Automation" | "Dashboard";

export type CreatedWorkspaceItem = {
  id: string;
  type: WorkspaceItemType;
  title: string;
  profession: Profession;
  board: string;
  createdAt: string;
};

export type WorkspaceSnapshot = {
  id: string;
  name: string;
  profession: Profession;
  view: TaskView;
  board: string;
  createdAt: string;
  filters: string[];
};

export type WorkspaceField = {
  id: string;
  label: string;
  type: "Text" | "Status" | "Person" | "Date" | "Number";
  enabled: boolean;
};

export type WorkspaceRule = {
  id: string;
  title: string;
  trigger: string;
  action: string;
  enabled: boolean;
};

export type ProfessionPreset = {
  id: Profession;
  label: string;
  icon: LucideIcon;
  summary: string;
  template: string;
  filters: string[];
  boards: string[];
  integrations: string[];
  controlFocus: string;
};

export const PROFESSION_PRESETS: Record<Profession, ProfessionPreset> = {
  developer: {
    id: "developer",
    label: "Developer",
    icon: Code2,
    summary: "Sprint, code review, QA, automation and release monitoring.",
    template: "Engineering Sprint OS",
    filters: ["Workspace", "Automation", "Navigation", "Tasks", "AI", "Architecture"],
    boards: ["Roadmap", "Sprint", "QA", "Release"],
    integrations: ["github", "figma", "calendar", "drive"],
    controlFocus: "Ship reliable features with review gates and integration signals.",
  },
  designer: {
    id: "designer",
    label: "Designer",
    icon: Palette,
    summary: "Design systems, review boards, handoff docs and Figma workflow.",
    template: "Design System Studio",
    filters: ["Design System", "Power UI", "Workspace", "Views", "Tasks"],
    boards: ["Design QA", "Handoff", "UX Review", "Components"],
    integrations: ["figma", "drive", "notion", "calendar"],
    controlFocus: "Keep visual quality, handoff and review context in one place.",
  },
  teacher: {
    id: "teacher",
    label: "Teacher",
    icon: BookOpen,
    summary: "Lesson plans, learning paths, docs and progress tracking.",
    template: "Learning Control Room",
    filters: ["Learning", "Docs", "Mentors", "Reviews", "Meetings"],
    boards: ["Paths", "Lessons", "Reviews", "Mentors"],
    integrations: ["calendar", "drive", "notion"],
    controlFocus: "Track learning progress and turn notes into next actions.",
  },
  student: {
    id: "student",
    label: "Student",
    icon: GraduationCap,
    summary: "Study dashboard, portfolio tasks, deadlines and mentor feedback.",
    template: "Student Progress Hub",
    filters: ["Learning", "Tasks", "Portfolio", "Reviews", "AI"],
    boards: ["Study", "Portfolio", "Mentors", "Deadlines"],
    integrations: ["calendar", "drive", "notion"],
    controlFocus: "Stay focused on weekly progress and portfolio proof.",
  },
  freelancer: {
    id: "freelancer",
    label: "Freelancer",
    icon: Briefcase,
    summary: "Client delivery, invoices, meetings and freelance operations.",
    template: "Client Delivery OS",
    filters: ["Client", "Delivery", "Invoices", "Meetings", "Freelance"],
    boards: ["Deals", "Delivery", "Invoices", "Archive"],
    integrations: ["calendar", "drive", "github", "notion"],
    controlFocus: "Control every client from proposal to payment without clutter.",
  },
  smm: {
    id: "smm",
    label: "SMM",
    icon: Megaphone,
    summary: "Campaigns, content calendar, community channels and analytics.",
    template: "Growth Campaign Hub",
    filters: ["Community", "News", "Premium", "Launch", "Growth"],
    boards: ["Content", "Campaigns", "Analytics", "Approvals"],
    integrations: ["slack", "calendar", "drive", "figma"],
    controlFocus: "Monitor campaigns, approvals and channel output from one view.",
  },
  creator: {
    id: "creator",
    label: "Creator",
    icon: Video,
    summary: "Content pipeline, publishing tasks, community and monetization.",
    template: "Creator Studio OS",
    filters: ["Community", "News", "Premium", "Launch", "Content"],
    boards: ["Ideas", "Production", "Publish", "Community"],
    integrations: ["drive", "figma", "calendar", "slack"],
    controlFocus: "Move ideas into publishable assets and community loops.",
  },
};

export const DEFAULT_WORKSPACE_FIELDS: WorkspaceField[] = [
  { id: "field-owner", label: "Owner", type: "Person", enabled: true },
  { id: "field-risk", label: "Risk", type: "Status", enabled: true },
  { id: "field-deadline", label: "Deadline", type: "Date", enabled: true },
  { id: "field-client", label: "Client", type: "Text", enabled: false },
  { id: "field-budget", label: "Budget", type: "Number", enabled: false },
];

export const DEFAULT_WORKSPACE_RULES: WorkspaceRule[] = [
  { id: "rule-review", title: "Review protection", trigger: "Task enters Review", action: "Create QA checklist and notify owner", enabled: true },
  { id: "rule-deadline", title: "Deadline radar", trigger: "Due date is within 24h", action: "Show alert in control center", enabled: true },
  { id: "rule-client", title: "Client handoff", trigger: "Board changes to Delivery", action: "Prepare doc and invoice placeholders", enabled: false },
  { id: "rule-ai", title: "AI weekly summary", trigger: "Friday 17:00", action: "Generate workspace summary draft", enabled: false },
];

export const ROLE_MATRIX = [
  { role: "Owner", canCreate: true, canSave: true, canConnect: true, note: "Full workspace control" },
  { role: "Admin", canCreate: true, canSave: true, canConnect: true, note: "Team and integration setup" },
  { role: "Member", canCreate: true, canSave: false, canConnect: false, note: "Create work, follow saved views" },
  { role: "Viewer", canCreate: false, canSave: false, canConnect: false, note: "Read-only progress tracking" },
];

export const BASE_INTEGRATIONS: Record<string, boolean> = {
  github: true,
  drive: false,
  calendar: false,
  slack: false,
  figma: false,
  notion: false,
};

export const CONTROL_SWITCHES = [
  { id: "autoSave", label: "Auto save", detail: "Save active board, view and profession preset locally." },
  { id: "reviewGate", label: "Review gate", detail: "Highlight work that needs QA or approval." },
  { id: "integrationGuard", label: "Integration guard", detail: "Show missing tool connections for this profession." },
] as const;

export function formatStamp() {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

export function taskMatchesPreset(taskText: string, filters: string[]) {
  return filters.some((f) => taskText.includes(f.toLowerCase()));
}

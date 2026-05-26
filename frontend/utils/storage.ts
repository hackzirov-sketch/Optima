import type { AutomationRule, ChatRoom, DocPage, Profession, SmartTask, Task, TaskView, Note, UserProfile } from '@/types';

const K = {
  USER: 'upz_user',
  TASKS: 'upz_tasks',
  NOTES: 'upz_notes',
  INTEGRATIONS: 'upz_integrations',
  ONBOARDED: 'upz_onboarded',
  CHAT_ROOMS: 'upz_chat_rooms',
  SMART_TASKS: 'upz_smart_tasks',
  DOC_PAGES: 'upz_doc_pages',
  AUTOMATIONS: 'upz_automations',
  DASHBOARD_LAYOUT: 'upz_dashboard_layout',
  ACTIVE_VIEW: 'upz_active_view',
  ACTIVE_BOARD: 'upz_active_board',
  WORKSPACE_PROFESSION: 'upz_workspace_profession',
  WORKSPACE_SNAPSHOTS: 'upz_workspace_snapshots',
  WORKSPACE_CREATED_ITEMS: 'upz_workspace_created_items',
  WORKSPACE_FIELDS: 'upz_workspace_fields',
  WORKSPACE_RULES: 'upz_workspace_rules',
  WORKSPACE_MILESTONES: 'upz_workspace_milestones',
  WORKSPACE_VIEW_PRESETS: 'upz_workspace_view_presets',
  TEAM_OPTIMA_TASKS: 'upz_team_optima_tasks',
  TEAM_REVIEW_LOG: 'upz_team_review_log',
};

function get<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function set(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export const storage = {
  isOnboarded: () => !!localStorage.getItem(K.ONBOARDED),
  setOnboarded: () => localStorage.setItem(K.ONBOARDED, '1'),
  clearOnboarded: () => localStorage.removeItem(K.ONBOARDED),

  getUser: () => get<UserProfile>(K.USER),
  saveUser: (u: UserProfile) => set(K.USER, u),

  getTasks: (): Task[] => get<Task[]>(K.TASKS) ?? [],
  saveTasks: (tasks: Task[]) => set(K.TASKS, tasks),

  getNotes: (): Note[] => get<Note[]>(K.NOTES) ?? [],
  saveNotes: (notes: Note[]) => set(K.NOTES, notes),

  getIntegrations: (): Record<string, boolean> | null => get(K.INTEGRATIONS),
  saveIntegrations: (data: Record<string, boolean>) => set(K.INTEGRATIONS, data),

  getChatRooms: (): ChatRoom[] => get<ChatRoom[]>(K.CHAT_ROOMS) ?? [],
  saveChatRooms: (rooms: ChatRoom[]) => set(K.CHAT_ROOMS, rooms),

  getSmartTasks: (): SmartTask[] => get<SmartTask[]>(K.SMART_TASKS) ?? [],
  saveSmartTasks: (tasks: SmartTask[]) => set(K.SMART_TASKS, tasks),

  getDocPages: (): DocPage[] => get<DocPage[]>(K.DOC_PAGES) ?? [],
  saveDocPages: (docs: DocPage[]) => set(K.DOC_PAGES, docs),

  getAutomationRules: (): AutomationRule[] => get<AutomationRule[]>(K.AUTOMATIONS) ?? [],
  saveAutomationRules: (rules: AutomationRule[]) => set(K.AUTOMATIONS, rules),

  getDashboardLayout: (): string[] => get<string[]>(K.DASHBOARD_LAYOUT) ?? [],
  saveDashboardLayout: (ids: string[]) => set(K.DASHBOARD_LAYOUT, ids),

  getActiveView: (): TaskView | null => get<TaskView>(K.ACTIVE_VIEW),
  saveActiveView: (view: TaskView) => set(K.ACTIVE_VIEW, view),

  getActiveBoard: (): string | null => get<string>(K.ACTIVE_BOARD),
  saveActiveBoard: (board: string) => set(K.ACTIVE_BOARD, board),

  getWorkspaceProfession: (): Profession | null => get<Profession>(K.WORKSPACE_PROFESSION),
  saveWorkspaceProfession: (profession: Profession) => set(K.WORKSPACE_PROFESSION, profession),

  getWorkspaceSnapshots: <T>(): T[] => get<T[]>(K.WORKSPACE_SNAPSHOTS) ?? [],
  saveWorkspaceSnapshots: (snapshots: unknown[]) => set(K.WORKSPACE_SNAPSHOTS, snapshots),

  getWorkspaceCreatedItems: <T>(): T[] => get<T[]>(K.WORKSPACE_CREATED_ITEMS) ?? [],
  saveWorkspaceCreatedItems: (items: unknown[]) => set(K.WORKSPACE_CREATED_ITEMS, items),

  getWorkspaceFields: <T>(): T[] => get<T[]>(K.WORKSPACE_FIELDS) ?? [],
  saveWorkspaceFields: (fields: unknown[]) => set(K.WORKSPACE_FIELDS, fields),

  getWorkspaceRules: <T>(): T[] => get<T[]>(K.WORKSPACE_RULES) ?? [],
  saveWorkspaceRules: (rules: unknown[]) => set(K.WORKSPACE_RULES, rules),

  getWorkspaceMilestones: <T>(): T[] => get<T[]>(K.WORKSPACE_MILESTONES) ?? [],
  saveWorkspaceMilestones: (milestones: unknown[]) => set(K.WORKSPACE_MILESTONES, milestones),

  getWorkspaceViewPresets: <T>(): T[] => get<T[]>(K.WORKSPACE_VIEW_PRESETS) ?? [],
  saveWorkspaceViewPresets: (presets: unknown[]) => set(K.WORKSPACE_VIEW_PRESETS, presets),

  getTeamOptimaTasks: <T>(): T[] => get<T[]>(K.TEAM_OPTIMA_TASKS) ?? [],
  saveTeamOptimaTasks: (tasks: unknown[]) => set(K.TEAM_OPTIMA_TASKS, tasks),

  getTeamReviewLog: <T>(): T[] => get<T[]>(K.TEAM_REVIEW_LOG) ?? [],
  saveTeamReviewLog: (logs: unknown[]) => set(K.TEAM_REVIEW_LOG, logs),
};

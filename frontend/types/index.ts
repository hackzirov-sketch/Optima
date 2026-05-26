export type Profession = 'developer' | 'teacher' | 'student' | 'freelancer' | 'designer' | 'smm' | 'creator';
export type Goal = 'learn' | 'find_work' | 'manage_team' | 'build_portfolio' | 'freelance';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type Priority = 'low' | 'medium' | 'high';
export type ChatType = '1on1' | 'group' | 'team' | 'project' | 'saved' | 'ai';
export type UserStatus = 'online' | 'offline' | 'away';
export type ChatReactionEmoji =
  | 'like'
  | 'heart'
  | 'fire'
  | 'laugh'
  | 'wow'
  | 'sad'
  | 'pray'
  | 'rocket'
  | 'zap'
  | 'gem'
  | 'clap'
  | 'done'
  | (string & {});
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'blocked' | 'done';
export type TaskView = 'list' | 'board' | 'table' | 'calendar' | 'timeline' | 'dashboard';

export interface UserProfile {
  name: string;
  profession: Profession;
  goal: Goal;
  experience: Experience;
  joinedAt: number;
  email?: string;
  phone?: string;
  username?: string;
  authProvider?: string;
}

export interface Task {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  priority: Priority;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatUser {
  id: string;
  name: string;
  initials: string;
  color: string;
  status: UserStatus;
  role?: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  text: string;
  timestamp: number;
  read?: boolean;
  edited?: boolean;
  replyToId?: string;
  reactions?: {
    emoji: ChatReactionEmoji;
    userIds: string[];
  }[];
}

export interface ChatRoom {
  id: string;
  type: ChatType;
  name: string;
  memberIds: string[];
  messages: ChatMessage[];
  unread?: number;
  pinned?: boolean;
  archived?: boolean;
  muted?: boolean;
  pinnedMessageId?: string;
  projectBadge?: string;
  linkedTask?: string;
}

export interface Integration {
  id: string;
  name: string;
  description: string;
  iconBg: string;
  iconColor: string;
  connected: boolean;
}

export interface SmartField {
  id: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'number' | 'person' | 'status';
  value: string;
  tone?: 'indigo' | 'blue' | 'green' | 'amber' | 'red' | 'slate';
}

export interface SmartTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignee: string;
  dueDate: string;
  project: string;
  tags: string[];
  progress: number;
  estimate: string;
  timeTracked: string;
  fields: SmartField[];
  subtasks: { id: string; text: string; done: boolean }[];
  comments: { id: string; author: string; text: string; time: string }[];
  activity: string[];
}

export interface WorkspaceZone {
  id: string;
  name: string;
  health: number;
  spaces: {
    id: string;
    name: string;
    collections: {
      id: string;
      name: string;
      boards: string[];
    }[];
  }[];
}

export interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
  runs: number;
}

export interface MilestoneGoal {
  id: string;
  title: string;
  owner: string;
  progress: number;
  dueDate: string;
}

export interface DashboardWidget {
  id: string;
  title: string;
  value: string;
  meta: string;
  tone: 'indigo' | 'blue' | 'green' | 'amber' | 'red' | 'slate';
}

export interface DocPage {
  id: string;
  title: string;
  space: string;
  updated: string;
  linkedTasks: number;
  excerpt: string;
}

export interface WhiteboardNode {
  id: string;
  title: string;
  type: 'idea' | 'task' | 'decision' | 'risk';
  x: number;
  y: number;
}

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'select' | 'email' | 'date' | 'textarea';
  required: boolean;
}

export interface ClipItem {
  id: string;
  title: string;
  duration: string;
  owner: string;
  linkedTask: string;
}

export interface TimeEntry {
  id: string;
  task: string;
  owner: string;
  duration: string;
  date: string;
}

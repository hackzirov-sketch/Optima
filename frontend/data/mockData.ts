import type { ChatUser, ChatRoom, Task, Note } from '@/types';

export const MOCK_USERS: ChatUser[] = [
  { id: 'ai', name: 'UPZ AI', initials: 'AI', color: '#0EA5E9', status: 'online', role: 'AI Assistant' },
  { id: 'u1', name: 'Alex Kim', initials: 'AK', color: '#6366F1', status: 'online', role: 'Lead Developer' },
  { id: 'u2', name: 'Sara Chen', initials: 'SC', color: '#3B82F6', status: 'online', role: 'Designer' },
  { id: 'u3', name: 'James Wright', initials: 'JW', color: '#10B981', status: 'away', role: 'Project Manager' },
  { id: 'u4', name: 'Aisha Patel', initials: 'AP', color: '#F59E0B', status: 'offline', role: 'Content Creator' },
  { id: 'u5', name: 'Luca Rossi', initials: 'LR', color: '#EF4444', status: 'online', role: 'Marketing' },
  { id: 'me', name: 'You', initials: 'ME', color: '#8B5CF6', status: 'online' },
];

export const MOCK_CHAT_ROOMS: ChatRoom[] = [
  {
    id: 'r-ai',
    type: 'ai',
    name: 'UPZ AI Assistant',
    memberIds: ['me', 'ai'],
    unread: 0,
    pinned: true,
    messages: [
      { id: 'm-ai-1', userId: 'ai', text: 'Men UPZ ichidagi shaxsiy AI yordamchingizman. Goya, task, xabar matni, summary yoki project reja bo\'yicha yozing.', timestamp: Date.now() - 900000, read: true },
      { id: 'm-ai-2', userId: 'ai', text: 'Istalgan chatda /ai yozib matnni tuzatish, professional qilish yoki qisqartirish mumkin.', timestamp: Date.now() - 840000, read: true },
    ],
  },
  {
    id: 'r-saved',
    type: 'saved',
    name: 'Saqlangan xabarlar',
    memberIds: ['me'],
    unread: 0,
    pinned: true,
    messages: [
      { id: 'm-saved-1', userId: 'me', text: 'UPZ launch checklist: workspace, chat, teams, AI assistant and premium polish.', timestamp: Date.now() - 1200000, read: true, reactions: [{ emoji: 'done', userIds: ['me'] }] },
      { id: 'm-saved-2', userId: 'me', text: 'Saved messages can work like a private productivity inbox for links, notes and quick reminders.', timestamp: Date.now() - 600000, read: true },
    ],
  },
  {
    id: 'r1',
    type: '1on1',
    name: 'Alex Kim',
    memberIds: ['me', 'u1'],
    unread: 2,
    pinned: true,
    pinnedMessageId: 'm4',
    messages: [
      { id: 'm1', userId: 'u1', text: 'Hey! Have you seen the new project specs?', timestamp: Date.now() - 3600000, read: true },
      { id: 'm2', userId: 'me', text: 'Yes, just checked them out. The scope feels tight enough for MVP.', timestamp: Date.now() - 3500000, read: true, reactions: [{ emoji: 'done', userIds: ['u1'] }] },
      { id: 'm3', userId: 'u1', text: 'Great, let\'s sync tomorrow morning.', timestamp: Date.now() - 3400000, read: true },
      { id: 'm4', userId: 'u1', text: 'Can you review the PR before then?', timestamp: Date.now() - 1800000, read: true, replyToId: 'm2', reactions: [{ emoji: 'like', userIds: ['me'] }] },
    ],
  },
  {
    id: 'r2',
    type: '1on1',
    name: 'Sara Chen',
    memberIds: ['me', 'u2'],
    unread: 0,
    messages: [
      { id: 'm5', userId: 'u2', text: 'I updated the design mockups and premium assets', timestamp: Date.now() - 7200000, read: true },
      { id: 'm6', userId: 'me', text: 'They look amazing! Love the color palette.', timestamp: Date.now() - 7000000, read: true, edited: true, reactions: [{ emoji: 'heart', userIds: ['u2'] }] },
    ],
  },
  {
    id: 'r3',
    type: 'team',
    name: 'UPZ Core Team',
    memberIds: ['me', 'u1', 'u2', 'u3', 'u5'],
    unread: 5,
    pinned: true,
    messages: [
      { id: 'm7', userId: 'u3', text: 'Sprint review is tomorrow at 10 AM.', timestamp: Date.now() - 14400000, read: true },
      { id: 'm8', userId: 'u1', text: 'I\'ll prepare the demo flow and keep it under seven minutes.', timestamp: Date.now() - 14000000, read: true },
      { id: 'm9', userId: 'u2', text: 'Design assets are ready for review', timestamp: Date.now() - 13000000, read: true, reactions: [{ emoji: 'clap', userIds: ['me', 'u3'] }] },
      { id: 'm10', userId: 'u5', text: 'Marketing brief sent to all stakeholders.', timestamp: Date.now() - 3600000, read: true },
      { id: 'm11', userId: 'u3', text: 'Thanks everyone, great work this sprint! Shipping mode is on.', timestamp: Date.now() - 1800000, read: true, replyToId: 'm9' },
    ],
  },
  {
    id: 'r4',
    type: 'project',
    name: 'Landing Page Redesign',
    memberIds: ['me', 'u2', 'u5'],
    unread: 0,
    projectBadge: 'UPZ-142',
    linkedTask: 'Landing hero QA',
    pinnedMessageId: 'm12',
    messages: [
      { id: 'm12', userId: 'u2', text: 'Wireframes attached in Figma. The hero CTA variant is the one to test.', timestamp: Date.now() - 86400000, read: true },
      { id: 'm13', userId: 'me', text: 'Got it, will review today.', timestamp: Date.now() - 82800000, read: true, reactions: [{ emoji: 'fire', userIds: ['u5'] }] },
    ],
  },
  {
    id: 'r5',
    type: 'group',
    name: 'Freelancers Network',
    memberIds: ['me', 'u1', 'u4', 'u5'],
    unread: 1,
    messages: [
      { id: 'm14', userId: 'u4', text: 'Anyone interested in a collab for this month?', timestamp: Date.now() - 172800000, read: true },
      { id: 'm15', userId: 'u1', text: 'I\'m in! What\'s the project?', timestamp: Date.now() - 170000000, read: true, reactions: [{ emoji: 'laugh', userIds: ['u5'] }] },
      { id: 'm16', userId: 'u4', text: 'UX audit for a SaaS startup.', timestamp: Date.now() - 7200000, read: true },
    ],
  },
];
export const INITIAL_TASKS: Task[] = [
  { id: 't1', text: 'Review project requirements', done: true, createdAt: Date.now() - 86400000, priority: 'high' },
  { id: 't2', text: 'Design onboarding flow', done: true, createdAt: Date.now() - 72000000, priority: 'high' },
  { id: 't3', text: 'Set up project structure', done: false, createdAt: Date.now() - 36000000, priority: 'medium' },
  { id: 't4', text: 'Write API documentation', done: false, createdAt: Date.now() - 10000000, priority: 'low' },
  { id: 't5', text: 'Prepare investor deck', done: false, createdAt: Date.now() - 3600000, priority: 'high' },
];

export const INITIAL_NOTES: Note[] = [
  {
    id: 'n1',
    title: 'MVP Feature List',
    content: 'Dashboard, Chat, Tasks, Workspace, Profile, Settings. Keep it simple for v1.',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
  },
  {
    id: 'n2',
    title: 'Design System Colors',
    content: 'Background: #F7FAFC\nCards: #FFFFFF\nBorder: #E5E7EB\nText: #111827\nAccent: #6366F1 and #3B82F6',
    createdAt: Date.now() - 43200000,
    updatedAt: Date.now() - 10000000,
  },
  {
    id: 'n3',
    title: 'Meeting Notes - Sprint 1',
    content: 'Focus on landing page polish and internal app skeleton. Demo ready by Friday.',
    createdAt: Date.now() - 7200000,
    updatedAt: Date.now() - 7200000,
  },
];

export const WEEKLY_ACTIVITY = [
  { day: 'Mon', tasks: 4, messages: 12 },
  { day: 'Tue', tasks: 7, messages: 8 },
  { day: 'Wed', tasks: 3, messages: 20 },
  { day: 'Thu', tasks: 9, messages: 15 },
  { day: 'Fri', tasks: 5, messages: 11 },
  { day: 'Sat', tasks: 2, messages: 4 },
  { day: 'Sun', tasks: 1, messages: 2 },
];

export const PROFESSION_LABELS: Record<string, string> = {
  developer: 'Developer',
  teacher: 'Teacher',
  student: 'Student',
  freelancer: 'Freelancer',
  designer: 'Designer',
  smm: 'SMM Specialist',
  creator: 'Content Creator',
};

export const GOAL_LABELS: Record<string, string> = {
  learn: 'Learn Skills',
  find_work: 'Find Work',
  manage_team: 'Manage Team',
  build_portfolio: 'Build Portfolio',
  freelance: 'Freelance',
};

export const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

import type {
  AutomationRule,
  ClipItem,
  DashboardWidget,
  DocPage,
  FormField,
  MilestoneGoal,
  SmartTask,
  TaskView,
  TimeEntry,
  WhiteboardNode,
  WorkspaceZone,
} from "@/types";

export const COMMUNITY_GROUPS = [
  { id: "dev", name: "Developer Guild", profession: "Developers", members: 12840, joined: true, moderation: "3 pending posts", description: "Code reviews, build logs, job leads, and framework discussions." },
  { id: "design", name: "Design Circle", profession: "Designers", members: 6240, joined: false, moderation: "Clean", description: "Portfolio critique, UI systems, motion, and client workflows." },
  { id: "teach", name: "Teacher Hub", profession: "Teachers", members: 3810, joined: false, moderation: "1 report", description: "Lesson planning, student engagement, classroom resources." },
  { id: "freelance", name: "Freelancer Market", profession: "Freelancers", members: 9150, joined: true, moderation: "Clean", description: "Proposals, pricing, client operations, and collaboration." },
  { id: "creator", name: "Creator Studio", profession: "Creators", members: 7340, joined: false, moderation: "2 flagged replies", description: "Content calendars, monetization, scripts, editing pipelines, and audience growth." },
  { id: "smm", name: "Growth & SMM Lab", profession: "SMM", members: 5120, joined: false, moderation: "Clean", description: "Campaign strategy, analytics, SEO, paid social, and brand systems." },
  { id: "student", name: "Student Progress Club", profession: "Students", members: 10920, joined: true, moderation: "5 pending intros", description: "Learning accountability, portfolios, peer review, and first-job preparation." },
];

export const COMMUNITY_CHANNELS = [
  { id: "c1", name: "UPZ Product Updates", subscribers: "18.4K", category: "Official", last: "Workspace presets shipped" },
  { id: "c2", name: "Remote Jobs Digest", subscribers: "9.2K", category: "Careers", last: "12 new verified roles" },
  { id: "c3", name: "Learning Drops", subscribers: "7.8K", category: "Education", last: "AI prompt design mini-course" },
  { id: "c4", name: "Freelance Deals Radar", subscribers: "6.5K", category: "Market", last: "5 project requests under review" },
  { id: "c5", name: "Design Systems Weekly", subscribers: "4.1K", category: "Design", last: "Token naming patterns for SaaS teams" },
  { id: "c6", name: "Build in Public", subscribers: "11.6K", category: "Startup", last: "MVP launch retrospectives" },
];

export const COMMUNITY_THREADS = [
  { id: "t1", title: "How should small teams organize project chats?", replies: 28, author: "Sara Chen", status: "Hot" },
  { id: "t2", title: "Share your weekly productivity dashboard", replies: 14, author: "Alex Kim", status: "Open" },
  { id: "t3", title: "Best client handoff checklist for freelancers", replies: 36, author: "Aisha Patel", status: "Pinned" },
  { id: "t4", title: "What should a Universal Bank invoice include?", replies: 19, author: "Luca Rossi", status: "Open" },
  { id: "t5", title: "AI assistant prompts that actually save time", replies: 44, author: "Mira Johnson", status: "Hot" },
  { id: "t6", title: "Drop your portfolio homepage for review", replies: 67, author: "Otabek Karimov", status: "Pinned" },
];

export const NEWS_ARTICLES = [
  { id: "n1", title: "AI copilots are becoming project teammates", category: "AI", readTime: "5 min", trending: true, saved: true, summary: "A practical look at how AI assistants move from chat windows into task, planning, and review loops." },
  { id: "n2", title: "Remote work tools consolidate around workflow hubs", category: "Productivity", readTime: "4 min", trending: true, saved: false, summary: "Teams increasingly prefer unified dashboards over scattered single-purpose apps." },
  { id: "n3", title: "Freelance payment rails expand local currency support", category: "Freelance", readTime: "6 min", trending: false, saved: false, summary: "New wallet UX patterns reduce the gap between contracts, invoices, and payouts." },
  { id: "n4", title: "Learning paths get shorter and more adaptive", category: "Learning", readTime: "3 min", trending: false, saved: false, summary: "Skill platforms are shifting toward personalized practice loops tied to user goals." },
  { id: "n5", title: "Community-led products are turning users into operators", category: "Community", readTime: "7 min", trending: true, saved: false, summary: "Channels, groups, and member-led discussions are becoming core retention loops for SaaS platforms." },
  { id: "n6", title: "Wallet-first freelance dashboards improve trust", category: "Finance", readTime: "5 min", trending: false, saved: true, summary: "Showing earnings, payouts, invoices, and payment methods together helps freelancers understand cash flow faster." },
  { id: "n7", title: "Design systems need motion tokens, not just color tokens", category: "Design", readTime: "4 min", trending: true, saved: false, summary: "Teams are documenting animation duration, easing, loading states, and empty-state motion as reusable product rules." },
  { id: "n8", title: "Global search is becoming the command center", category: "UX", readTime: "3 min", trending: false, saved: false, summary: "Search patterns now span people, projects, conversations, files, and knowledge objects in one modal." },
];

export const BANK_TRANSACTIONS = [
  { id: "ub-1007", title: "Client payment - Landing redesign", type: "Freelance earning", amount: "+$1,240.00", status: "Completed", date: "Today" },
  { id: "ub-1006", title: "UPZ Pro workspace", type: "Subscription", amount: "-$19.00", status: "Completed", date: "Yesterday" },
  { id: "ub-1005", title: "Local payout to card", type: "Withdrawal", amount: "-$520.00", status: "Processing", date: "May 3" },
  { id: "ub-1004", title: "Crypto placeholder transfer", type: "Crypto", amount: "+0.018 BTC", status: "Demo", date: "May 2" },
  { id: "ub-1003", title: "Team bonus pool", type: "Team earning", amount: "+$680.00", status: "Completed", date: "May 1" },
  { id: "ub-1002", title: "Invoice #UPZ-142", type: "Invoice", amount: "+$2,400.00", status: "Processing", date: "Apr 29" },
  { id: "ub-1001", title: "Course marketplace payout", type: "Learning", amount: "+$310.00", status: "Completed", date: "Apr 26" },
];

export const TEAM_MEMBERS = [
  { id: "tm1", name: "Alex Kim", role: "Admin", focus: "Frontend", status: "Online" },
  { id: "tm2", name: "Sara Chen", role: "Member", focus: "Design", status: "Online" },
  { id: "tm3", name: "James Wright", role: "Member", focus: "Delivery", status: "Away" },
  { id: "tm4", name: "Luca Rossi", role: "Member", focus: "Marketing", status: "Offline" },
  { id: "tm5", name: "Mira Johnson", role: "Member", focus: "Product", status: "Online" },
  { id: "tm6", name: "Otabek Karimov", role: "Member", focus: "Backend", status: "Away" },
];

export const MEETING_ROOMS = [
  {
    id: "m-call-1",
    title: "UPZ Core Team Sync",
    type: "Team",
    status: "Live",
    time: "Now",
    duration: "32 min",
    host: "Alex Kim",
    participants: ["Alex Kim", "Sara Chen", "Mira Johnson", "Otabek Karimov"],
    agenda: ["Chat polish review", "Dark mode QA", "Render deploy notes"],
    code: "upz-core-418",
  },
  {
    id: "m-call-2",
    title: "Landing Page Design Review",
    type: "Project",
    status: "Upcoming",
    time: "14:30",
    duration: "45 min",
    host: "Sara Chen",
    participants: ["Sara Chen", "Ahmad", "James Wright"],
    agenda: ["Hero copy", "Animation placement", "Mobile CTA spacing"],
    code: "landing-review-52",
  },
  {
    id: "m-call-3",
    title: "Freelancer Client Call",
    type: "1:1",
    status: "Scheduled",
    time: "16:00",
    duration: "25 min",
    host: "Ahmad",
    participants: ["Ahmad", "Luca Rossi"],
    agenda: ["Scope alignment", "Invoice milestone", "Next delivery"],
    code: "client-call-09",
  },
];

export const MEETING_PARTICIPANTS = [
  { id: "mp1", name: "Ahmad", role: "Host", status: "Speaking", color: "#6366F1" },
  { id: "mp2", name: "Alex Kim", role: "Frontend", status: "Online", color: "#3B82F6" },
  { id: "mp3", name: "Sara Chen", role: "Design", status: "Muted", color: "#8B5CF6" },
  { id: "mp4", name: "Mira Johnson", role: "Product", status: "Online", color: "#10B981" },
  { id: "mp5", name: "Otabek Karimov", role: "Backend", status: "Camera off", color: "#F59E0B" },
  { id: "mp6", name: "James Wright", role: "Delivery", status: "Joining", color: "#EF4444" },
];

export const PROJECT_COLUMNS = [
  { id: "todo", title: "To do", tasks: ["Set up project brief", "Invite beta testers", "Confirm payment copy", "Document first-version animation usage"] },
  { id: "doing", title: "In progress", tasks: ["Build community moderation UI", "Wire wallet history", "Draft AI assistant prompts", "Expand news category model"] },
  { id: "review", title: "Review", tasks: ["Chat mobile polish", "Workspace integration cards", "Team role permissions"] },
  { id: "done", title: "Done", tasks: ["MVP routes", "Onboarding", "Profile setup", "Light shell migration"] },
];

export const ACTIVITY_LOG = [
  "Sara moved Chat mobile polish to Review",
  "Alex assigned Wallet history to Luca",
  "James created deadline for Community beta",
  "Aisha commented on onboarding copy",
  "Mira added AI idea generator prompts",
  "Otabek connected project search data",
  "Luca approved Universal Bank transaction states",
];

export const GLOBAL_SEARCH_ITEMS = [
  { type: "User", title: "Alex Kim", detail: "Lead Developer" },
  { type: "Chat", title: "UPZ Core Team", detail: "5 members, 3 online" },
  { type: "Meeting", title: "UPZ Core Team Sync", detail: "Live meeting room" },
  { type: "Task", title: "Build community moderation UI", detail: "Project: UPZ Platform" },
  { type: "Project", title: "Landing Page Redesign", detail: "UPZ-142" },
  { type: "Article", title: "AI copilots are becoming project teammates", detail: "News" },
  { type: "Wallet", title: "Invoice #UPZ-142", detail: "Universal Bank" },
  { type: "Premium", title: "UPZ Pro", detail: "Premium account benefits and upgrade plans" },
  { type: "Animation", title: "Original hero animation", detail: "First-version asset library" },
  { type: "Learning", title: "AI-powered productivity", detail: "64% complete" },
  { type: "Team", title: "UPZ Launch Squad", detail: "6 members" },
];

export const NOTIFICATIONS = [
  { id: "no1", category: "Project", title: "Deadline updated", body: "Community beta moved to Friday.", unread: true, time: "4m" },
  { id: "no2", category: "Chat", title: "New mention", body: "Sara mentioned you in UPZ Core Team.", unread: true, time: "18m" },
  { id: "no3", category: "Bank", title: "Payment received", body: "Client payment is available in Universal Bank.", unread: false, time: "2h" },
  { id: "no4", category: "News", title: "Saved article updated", body: "A related AI assistant article is trending.", unread: false, time: "1d" },
  { id: "no5", category: "Community", title: "Thread is hot", body: "AI assistant prompts reached 44 replies.", unread: true, time: "2d" },
  { id: "no6", category: "Workspace", title: "Integration ready", body: "Calendar card is ready for backend wiring.", unread: false, time: "3d" },
];

export const PUBLIC_LOTTIE_ANIMATIONS = [
  { id: "hero", title: "UPZ hero", url: "/animations/hero.json", area: "Landing", description: "Original first-version hero motion." },
  { id: "chat", title: "Chat flow", url: "/animations/chat.json", area: "Chat", description: "Original chat animation." },
  { id: "tasks", title: "Task manager", url: "/animations/tasks.json", area: "Tasks", description: "Original productivity task animation." },
  { id: "ai", title: "AI assistant", url: "/animations/ai.json", area: "AI", description: "Original AI learning animation." },
  { id: "ai2", title: "AI copilot", url: "/animations/ai2.json", area: "AI", description: "Original AI secondary animation." },
  { id: "learning", title: "Learning", url: "/animations/learning.json", area: "Learning", description: "Original learning animation." },
  { id: "freelance", title: "Freelance work", url: "/animations/freelance.json", area: "Freelance", description: "Original freelance animation." },
  { id: "rocket", title: "Launch", url: "/animations/rocket.json", area: "Startup", description: "Original rocket animation." },
];

export const ECOSYSTEM_MODULES = [
  { name: "Community", status: "Expanded", score: "92%", users: "28K", motion: "/animations/chat.json" },
  { name: "News", status: "Personalized", score: "86%", users: "11K", motion: "/animations/learning.json" },
  { name: "Universal Bank", status: "Wallet demo", score: "74%", users: "4.8K", motion: "/animations/freelance.json" },
  { name: "AI Assistant", status: "Copilot ready", score: "89%", users: "19K", motion: "/animations/ai2.json" },
  { name: "Projects", status: "Kanban ready", score: "81%", users: "9.4K", motion: "/animations/tasks.json" },
  { name: "Teams", status: "Role model", score: "77%", users: "6.2K", motion: "/animations/hero.json" },
];

export const PROFESSIONAL_COMMUNITIES = [
  { profession: "Frontend Engineers", groups: 42, channels: 18, mentors: 96, weeklyPosts: 1240 },
  { profession: "Product Designers", groups: 31, channels: 14, mentors: 61, weeklyPosts: 840 },
  { profession: "Teachers", groups: 24, channels: 9, mentors: 44, weeklyPosts: 520 },
  { profession: "Freelancers", groups: 38, channels: 16, mentors: 72, weeklyPosts: 1100 },
  { profession: "Content Creators", groups: 27, channels: 11, mentors: 53, weeklyPosts: 760 },
  { profession: "SMM Specialists", groups: 21, channels: 8, mentors: 39, weeklyPosts: 610 },
];

export const LEARNING_PATHS = [
  { id: "lp1", title: "AI-powered productivity", level: "Intermediate", modules: 8, progress: 64, animation: "/animations/ai.json" },
  { id: "lp2", title: "Freelance business system", level: "Advanced", modules: 10, progress: 42, animation: "/animations/freelance.json" },
  { id: "lp3", title: "Team project management", level: "Beginner", modules: 6, progress: 78, animation: "/animations/tasks.json" },
  { id: "lp4", title: "Community building", level: "Intermediate", modules: 7, progress: 55, animation: "/animations/chat.json" },
];

export const FEATURED_CREATORS = [
  { name: "Mira Johnson", role: "Product Designer", followers: "18.2K", contribution: "Design systems teardown", badge: "Mentor" },
  { name: "Otabek Karimov", role: "Frontend Engineer", followers: "12.7K", contribution: "React architecture guide", badge: "Top writer" },
  { name: "Aisha Patel", role: "Freelance Strategist", followers: "21.4K", contribution: "Client onboarding checklist", badge: "Verified" },
  { name: "Luca Rossi", role: "SMM Lead", followers: "9.8K", contribution: "Campaign analytics template", badge: "Creator" },
];

export const PAYMENT_METHODS = [
  { name: "Uzcard / Humo", region: "Uzbekistan", status: "Placeholder", fee: "1.2%" },
  { name: "Visa / Mastercard", region: "Global", status: "Ready UI", fee: "2.4%" },
  { name: "USDT wallet", region: "Crypto", status: "Demo", fee: "Network" },
  { name: "Bank transfer", region: "Local", status: "Planned", fee: "Fixed" },
];

export const PREMIUM_BENEFITS = [
  { id: "ai", title: "AI Power Mode", description: "Higher AI limits for planning, learning, writing, project ideas, and team summaries.", metric: "10x AI usage", accent: "#6366F1" },
  { id: "workspace", title: "Advanced Workspace", description: "Save custom layouts, premium project views, workspace templates, and deeper integrations.", metric: "Custom layouts", accent: "#3B82F6" },
  { id: "meetings", title: "Premium Meetings", description: "Longer video calls, recording placeholders, agenda notes, and team meeting rooms.", metric: "180 min rooms", accent: "#10B981" },
  { id: "bank", title: "Universal Bank Plus", description: "Lower payout fee placeholders, freelance earning analytics, invoices, and local payment priority.", metric: "Lower fees", accent: "#F59E0B" },
  { id: "community", title: "Verified Community", description: "Premium badge, private channels, mentor rooms, boosted posts, and priority moderation.", metric: "Verified badge", accent: "#EF4444" },
  { id: "support", title: "Priority Support", description: "Fast support lane, onboarding help, product guidance, and premium roadmap access.", metric: "Priority lane", accent: "#8B5CF6" },
];

export const PREMIUM_PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    badge: "Current MVP",
    description: "For trying UPZ and managing a light personal workspace.",
    cta: "Current plan",
    featured: false,
    features: ["Basic workspace", "3 active projects", "20 AI actions/day", "30 min demo meetings", "Community read access"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$12",
    period: "per month",
    badge: "Best for creators",
    description: "For freelancers, students, creators, and solo builders who want more power.",
    cta: "Upgrade to Pro",
    featured: true,
    features: ["Unlimited projects", "10x AI assistant usage", "Premium meetings", "Universal Bank Plus", "Verified profile badge"],
  },
  {
    id: "team",
    name: "Team",
    price: "$29",
    period: "per seat",
    badge: "Teams",
    description: "For teams that need roles, shared workspaces, analytics, and priority workflows.",
    cta: "Start team plan",
    featured: false,
    features: ["Everything in Pro", "Team roles", "Shared project rooms", "Admin controls", "Priority support"],
  },
];

export const PREMIUM_COMPARISON = [
  { feature: "Active projects", free: "3", pro: "Unlimited", team: "Unlimited + team spaces" },
  { feature: "AI assistant", free: "20/day", pro: "10x usage", team: "Team shared quota" },
  { feature: "Meetings", free: "30 min demo", pro: "180 min rooms", team: "Team rooms + admin controls" },
  { feature: "Universal Bank", free: "Basic wallet", pro: "Plus analytics", team: "Team earning dashboard" },
  { feature: "Community", free: "Public groups", pro: "Verified badge", team: "Private team channels" },
  { feature: "Support", free: "Community support", pro: "Priority lane", team: "Dedicated onboarding" },
];

export const AI_IDEAS = [
  { prompt: "Generate a micro-SaaS idea for designers", output: "Client feedback portal with AI summary and visual QA checklist." },
  { prompt: "Suggest tasks for UPZ launch", output: "Finalize onboarding, invite beta users, publish feature tour, monitor feedback." },
  { prompt: "Create a learning plan", output: "Three-week path: fundamentals, practice projects, portfolio proof." },
  { prompt: "Improve my freelance workflow", output: "Add proposal templates, invoice milestones, client check-ins, and delivery archive." },
];


export const POWER_VIEWS: TaskView[] = ["list", "board", "table", "calendar", "timeline", "dashboard"];

export const WORKSPACE_ZONE: WorkspaceZone = {
  id: "zone-upz",
  name: "UPZ Operating Zone",
  health: 91,
  spaces: [
    {
      id: "space-product",
      name: "Product",
      collections: [
        { id: "collection-launch", name: "Launch System", boards: ["Roadmap", "Sprint", "QA"] },
        { id: "collection-growth", name: "Growth Lab", boards: ["Community", "News", "Premium"] },
      ],
    },
    {
      id: "space-client",
      name: "Client Work",
      collections: [
        { id: "collection-freelance", name: "Freelance Ops", boards: ["Deals", "Delivery", "Invoices"] },
        { id: "collection-learning", name: "Learning Hub", boards: ["Paths", "Mentors", "Reviews"] },
      ],
    },
  ],
};

export const SMART_TASKS: SmartTask[] = [
  {
    id: "st-101",
    title: "Design task drawer power workflow",
    description: "Create a task detail drawer with smart fields, subtasks, comments, activity, and linked chat actions.",
    status: "in_progress",
    priority: "high",
    assignee: "Sara Chen",
    dueDate: "May 9",
    project: "UPZ Platform",
    tags: ["Design System", "Tasks", "Power UI"],
    progress: 68,
    estimate: "6h",
    timeTracked: "3h 20m",
    fields: [
      { id: "field-type", label: "Type", type: "select", value: "Feature", tone: "indigo" },
      { id: "field-risk", label: "Risk", type: "select", value: "Medium", tone: "amber" },
      { id: "field-space", label: "Space", type: "text", value: "Product", tone: "blue" },
      { id: "field-client", label: "Client", type: "person", value: "Internal", tone: "slate" },
    ],
    subtasks: [
      { id: "sub-1", text: "Map fields", done: true },
      { id: "sub-2", text: "Build drawer", done: true },
      { id: "sub-3", text: "Add comments and activity", done: false },
    ],
    comments: [
      { id: "c-1", author: "Alex Kim", text: "Keep the drawer dense, but readable on mobile.", time: "18m" },
      { id: "c-2", author: "Mira Johnson", text: "Add create-task-from-chat as a visible placeholder.", time: "7m" },
    ],
    activity: ["Moved to In progress", "Sara updated the due date", "AI suggested 3 nested actions"],
  },
  {
    id: "st-102",
    title: "Build workspace hierarchy navigation",
    description: "Add Zone, Spaces, Collections, and Boards to make UPZ feel like a true operating system.",
    status: "review",
    priority: "high",
    assignee: "Alex Kim",
    dueDate: "May 10",
    project: "Workspace Core",
    tags: ["Workspace", "Navigation", "Views"],
    progress: 82,
    estimate: "5h",
    timeTracked: "4h 10m",
    fields: [
      { id: "field-type", label: "Type", type: "select", value: "Architecture", tone: "indigo" },
      { id: "field-risk", label: "Risk", type: "select", value: "Low", tone: "green" },
      { id: "field-space", label: "Space", type: "text", value: "Product", tone: "blue" },
      { id: "field-client", label: "Client", type: "person", value: "Internal", tone: "slate" },
    ],
    subtasks: [
      { id: "sub-4", text: "Create zone data", done: true },
      { id: "sub-5", text: "Add board switcher", done: true },
      { id: "sub-6", text: "Save selected board", done: false },
    ],
    comments: [{ id: "c-3", author: "James Wright", text: "Hierarchy should stay clear for beginners.", time: "1h" }],
    activity: ["Created from planning session", "Linked to Workspace route", "Review requested"],
  },
  {
    id: "st-103",
    title: "Create automation builder demo",
    description: "Show Flow Automations with trigger/action rules, enable toggles, and local run counters.",
    status: "todo",
    priority: "medium",
    assignee: "Otabek Karimov",
    dueDate: "May 11",
    project: "Automation",
    tags: ["Automation", "MVP", "LocalStorage"],
    progress: 30,
    estimate: "4h",
    timeTracked: "45m",
    fields: [
      { id: "field-type", label: "Type", type: "select", value: "Automation", tone: "indigo" },
      { id: "field-risk", label: "Risk", type: "select", value: "Medium", tone: "amber" },
      { id: "field-space", label: "Space", type: "text", value: "Workflow", tone: "blue" },
      { id: "field-client", label: "Client", type: "person", value: "Team", tone: "slate" },
    ],
    subtasks: [
      { id: "sub-7", text: "Create rules", done: true },
      { id: "sub-8", text: "Add toggles", done: false },
      { id: "sub-9", text: "Persist local state", done: false },
    ],
    comments: [{ id: "c-4", author: "Mira Johnson", text: "Make the rules feel powerful but obvious.", time: "2h" }],
    activity: ["Backlog triaged", "Assigned to backend-ready UI lane"],
  },
  {
    id: "st-104",
    title: "Meeting summary to tasks flow",
    description: "Convert agenda notes into task previews, owners, and due dates inside the meetings page.",
    status: "done",
    priority: "medium",
    assignee: "James Wright",
    dueDate: "May 8",
    project: "Meetings",
    tags: ["Meetings", "AI", "Tasks"],
    progress: 100,
    estimate: "3h",
    timeTracked: "3h",
    fields: [
      { id: "field-type", label: "Type", type: "select", value: "Collaboration", tone: "indigo" },
      { id: "field-risk", label: "Risk", type: "select", value: "Low", tone: "green" },
      { id: "field-space", label: "Space", type: "text", value: "Team", tone: "blue" },
      { id: "field-client", label: "Client", type: "person", value: "Internal", tone: "slate" },
    ],
    subtasks: [
      { id: "sub-10", text: "Agenda cards", done: true },
      { id: "sub-11", text: "Action item preview", done: true },
      { id: "sub-12", text: "Assign owners", done: true },
    ],
    comments: [{ id: "c-5", author: "Sara Chen", text: "This makes meetings feel tied to actual output.", time: "1d" }],
    activity: ["Completed", "Added to demo checklist"],
  },
];

export const AUTOMATION_RULES: AutomationRule[] = [
  { id: "auto-1", name: "Review handoff", trigger: "task moves to Review", action: "notify assignee and create QA checklist", enabled: true, runs: 18 },
  { id: "auto-2", name: "Client invoice reminder", trigger: "milestone becomes Done", action: "draft Universal Bank invoice", enabled: true, runs: 7 },
  { id: "auto-3", name: "Meeting action extractor", trigger: "meeting ends", action: "create action item previews", enabled: false, runs: 4 },
];

export const GOALS: MilestoneGoal[] = [
  { id: "goal-1", title: "Launch UPZ power workspace", owner: "Ahmad", progress: 76, dueDate: "May 20" },
  { id: "goal-2", title: "Reach first 100 beta users", owner: "Growth Team", progress: 44, dueDate: "Jun 1" },
  { id: "goal-3", title: "Ship backend-ready data model", owner: "Alex Kim", progress: 58, dueDate: "May 28" },
];

export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  { id: "w-tasks", title: "Smart tasks", value: "42", meta: "12 due this week", tone: "indigo" },
  { id: "w-workload", title: "Workload", value: "84%", meta: "Team capacity is healthy", tone: "green" },
  { id: "w-goals", title: "Milestones", value: "3", meta: "1 launch goal at risk", tone: "amber" },
  { id: "w-time", title: "Focus time", value: "28h", meta: "Tracked this week", tone: "blue" },
  { id: "w-risk", title: "Project risk", value: "Low", meta: "2 blockers open", tone: "green" },
  { id: "w-mentions", title: "Mentions", value: "9", meta: "Chat and docs", tone: "red" },
  { id: "w-wallet", title: "Earnings", value: "$4.6k", meta: "Universal Bank demo", tone: "green" },
  { id: "w-ai", title: "AI suggestions", value: "14", meta: "Ready to apply", tone: "indigo" },
];

export const DOC_PAGES: DocPage[] = [
  { id: "doc-1", title: "UPZ Product Operating Manual", space: "Product", updated: "Today", linkedTasks: 8, excerpt: "Vision, feature principles, routes, and delivery rituals for the UPZ ecosystem." },
  { id: "doc-2", title: "Client Delivery Checklist", space: "Freelance Ops", updated: "Yesterday", linkedTasks: 5, excerpt: "Proposal, kickoff, delivery, invoice, feedback, and archive steps." },
  { id: "doc-3", title: "Community Moderation Guide", space: "Growth Lab", updated: "May 5", linkedTasks: 4, excerpt: "Public group rules, creator badges, reports, and escalation flow." },
];

export const WHITEBOARD_NODES: WhiteboardNode[] = [
  { id: "node-1", title: "Workspace hierarchy", type: "idea", x: 18, y: 18 },
  { id: "node-2", title: "Task drawer", type: "task", x: 54, y: 28 },
  { id: "node-3", title: "Automation flow", type: "decision", x: 33, y: 62 },
  { id: "node-4", title: "Mobile density risk", type: "risk", x: 72, y: 66 },
];

export const FORM_FIELDS: FormField[] = [
  { id: "form-1", label: "Requester email", type: "email", required: true },
  { id: "form-2", label: "Project type", type: "select", required: true },
  { id: "form-3", label: "Deadline", type: "date", required: false },
  { id: "form-4", label: "Brief", type: "textarea", required: true },
];

export const CLIP_ITEMS: ClipItem[] = [
  { id: "clip-1", title: "Task drawer walkthrough", duration: "02:14", owner: "Sara", linkedTask: "st-101" },
  { id: "clip-2", title: "Workspace hierarchy QA", duration: "01:32", owner: "Alex", linkedTask: "st-102" },
  { id: "clip-3", title: "Meeting action extraction", duration: "03:08", owner: "James", linkedTask: "st-104" },
];

export const TIME_ENTRIES: TimeEntry[] = [
  { id: "time-1", task: "Design task drawer power workflow", owner: "Sara Chen", duration: "3h 20m", date: "Today" },
  { id: "time-2", task: "Build workspace hierarchy navigation", owner: "Alex Kim", duration: "4h 10m", date: "Today" },
  { id: "time-3", task: "Create automation builder demo", owner: "Otabek Karimov", duration: "45m", date: "Yesterday" },
];

export const AI_AGENTS = [
  { id: "agent-task", title: "Task Planner", description: "Turns loose goals into Smart Tasks, nested actions, owners, and due dates." },
  { id: "agent-doc", title: "Doc Summarizer", description: "Summarizes Knowledge Hub pages and extracts linked task decisions." },
  { id: "agent-project", title: "Project Idea Generator", description: "Creates project briefs, milestones, risk notes, and starter boards." },
  { id: "agent-meeting", title: "Meeting Summary", description: "Turns agenda notes into action items and follow-up task previews." },
  { id: "agent-auto", title: "Automation Builder", description: "Suggests Flow Automation trigger/action rules from repeated work." },
];

export const TEAM_SPACES = [
  { id: "ts-1", name: "Launch Squad", projects: 4, workload: 82, permissions: "Admin + Member roles" },
  { id: "ts-2", name: "Design Systems", projects: 3, workload: 71, permissions: "Reviewer workflow" },
  { id: "ts-3", name: "Growth & Community", projects: 5, workload: 88, permissions: "Moderator lane" },
];

export const WORKSPACE_SETTINGS = [
  { id: "settings-status", title: "Statuses", value: "Backlog, To do, In progress, Review, Done" },
  { id: "settings-fields", title: "Smart fields", value: "Risk, client, estimate, focus mode, invoice state" },
  { id: "settings-templates", title: "Templates", value: "Launch, freelance delivery, learning path, team sprint" },
  { id: "settings-density", title: "Design density", value: "Power user compact mode" },
  { id: "settings-views", title: "Saved views", value: "Personal, Team, Freelancer, Launch" },
];

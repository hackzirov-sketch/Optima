import { useState } from "react";
import { Bot, CalendarClock, CheckSquare, Lightbulb, MessageSquare, Send, Sparkles, Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/app/AppLayout";
import { ActionButton, PageHeader, PageShell, Pill, SectionTitle, SurfaceCard } from "@/components/app/DesignSystem";
import { CommandMenu, TaskDrawer } from "@/components/app/PowerWorkspaceSystem";
import { AIAssistantStateBadge } from "@/components/premium/PremiumAssets";
import { AI_AGENTS, AI_IDEAS, AUTOMATION_RULES, LEARNING_PATHS, SMART_TASKS } from "@/data/ecosystemData";
import type { UserProfile } from "@/types";

interface Props {
  user: UserProfile;
  onLogout: () => void;
}

type AssistantMessage = {
  role: "assistant" | "user";
  text?: string;
  textKey?: string;
};

const INITIAL_MESSAGES: AssistantMessage[] = [
  { role: "assistant", textKey: "welcome" },
  { role: "user", textKey: "focusPlan" },
  { role: "assistant", textKey: "focusAnswer" },
];

const SUGGESTIONS = ["createTasks", "learnNext", "saasIdea", "teamActivity"] as const;
const MODES = ["learning", "projects", "tasks", "team"] as const;

export default function AssistantPage({ user, onLogout }: Props) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<AssistantMessage[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState("");
  const [previewTaskId, setPreviewTaskId] = useState(SMART_TASKS[0]?.id ?? "");
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const previewTask = SMART_TASKS.find((task) => task.id === previewTaskId) ?? SMART_TASKS[0];
  const drawerTask = SMART_TASKS.find((task) => task.id === drawerTaskId) ?? null;

  const messageText = (message: AssistantMessage) => message.text ?? t(`app.assistant.messages.${message.textKey}`);

  const sendMessage = (text = draft) => {
    if (!text.trim()) return;
    setMessages((current) => [
      ...current,
      { role: "user", text: text.trim() },
      { role: "assistant", textKey: "demoResponse" },
    ]);
    setDraft("");
  };

  return (
    <AppLayout user={user} title={t("app.nav.assistant")} onLogout={onLogout}>
      <PageShell>
        <PageHeader
          eyebrow={t("app.assistant.eyebrow")}
          title={t("app.assistant.title")}
          description={t("app.assistant.description")}
        >
          <ActionButton><Sparkles className="h-4 w-4" /> {t("app.assistant.generatePlan")}</ActionButton>
        </PageHeader>

        <SurfaceCard>
          <SectionTitle
            icon={Sparkles}
            title={t("app.assistant.agentsTitle", "Optima AI Agents")}
            description={t("app.assistant.agentsDesc", "Task planner, doc summarizer, project idea generator, meeting summary, and automation builder agents for the whole workspace.")}
          />
          <div className="mb-4 flex flex-wrap gap-2">
            <AIAssistantStateBadge state="thinking" />
            <AIAssistantStateBadge state="typing" />
            <AIAssistantStateBadge state="generating" />
            <AIAssistantStateBadge state="completed" />
          </div>
          <CommandMenu
            commands={AI_AGENTS}
            onRun={(id) => {
              const agent = AI_AGENTS.find((item) => item.id === id);
              setPreviewTaskId(SMART_TASKS[Math.max(0, AI_AGENTS.findIndex((item) => item.id === id)) % SMART_TASKS.length].id);
              sendMessage(agent ? `Run ${agent.title} for this workspace` : "Run Optima AI agent");
            }}
          />
        </SurfaceCard>

        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <SurfaceCard className="flex min-h-[620px] flex-col">
            <SectionTitle icon={Bot} title={t("app.assistant.chatTitle")} description={t("app.assistant.chatDesc")} />
            <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-[#F7FAFC] p-4">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${message.role === "user" ? "bg-indigo-600 text-white" : "border border-[#E5E7EB] bg-white text-[#111827]"}`}>
                    {messageText(message)}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white p-2 shadow-sm">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && sendMessage()}
                placeholder={t("app.assistant.inputPlaceholder")}
                className="min-w-0 flex-1 bg-transparent px-3 text-sm text-[#111827] outline-none placeholder:text-[#6B7280]"
              />
              <ActionButton onClick={() => sendMessage()} className="rounded-xl px-3"><Send className="h-4 w-4" /></ActionButton>
            </div>
          </SurfaceCard>

          <div className="space-y-5">
            <SurfaceCard>
              <SectionTitle icon={Lightbulb} title={t("app.assistant.taskSuggestions")} description={t("app.assistant.taskSuggestionsDesc")} />
              <div className="space-y-2">
                {SUGGESTIONS.map((suggestion) => {
                  const label = t(`app.assistant.suggestions.${suggestion}`);
                  return (
                    <button key={suggestion} type="button" onClick={() => sendMessage(label)} className="flex w-full items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-3 text-left text-sm font-semibold text-[#111827] transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-sm">
                      <Wand2 className="h-4 w-4 text-indigo-600" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <SectionTitle icon={MessageSquare} title={t("app.assistant.modesTitle")} description={t("app.assistant.modesDesc")} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {MODES.map((mode) => (
                  <div key={mode} className="rounded-2xl bg-[#F7FAFC] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-[#111827]">{t(`app.assistant.modes.${mode}.title`)}</h3>
                      <Pill tone="indigo">{t("app.assistant.modeLabel")}</Pill>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#6B7280]">{t(`app.assistant.modes.${mode}.desc`)}</p>
                  </div>
                ))}
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <SectionTitle
                icon={CheckSquare}
                title={t("app.assistant.generatedTaskTitle", "Generated task preview")}
                description={t("app.assistant.generatedTaskDesc", "Backend-ready Smart Task shape generated locally from the selected AI agent.")}
              />
              <div className="rounded-[24px] border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-[#111827]">{previewTask.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#6B7280]">{previewTask.description}</p>
                  </div>
                  <Pill tone={previewTask.priority === "high" ? "red" : previewTask.priority === "medium" ? "amber" : "green"}>{previewTask.priority}</Pill>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Pill tone="indigo">{previewTask.assignee}</Pill>
                  <Pill tone="blue"><CalendarClock className="mr-1 h-3.5 w-3.5" /> {previewTask.dueDate}</Pill>
                </div>
                <ActionButton className="mt-4 w-full" onClick={() => setDrawerTaskId(previewTask.id)}>
                  <CheckSquare className="h-4 w-4" />
                  Open task preview
                </ActionButton>
              </div>
              <div className="mt-3 space-y-2">
                {AUTOMATION_RULES.slice(0, 2).map((rule) => (
                  <div key={rule.id} className="rounded-2xl bg-white p-3 text-xs font-semibold text-[#6B7280] ring-1 ring-[#E5E7EB]">
                    Suggested flow: <span className="font-black text-[#111827]">{rule.trigger}</span> {"->"} {rule.action}
                  </div>
                ))}
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <SectionTitle title={t("app.assistant.ideaGenerator")} description={t("app.assistant.ideaGeneratorDesc")} />
              <div className="space-y-3">
                {AI_IDEAS.map((idea, index) => {
                  const prompt = t(`app.assistant.ideas.${index}.prompt`, idea.prompt);
                  return (
                    <button key={idea.prompt} type="button" onClick={() => sendMessage(prompt)} className="w-full rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-3 text-left transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-sm">
                      <p className="text-sm font-semibold text-[#111827]">{prompt}</p>
                      <p className="mt-1 text-xs leading-5 text-[#6B7280]">{t(`app.assistant.ideas.${index}.output`, idea.output)}</p>
                    </button>
                  );
                })}
              </div>
            </SurfaceCard>
          </div>
        </div>

        <SurfaceCard>
          <SectionTitle title={t("app.assistant.learningPaths")} description={t("app.assistant.learningPathsDesc")} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {LEARNING_PATHS.map((path) => (
              <div key={path.id} className="rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-[#111827]">{t(`app.assistant.paths.${path.id}.title`, path.title)}</h3>
                  <Pill tone="blue">{t(`app.experience.${path.level.toLowerCase()}`, path.level)}</Pill>
                </div>
                <p className="mt-2 text-sm text-[#6B7280]">{t("app.assistant.modulesCount", { count: path.modules })}</p>
                <div className="mt-4 h-2 rounded-full bg-white">
                  <div className="h-full rounded-full bg-indigo-600" style={{ width: `${path.progress}%` }} />
                </div>
                <p className="mt-2 text-xs font-semibold text-[#6B7280]">{t("app.assistant.complete", { progress: path.progress })}</p>
              </div>
            ))}
          </div>
        </SurfaceCard>
        <TaskDrawer task={drawerTask} onClose={() => setDrawerTaskId(null)} onCreateTask={() => sendMessage("Create this generated Smart Task")} />
      </PageShell>
    </AppLayout>
  );
}

import { useMemo, useState } from "react";
import { Bot, CheckSquare, Edit3, Menu, Plus, Send, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/app/AppLayout";
import { ActionButton, PageShell, cn } from "@/components/app/DesignSystem";
import { AI_IDEAS, SMART_TASKS } from "@/data/ecosystemData";
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

export default function AssistantPage({ user, onLogout }: Props) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<AssistantMessage[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const recentThreads = useMemo(
    () => [
      t("app.assistant.messages.focusPlan"),
      SMART_TASKS[0]?.title ?? t("app.assistant.fallbackProjectPlanning"),
      AI_IDEAS[0]?.prompt ?? t("app.assistant.fallbackGenerateIdeas"),
      t("app.assistant.suggestions.learnNext"),
    ],
    [t],
  );

  const messageText = (message: AssistantMessage) => message.text ?? t(`app.assistant.messages.${message.textKey}`);

  const sendMessage = (text = draft) => {
    const cleanText = text.trim();
    if (!cleanText) return;
    setMessages((current) => [...current, { role: "user", text: cleanText }, { role: "assistant", textKey: "demoResponse" }]);
    setDraft("");
  };

  return (
    <AppLayout user={user} title={t("app.nav.assistant")} onLogout={onLogout}>
      <PageShell className="max-w-none pb-0">
        <div className="grid h-[calc(100vh-6.5rem)] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white lg:grid-cols-[280px_1fr]">
          <aside className={cn("border-r border-[#E5E7EB] bg-[#F7FAFC] p-3 lg:block", historyOpen ? "absolute inset-y-0 left-0 z-30 w-72" : "hidden")}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <button type="button" onClick={() => setMessages([{ role: "assistant", textKey: "welcome" }])} className="flex flex-1 items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#111827] ring-1 ring-[#E5E7EB]">
                <Plus className="h-4 w-4" />
                {t("app.assistant.newChat")}
              </button>
              <button type="button" onClick={() => setHistoryOpen(false)} className="rounded-xl p-2 text-[#6B7280] hover:bg-white lg:hidden" aria-label={t("app.assistant.closeHistory")}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-1">
              {recentThreads.map((thread) => (
                <button key={thread} type="button" onClick={() => setHistoryOpen(false)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#374151] hover:bg-white">
                  <Edit3 className="h-4 w-4 text-[#6B7280]" />
                  <span className="truncate">{thread}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-xl bg-white p-3 text-xs text-[#6B7280] ring-1 ring-[#E5E7EB]">
              <p className="font-bold text-[#111827]">{user.name}</p>
              <p className="mt-1 capitalize">{t("app.assistant.userWorkspace", { profession: t(`app.professions.${user.profession}`, user.profession) })}</p>
            </div>
          </aside>

          <main className="flex min-w-0 flex-col">
            <header className="flex h-14 items-center justify-between border-b border-[#E5E7EB] px-4">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setHistoryOpen(true)} className="rounded-xl p-2 text-[#6B7280] hover:bg-[#F7FAFC] lg:hidden" aria-label={t("app.assistant.openHistory")}>
                  <Menu className="h-5 w-5" />
                </button>
                <div>
                  <h1 className="text-sm font-bold text-[#111827]">{t("app.assistant.title")}</h1>
                  <p className="hidden text-xs text-[#6B7280] sm:block">{t("app.assistant.description")}</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
                <Sparkles className="h-3.5 w-3.5" />
                {t("app.topbar.online")}
              </span>
            </header>

            <div className="flex-1 overflow-y-auto bg-white px-4 py-6">
              <div className="mx-auto flex max-w-3xl flex-col gap-6">
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={cn("flex gap-3", message.role === "user" && "justify-end")}>
                    {message.role === "assistant" && (
                      <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[#111827] text-white">
                        <Bot className="h-4 w-4" />
                      </span>
                    )}
                    <div className={cn("max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6", message.role === "user" ? "bg-indigo-600 text-white" : "bg-[#F7FAFC] text-[#111827]")}>
                      {messageText(message)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <footer className="border-t border-[#E5E7EB] bg-white p-4">
              <div className="mx-auto max-w-3xl">
                <div className="mb-3 flex gap-2 overflow-x-auto">
                  {SUGGESTIONS.map((suggestion) => {
                    const label = t(`app.assistant.suggestions.${suggestion}`);
                    return (
                      <button key={suggestion} type="button" onClick={() => sendMessage(label)} className="inline-flex min-w-fit items-center gap-2 rounded-full border border-[#E5E7EB] bg-[#F7FAFC] px-3 py-1.5 text-xs font-semibold text-[#374151] hover:bg-white">
                        <CheckSquare className="h-3.5 w-3.5 text-indigo-600" />
                        {label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-end gap-2 rounded-2xl border border-[#D1D5DB] bg-white p-2 focus-within:border-indigo-400">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder={t("app.assistant.inputPlaceholder")}
                    rows={1}
                    className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-sm text-[#111827] outline-none placeholder:text-[#6B7280]"
                  />
                  <ActionButton onClick={() => sendMessage()} className="h-10 w-10 rounded-xl px-0" aria-label={t("app.assistant.sendMessage")}>
                    <Send className="h-4 w-4" />
                  </ActionButton>
                </div>
                <p className="mt-2 text-center text-xs text-[#9CA3AF]">{t("app.assistant.disclaimer")}</p>
              </div>
            </footer>
          </main>
        </div>
      </PageShell>
    </AppLayout>
  );
}

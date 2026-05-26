'use client';

'use client';

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { User, Bell, Plug, Github, Send, Instagram, Youtube, HardDrive, Mail, Calendar, BookOpen, CheckCircle2, XCircle, Settings2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/app/AppLayout";
import { ActionButton, Pill, ProgressBar, SectionTitle, SurfaceCard } from "@/components/app/DesignSystem";
import { AutomationRuleCard, ViewSwitcher } from "@/components/app/PowerWorkspaceSystem";
import { AUTOMATION_RULES, POWER_VIEWS, WORKSPACE_SETTINGS } from "@/data/ecosystemData";
import type { TaskView, UserProfile } from "@/types";
import { storage } from "@/utils/storage";



const INTEGRATIONS = [
  { id: "github", name: "GitHub", icon: <Github className="h-5 w-5" />, iconBg: "bg-gray-800", iconColor: "text-gray-200" },
  { id: "telegram", name: "Telegram", icon: <Send className="h-5 w-5" />, iconBg: "bg-sky-100 dark:bg-sky-900/40", iconColor: "text-sky-600 dark:text-sky-400" },
  { id: "instagram", name: "Instagram", icon: <Instagram className="h-5 w-5" />, iconBg: "bg-pink-100 dark:bg-pink-900/40", iconColor: "text-pink-600 dark:text-pink-400" },
  { id: "youtube", name: "YouTube", icon: <Youtube className="h-5 w-5" />, iconBg: "bg-red-100 dark:bg-red-900/40", iconColor: "text-red-600 dark:text-red-400" },
  { id: "gdrive", name: "Google Drive", icon: <HardDrive className="h-5 w-5" />, iconBg: "bg-green-100 dark:bg-green-900/40", iconColor: "text-green-600 dark:text-green-400" },
  { id: "mail", name: "Mail", icon: <Mail className="h-5 w-5" />, iconBg: "bg-blue-100 dark:bg-blue-900/40", iconColor: "text-blue-600 dark:text-blue-400" },
  { id: "calendar", name: "Calendar", icon: <Calendar className="h-5 w-5" />, iconBg: "bg-emerald-100 dark:bg-emerald-900/40", iconColor: "text-emerald-600 dark:text-emerald-400" },
  { id: "class", name: "Class", icon: <BookOpen className="h-5 w-5" />, iconBg: "bg-amber-100 dark:bg-amber-900/40", iconColor: "text-amber-600 dark:text-amber-400" },
];

const TABS = [
  { id: "account", icon: User },
  { id: "notifications", icon: Bell },
  { id: "integrations", icon: Plug },
  { id: "workspace", icon: Settings2 },
] as const;

const NOTIFICATION_KEYS = ["email", "push", "taskReminders", "chatMessages", "weeklyReport", "productUpdates"] as const;

import { useAuth } from "@/hooks/useAuth";

export default function Page() {
  const { user, logout: onLogout } = useAuth();
  const { t } = useTranslation();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("account");
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [workspaceView, setWorkspaceView] = useState<TaskView>(() => storage.getActiveView() ?? "list");
  const [notifs, setNotifs] = useState({
    email: true,
    push: true,
    taskReminders: true,
    chatMessages: true,
    weeklyReport: false,
    productUpdates: true,
  });

  useEffect(() => {
    const saved = storage.getIntegrations();
    setConnected(saved ?? {});
  }, []);

  const toggleIntegration = (id: string) => {
    const updated = { ...connected, [id]: !connected[id] };
    setConnected(updated);
    storage.saveIntegrations(updated);
  };

  const changeWorkspaceView = (view: TaskView) => {
    setWorkspaceView(view);
    storage.saveActiveView(view);
  };

  return (
    <AppLayout user={user} title={t("app.nav.settings")} onLogout={onLogout}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex w-fit gap-1 rounded-xl bg-white p-1 dark:bg-gray-800">
          {TABS.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={[
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                tab === item.id
                  ? "bg-indigo-600 text-white"
                  : "bg-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
              ].join(" ")}
            >
              <item.icon className="h-3.5 w-3.5" />
              {t(`app.settings.tabs.${item.id}`, item.id === "workspace" ? "Workspace" : item.id)}
            </button>
          ))}
        </div>

        {tab === "account" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t("app.settings.accountInfo")}</h3>

              {[
                { label: t("app.settings.displayName"), value: user.name, type: "text" },
                { label: t("app.settings.email"), value: "user@example.com", type: "email" },
                { label: t("app.settings.username"), value: `@${user.name.toLowerCase().replace(/\s+/g, "_")}`, type: "text" },
              ].map((field) => (
                <div key={field.label}>
                  <label className="mb-1.5 block text-xs text-gray-500 dark:text-gray-400">{field.label}</label>
                  <input
                    type={field.type}
                    defaultValue={field.value}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-indigo-400 focus:bg-white dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:focus:border-indigo-500 dark:focus:bg-gray-600"
                  />
                </div>
              ))}

              <div>
                <label className="mb-1.5 block text-xs text-gray-500 dark:text-gray-400">{t("app.settings.profession")}</label>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  {t(`app.professions.${user.profession}`, user.profession)}
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{t("app.settings.changeOnboarding")}</span>
                </div>
              </div>

              <button className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500">
                {t("app.settings.saveChanges")}
              </button>
            </div>

            <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t("app.settings.dangerZone")}</h3>
              <div className="flex items-center justify-between rounded-xl border border-red-200/70 bg-red-50/70 p-4 dark:border-red-900/40 dark:bg-red-950/20">
                <div>
                  <p className="text-sm font-medium text-red-500">{t("app.settings.deleteAccount")}</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t("app.settings.deleteAccountDesc")}</p>
                </div>
                <button className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-200 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60">
                  {t("app.settings.delete")}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {tab === "notifications" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t("app.settings.notificationPrefs")}</h3>
              {NOTIFICATION_KEYS.map((key) => {
                const val = notifs[key];
                return (
                  <div key={key} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t(`app.settings.notifications.${key}.label`)}</p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t(`app.settings.notifications.${key}.desc`)}</p>
                    </div>
                    <button
                      onClick={() => setNotifs((state) => ({ ...state, [key]: !state[key] }))}
                      className={[
                        "relative h-6 w-11 flex-shrink-0 rounded-full transition-colors",
                        val ? "bg-indigo-500" : "bg-gray-300 dark:bg-gray-600",
                      ].join(" ")}
                    >
                      <div
                        className="absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all"
                        style={{ left: val ? "calc(100% - 20px)" : 4 }}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {tab === "integrations" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("app.settings.integrationsIntro")}</p>
            {INTEGRATIONS.map((intg, index) => {
              const isConnected = connected[intg.id] ?? false;
              return (
                <motion.div
                  key={intg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className={["flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl", intg.iconBg, intg.iconColor].join(" ")}>
                    {intg.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{intg.name}</p>
                      {isConnected && (
                        <span className="flex items-center gap-1 text-xs text-emerald-500">
                          <CheckCircle2 className="h-3 w-3" /> {t("app.status.connected")}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{t(`app.settings.integrations.${intg.id}`, intg.id)}</p>
                  </div>
                  <motion.button
                    onClick={() => toggleIntegration(intg.id)}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    className={[
                      "flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                      isConnected
                        ? "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
                        : "border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:border-indigo-800/50 dark:bg-indigo-950/30 dark:text-indigo-400 dark:hover:bg-indigo-950/50",
                    ].join(" ")}
                  >
                    {isConnected
                      ? <span className="flex items-center gap-1"><XCircle className="h-3 w-3" /> {t("app.settings.disconnect")}</span>
                      : t("app.settings.connect")}
                  </motion.button>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {tab === "workspace" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <SurfaceCard>
              <SectionTitle
                icon={SlidersHorizontal}
                title={t("app.settings.workspaceTitle", "Workspace operating system")}
                description={t("app.settings.workspaceDesc", "Configure statuses, custom fields, templates, permissions, saved views, and compact design density for UPZ power users.")}
              />
              <div className="grid gap-3 md:grid-cols-2">
                {WORKSPACE_SETTINGS.map((setting) => (
                  <div key={setting.id} className="rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-black text-[#111827]">{setting.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-[#6B7280]">{setting.value}</p>
                      </div>
                      <Pill tone="indigo">Demo</Pill>
                    </div>
                  </div>
                ))}
              </div>
            </SurfaceCard>

            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <SurfaceCard>
                <SectionTitle icon={Settings2} title="Saved default view" description="Persists the workspace view preference locally for this demo." />
                <ViewSwitcher views={POWER_VIEWS} value={workspaceView} onChange={changeWorkspaceView} />
                <div className="mt-5 rounded-[24px] bg-[#F7FAFC] p-4 ring-1 ring-[#E5E7EB]">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-black text-[#111827]">Density and layout</p>
                    <Pill tone="blue">Compact</Pill>
                  </div>
                  <ProgressBar value={82} label="Power-user readiness" />
                  <div className="mt-4 grid gap-2 text-sm font-semibold text-[#6B7280]">
                    <span className="rounded-2xl bg-white px-3 py-2 ring-1 ring-[#E5E7EB]">Tables collapse into cards on mobile</span>
                    <span className="rounded-2xl bg-white px-3 py-2 ring-1 ring-[#E5E7EB]">Task drawer becomes full-screen sheet</span>
                    <span className="rounded-2xl bg-white px-3 py-2 ring-1 ring-[#E5E7EB]">Filters and views are localStorage-ready</span>
                  </div>
                </div>
              </SurfaceCard>

              <SurfaceCard>
                <SectionTitle icon={ShieldCheck} title="Permissions and Flow Automations" description="Role-ready settings and automation rules prepared for future backend integration." />
                <div className="grid gap-3 md:grid-cols-2">
                  {["Admin can create spaces", "Members can manage assigned tasks", "Guests can comment only", "Moderators can review community posts"].map((rule) => (
                    <div key={rule} className="rounded-2xl bg-[#F7FAFC] p-3 text-sm font-semibold text-[#111827] ring-1 ring-[#E5E7EB]">
                      {rule}
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-3">
                  {AUTOMATION_RULES.slice(0, 2).map((rule) => (
                    <AutomationRuleCard key={rule.id} rule={rule} />
                  ))}
                </div>
                <ActionButton className="mt-4 w-full">Create workspace template</ActionButton>
              </SurfaceCard>
            </div>
          </motion.div>
        )}
      </div>
    </AppLayout>
  );
}

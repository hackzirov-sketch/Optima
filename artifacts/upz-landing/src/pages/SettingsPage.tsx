import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, User, Bell, Plug, Github, Send, Instagram, Youtube, HardDrive, Mail, Calendar, BookOpen, CheckCircle2, XCircle, Settings2, ShieldCheck, SlidersHorizontal, MoreVertical, Pencil, AtSign, Cake, Camera, Image, Phone, Shield, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/app/AppLayout";
import { ActionButton, Pill, ProgressBar, SectionTitle, SurfaceCard } from "@/components/app/DesignSystem";
import { AutomationRuleCard, ViewSwitcher } from "@/components/app/PowerWorkspaceSystem";
import { AUTOMATION_RULES, POWER_VIEWS, WORKSPACE_SETTINGS } from "@/data/ecosystemData";
import type { TaskView, UserProfile } from "@/types";
import { storage } from "@/utils/storage";

interface Props { user: UserProfile; onLogout: () => void; }

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
const settingRowClass = "flex w-full items-center gap-4 px-4 py-3.5 text-left text-[#17212B] transition-colors hover:bg-[#F2F4F7] dark:text-gray-100 dark:hover:bg-white/10";

export default function SettingsPage({ user, onLogout }: Props) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("account");
  const [menuOpen, setMenuOpen] = useState(false);
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

  const username = user.username ?? `@${user.name.toLowerCase().replace(/\s+/g, "_")}`;
  const email = user.email ?? "user@example.com";
  const phone = user.phone ?? "+998 90 914 43 30";

  return (
    <AppLayout user={user} title={t("app.nav.settings")} onLogout={onLogout}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 overflow-hidden rounded-[24px] bg-[#202124] text-white shadow-lg shadow-black/10">
          <div className="relative flex h-14 items-center gap-2 px-3">
            <button
              type="button"
              onClick={() => navigate("/app/home")}
              className="grid h-10 w-10 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Back to home"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="min-w-0 flex-1 truncate text-base font-bold">Settings</h2>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Edit profile"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              className="grid h-10 w-10 place-items-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Open settings menu"
              aria-expanded={menuOpen}
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            {menuOpen && (
              <div className="absolute right-3 top-12 z-30 w-52 overflow-hidden rounded-2xl bg-[#2A2B2D] py-1.5 text-sm font-semibold text-white shadow-2xl shadow-black/25 ring-1 ring-white/10">
                <button type="button" className="flex w-full px-4 py-2.5 text-left text-white hover:bg-white/10">Edit name</button>
                <button type="button" className="flex w-full px-4 py-2.5 text-left text-white hover:bg-white/10">Set username</button>
                <button type="button" className="flex w-full px-4 py-2.5 text-left text-white hover:bg-white/10">Log out</button>
              </div>
            )}
          </div>
          <div className="flex flex-col items-center px-4 pb-6 pt-1">
            <div className="grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-rose-400 text-4xl font-bold">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="mt-3 text-center">
              <p className="text-base font-bold">{user.name}</p>
              <p className="text-xs text-white/55">online</p>
            </div>
          </div>
        </div>

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
            <div className="overflow-hidden rounded-[24px] bg-white shadow-sm ring-1 ring-[#E5E7EB] dark:bg-gray-900 dark:ring-gray-700">
              <button type="button" className={settingRowClass}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#EEF4F8] text-[#168ACD] dark:bg-gray-800">
                  <Camera className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[#17212B] dark:text-gray-100">Profile avatar</span>
                  <span className="block truncate text-xs text-[#7C8B96]">Change your public avatar</span>
                </span>
              </button>
              <button type="button" className={settingRowClass}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#EEF4F8] text-[#168ACD] dark:bg-gray-800">
                  <UserRound className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[#17212B] dark:text-gray-100">{user.name}</span>
                  <span className="block truncate text-xs text-[#7C8B96]">Name</span>
                </span>
              </button>
              <button type="button" className={settingRowClass}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#EEF4F8] text-[#168ACD] dark:bg-gray-800">
                  <AtSign className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[#17212B] dark:text-gray-100">{username}</span>
                  <span className="block truncate text-xs text-[#7C8B96]">Username</span>
                </span>
              </button>
              <button type="button" className={settingRowClass}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#EEF4F8] text-[#168ACD] dark:bg-gray-800">
                  <Mail className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[#17212B] dark:text-gray-100">{email}</span>
                  <span className="block truncate text-xs text-[#7C8B96]">Email</span>
                </span>
              </button>
              <button type="button" className={settingRowClass}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#EEF4F8] text-[#168ACD] dark:bg-gray-800">
                  <Phone className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[#17212B] dark:text-gray-100">{phone}</span>
                  <span className="block truncate text-xs text-[#7C8B96]">Phone</span>
                </span>
              </button>
              <button type="button" className={settingRowClass}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#EEF4F8] text-[#168ACD] dark:bg-gray-800">
                  <Cake className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[#17212B] dark:text-gray-100">Add birthday</span>
                  <span className="block truncate text-xs text-[#7C8B96]">Birthday</span>
                </span>
              </button>
              <button type="button" className={settingRowClass}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#EEF4F8] text-[#168ACD] dark:bg-gray-800">
                  <Image className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[#17212B] dark:text-gray-100">My stories</span>
                  <span className="block truncate text-xs text-[#7C8B96]">Story privacy and archive</span>
                </span>
              </button>
              <button type="button" className={settingRowClass}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#EEF4F8] text-[#168ACD] dark:bg-gray-800">
                  <Shield className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[#17212B] dark:text-gray-100">Privacy and Security</span>
                  <span className="block truncate text-xs text-[#7C8B96]">Sessions, password, blocked users</span>
                </span>
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
                description={t("app.settings.workspaceDesc", "Configure statuses, custom fields, templates, permissions, saved views, and compact design density for Optima power users.")}
              />
              <div className="grid gap-3 md:grid-cols-2">
                {WORKSPACE_SETTINGS.map((setting) => (
                  <div key={setting.id} className="rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-black text-[#111827] dark:text-gray-100">{setting.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-[#6B7280] dark:text-gray-400">{setting.value}</p>
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
                    <p className="text-sm font-black text-[#111827] dark:text-gray-100">Density and layout</p>
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
                    <div key={rule} className="rounded-2xl bg-[#F7FAFC] p-3 text-sm font-semibold text-[#111827] ring-1 ring-[#E5E7EB] dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-700">
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

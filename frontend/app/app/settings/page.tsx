'use client';

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { User, Bell, Plug, Github, Send, Instagram, Youtube, HardDrive, Mail, Calendar, BookOpen, CheckCircle2, XCircle, Settings2, ShieldCheck, SlidersHorizontal, Monitor, Loader2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { ActionButton, Pill, ProgressBar, SectionTitle, SurfaceCard, Modal } from "@/components/app/DesignSystem";
import { AutomationRuleCard, ViewSwitcher } from "@/components/app/PowerWorkspaceSystem";
import { usersApi, authApi, type ApiUser, type ApiUserSettings, type ApiSession } from "@/lib/api";
import { AUTOMATION_RULES, POWER_VIEWS, WORKSPACE_SETTINGS } from "@/data/ecosystemData";
import type { TaskView } from "@/types";
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
  { id: "sessions", icon: Monitor },
  { id: "notifications", icon: Bell },
  { id: "integrations", icon: Plug },
  { id: "workspace", icon: Settings2 },
] as const;

// Frontend label → backend field mapping
const NOTIF_FIELDS: {
  key: keyof ApiUserSettings;
  label: string;
  desc: string;
}[] = [
  { key: 'notificationsEnabled', label: 'All notifications', desc: 'Master switch for all notifications' },
  { key: 'emailNotifications',   label: 'Email notifications', desc: 'Receive updates via email' },
  { key: 'pushNotifications',    label: 'Push notifications', desc: 'Browser and mobile push alerts' },
  { key: 'notifyTaskAssigned',   label: 'Task reminders', desc: 'When a task is assigned or updated' },
  { key: 'notifyMentions',       label: 'Chat messages', desc: 'When someone mentions you in chat' },
  { key: 'notifyPushReviewed',   label: 'Push reviews', desc: 'When your code push is reviewed' },
  { key: 'notifyPrEvents',       label: 'PR events', desc: 'Pull request opened, merged or closed' },
];

export default function Page() {
  const { user, logout: onLogout } = useAuth();
  const { t } = useTranslation();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("account");

  // ── Real user state ──────────────────────────────────────────────────────
  const [backendUser, setBackendUser] = useState<ApiUser | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [usernameVal, setUsernameVal] = useState("");
  const [emailVal, setEmailVal] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    usersApi.getMe()
      .then((res) => {
        const u = res?.data;
        if (u) {
          setBackendUser(u);
          setFirstName(u.firstName ?? "");
          setLastName(u.lastName ?? "");
          setUsernameVal(u.username ?? "");
          setEmailVal(u.email ?? "");
          // Load notification settings from user.settings
          if (u.settings) {
            setNotifSettings(u.settings);
          }
        }
      })
      .catch(() => {
        if (user) {
          const parts = user.name.split(' ');
          setFirstName(parts[0] ?? "");
          setLastName(parts.slice(1).join(' '));
          setUsernameVal(user.username ?? "");
          setEmailVal(user.email ?? "");
        }
      })
      .finally(() => {
        setUserLoading(false);
        setNotifLoading(false);
      });
  }, []);

  const handleSaveChanges = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const res = await usersApi.updateMe({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: usernameVal.trim() || undefined,
      });
      if (res?.data) setBackendUser(res.data);
      // Keep localStorage in sync
      if (user) storage.saveUser({ ...user, name: `${firstName} ${lastName}`.trim(), username: usernameVal });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError("Failed to save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Sessions state ───────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "sessions") return;
    setSessionsLoading(true);
    authApi.getSessions()
      .then((res) => setSessions(res?.data ?? []))
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  }, [tab]);

  const revokeSession = async (id: string) => {
    setRevokingId(id);
    try {
      await authApi.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch { /* ignore */ }
    finally { setRevokingId(null); }
  };

  const revokeAll = async () => {
    setRevokingId("all");
    try {
      await authApi.deleteAllSessions();
      setSessions([]);
    } catch { /* ignore */ }
    finally { setRevokingId(null); }
  };

  // ── Notification settings (from backend) ─────────────────────────────────
  const [notifSettings, setNotifSettings] = useState<ApiUserSettings>({
    notificationsEnabled: true,
    emailNotifications: true,
    pushNotifications: true,
    notifyTaskAssigned: true,
    notifyMentions: true,
    notifyPushReviewed: true,
    notifyPrEvents: true,
  });
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifSaving, setNotifSaving] = useState<keyof ApiUserSettings | null>(null);

  // ── Other local state ────────────────────────────────────────────────────
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [workspaceView, setWorkspaceView] = useState<TaskView>(() => storage.getActiveView() ?? "list");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const toggleNotif = async (key: keyof ApiUserSettings) => {
    const newVal = !notifSettings[key];
    setNotifSettings((prev) => ({ ...prev, [key]: newVal }));
    setNotifSaving(key);
    try {
      const res = await usersApi.updateSettings({ [key]: newVal });
      if (res?.data) setNotifSettings(res.data);
    } catch {
      // Revert on failure
      setNotifSettings((prev) => ({ ...prev, [key]: !newVal }));
    } finally {
      setNotifSaving(null);
    }
  };

  useEffect(() => {
    setConnected(storage.getIntegrations() ?? {});
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

  const inputCls = "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-indigo-400 focus:bg-card dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:focus:border-indigo-500 dark:focus:bg-gray-600";

  return (
    <div className="mx-auto max-w-5xl">
      {/* Tab bar */}
      <div className="mb-6 flex w-fit flex-wrap gap-1 rounded-xl bg-card p-1 dark:bg-gray-800">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={[
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
              tab === item.id ? "bg-indigo-600 text-white" : "bg-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
            ].join(" ")}
          >
            <item.icon className="h-3.5 w-3.5" />
            {t(`app.settings.tabs.${item.id}`, item.id)}
          </button>
        ))}
      </div>

      {/* Account tab */}
      {tab === "account" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="space-y-5 rounded-xl border border-gray-200 bg-card p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t("app.settings.accountInfo")}</h3>

            {userLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading account info…
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs text-gray-500 dark:text-gray-400">First name</label>
                    <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-gray-500 dark:text-gray-400">Last name</label>
                    <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs text-gray-500 dark:text-gray-400">{t("app.settings.username")}</label>
                  <div className="flex items-center">
                    <span className="flex h-[42px] items-center rounded-l-xl border border-r-0 border-gray-200 bg-gray-100 px-3 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-700">@</span>
                    <input
                      type="text"
                      value={usernameVal}
                      onChange={(e) => setUsernameVal(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                      className={`${inputCls} rounded-l-none`}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs text-gray-500 dark:text-gray-400">{t("app.settings.email")}</label>
                  <input type="email" value={emailVal} disabled className={`${inputCls} cursor-not-allowed opacity-60`} />
                  <p className="mt-1 text-xs text-muted-foreground">Email cannot be changed here.</p>
                </div>

                {saveError && (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
                    {saveError}
                  </p>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSaveChanges}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t("app.settings.saveChanges")}
                  </button>
                  {saved && (
                    <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" /> Saved
                    </motion.span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Danger zone */}
          <div className="space-y-4 rounded-xl border border-gray-200 bg-card p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t("app.settings.dangerZone")}</h3>
            <div className="flex items-center justify-between rounded-xl border border-red-200/70 bg-red-50/70 p-4 dark:border-red-900/40 dark:bg-red-950/20">
              <div>
                <p className="text-sm font-medium text-red-500">{t("app.settings.deleteAccount")}</p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t("app.settings.deleteAccountDesc")}</p>
              </div>
              <button
                onClick={() => setDeleteConfirmOpen(true)}
                className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-200 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60"
              >
                {t("app.settings.delete")}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Sessions tab */}
      {tab === "sessions" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-card p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Active sessions</h3>
              {sessions.length > 1 && (
                <button
                  onClick={revokeAll}
                  disabled={revokingId === 'all'}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400"
                >
                  {revokingId === 'all' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Revoke all
                </button>
              )}
            </div>

            {sessionsLoading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading sessions…
              </div>
            ) : sessions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No active sessions found.</p>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/40">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40">
                        <Monitor className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {session.deviceName ?? [session.browser, session.os].filter(Boolean).join(' · ') ?? 'Unknown device'}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {[session.ipAddress, session.provider].filter(Boolean).join(' · ')}
                          {session.lastUsedAt && ` · Last used ${new Date(session.lastUsedAt).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => revokeSession(session.id)}
                      disabled={revokingId === session.id}
                      className="flex-shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400"
                    >
                      {revokingId === session.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Revoke'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Notifications tab */}
      {tab === "notifications" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="space-y-5 rounded-xl border border-gray-200 bg-card p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t("app.settings.notificationPrefs")}</h3>

            {notifLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading preferences…
              </div>
            ) : (
              NOTIF_FIELDS.map(({ key, label, desc }) => {
                const val = notifSettings[key];
                const isSaving = notifSaving === key;
                return (
                  <div key={key} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{desc}</p>
                    </div>
                    <button
                      onClick={() => toggleNotif(key)}
                      disabled={isSaving}
                      className={[
                        "relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-60",
                        val ? "bg-indigo-500" : "bg-gray-300 dark:bg-gray-600",
                      ].join(" ")}
                    >
                      {isSaving ? (
                        <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-white" />
                      ) : (
                        <div
                          className="absolute top-1 h-4 w-4 rounded-full bg-card shadow transition-all"
                          style={{ left: val ? "calc(100% - 20px)" : 4 }}
                        />
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      )}

      {/* Integrations tab */}
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
                className="flex items-center gap-4 rounded-xl border border-gray-200 bg-card p-4 dark:border-gray-700 dark:bg-gray-800"
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
                <button
                  onClick={() => toggleIntegration(intg.id)}
                  className={[
                    "flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                    isConnected
                      ? "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400"
                      : "border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:border-indigo-800/50 dark:bg-indigo-950/30 dark:text-indigo-400",
                  ].join(" ")}
                >
                  {isConnected
                    ? <span className="flex items-center gap-1"><XCircle className="h-3 w-3" /> {t("app.settings.disconnect")}</span>
                    : t("app.settings.connect")}
                </button>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Workspace tab */}
      {tab === "workspace" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <SurfaceCard>
            <SectionTitle icon={SlidersHorizontal} title="Workspace settings" description="Configure statuses, custom fields, templates and permissions." />
            <div className="grid gap-3 md:grid-cols-2">
              {WORKSPACE_SETTINGS.map((setting) => (
                <div key={setting.id} className="rounded-2xl border border-border bg-muted p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black text-foreground">{setting.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{setting.value}</p>
                    </div>
                    <Pill tone="indigo">Demo</Pill>
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <SurfaceCard>
              <SectionTitle icon={Settings2} title="Saved default view" description="Persists the workspace view preference locally." />
              <ViewSwitcher views={POWER_VIEWS} value={workspaceView} onChange={changeWorkspaceView} />
            </SurfaceCard>

            <SurfaceCard>
              <SectionTitle icon={ShieldCheck} title="Permissions" description="Role-ready settings prepared for backend integration." />
              <div className="grid gap-3 md:grid-cols-2">
                {["Admin can create spaces", "Members can manage assigned tasks", "Guests can comment only", "Moderators can review community posts"].map((rule) => (
                  <div key={rule} className="rounded-2xl bg-muted p-3 text-sm font-semibold text-foreground ring-1 ring-[#E5E7EB]">
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

      {/* Delete account modal */}
      <Modal
        open={deleteConfirmOpen}
        title={t("app.settings.deleteAccount")}
        description={t("app.settings.deleteAccountDesc")}
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <div className="space-y-4">
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-500/10 dark:text-rose-400">
            This action is permanent and cannot be undone. All your data will be deleted.
          </p>
          <div className="flex justify-end gap-3">
            <ActionButton variant="secondary" onClick={() => setDeleteConfirmOpen(false)}>Cancel</ActionButton>
            <ActionButton variant="danger" onClick={() => { setDeleteConfirmOpen(false); onLogout(); }}>
              Delete account
            </ActionButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}

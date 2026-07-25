import { Bell, BellRing, Camera, Check, ChevronRight, Copy, Globe2, Laptop, Link2, LoaderCircle, LogOut, Mail, MapPin, Save, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Avatar, Button, PageHeader, Skeleton } from "../components/ui";
import { useToast } from "../components/Toast";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";

interface SessionInfo {
  id: string;
  deviceName?: string | null;
  deviceType?: string | null;
  browser?: string | null;
  os?: string | null;
  ipAddress?: string | null;
  lastUsedAt?: string;
  createdAt: string;
}

const occupationValues = ["developer", "designer", "freelancer", "project_manager", "qa_engineer", "devops_engineer", "product_manager", "student", "other"];

const localeTag: Record<string, string> = { uz: "uz-UZ", ru: "ru-RU", en: "en-US", tr: "tr-TR" };

export function ProfilePage() {
  const { user, workspace, refreshUser, logout } = useAuth();
  const { show } = useToast();
  const { t, locale } = useI18n();
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [settingsSection, setSettingsSection] = useState<"profile" | "notifications" | "sessions">("profile");
  const [revokingAll, setRevokingAll] = useState(false);
  const [notifications, setNotifications] = useState({
    notificationsEnabled: user?.notificationsEnabled ?? true,
    emailNotifications: user?.emailNotifications ?? true,
    pushNotifications: user?.pushNotifications ?? true,
    notifyMentions: user?.notifyMentions ?? true,
  });

  function sessionDate(value?: string) {
    if (!value) return t("common.unknown");
    return new Intl.DateTimeFormat(localeTag[locale] || "uz-UZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  useEffect(() => {
    api.auth.sessions().then(setSessions).catch(() => setSessions([])).finally(() => setSessionsLoading(false));
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const data = new FormData(event.currentTarget);
    const phone = String(data.get("phoneNumber") || "").replace(/\D/g, "");
    try {
      await api.users.update({
        firstName: String(data.get("firstName") || "").trim(),
        lastName: String(data.get("lastName") || "").trim(),
        username: String(data.get("username") || "").trim() || null,
        occupation: String(data.get("occupation") || "other"),
        language: String(data.get("language") || "uz") as "uz" | "ru" | "en",
        timezone: String(data.get("timezone") || "Asia/Tashkent"),
        ...(phone ? { phoneNumber: Number(phone) } : {}),
      });
      await refreshUser();
      show(t("profile.profileSaved"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("profile.profileSaveFailed"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function copyProfileValue(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      show(success);
    } catch {
      show(t("profile.copyFailed"), "error");
    }
  }

  const profilePath = user?.username ? `/u/${user.username}` : `/user/${user?.publicId || ""}`;

  async function uploadAvatar(file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      show(t("profile.imageTooLarge"), "error");
      return;
    }
    setUploadingAvatar(true);
    try {
      await api.users.uploadAvatar(file);
      await refreshUser();
      show(t("profile.avatarUpdated"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("profile.avatarUploadFailed"), "error");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function toggleNotification(key: keyof typeof notifications) {
    const next = { ...notifications, [key]: !notifications[key] };
    setNotifications(next);
    try {
      await api.users.settings({ [key]: next[key] });
      await refreshUser();
    } catch (error) {
      setNotifications(notifications);
      show(error instanceof Error ? error.message : t("profile.settingNotSaved"), "error");
    }
  }

  async function revoke(id: string) {
    try {
      await api.auth.revokeSession(id);
      setSessions((current) => current.filter((entry) => entry.id !== id));
      show(t("profile.sessionClosed"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("profile.sessionCloseFailed"), "error");
    }
  }

  async function revokeOtherSessions() {
    if (!window.confirm(t("profile.confirmCloseOthers"))) return;
    setRevokingAll(true);
    try {
      await Promise.all(sessions.slice(1).map((entry) => api.auth.revokeSession(entry.id)));
      setSessions((current) => current.slice(0, 1));
      show(t("profile.otherSessionsClosed"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("profile.otherSessionsCloseFailed"), "error");
    } finally {
      setRevokingAll(false);
    }
  }

  return (
    <div className="page profile-page">
      <PageHeader eyebrow={workspace?.name} title={t("profile.pageTitle")} description={t("profile.pageDescription")} />
      <div className="profile-layout">
        <aside className="profile-summary panel">
          <div className="profile-cover"><span>{workspace?.name}</span></div>
          <div className="profile-avatar-wrap">
            <Avatar firstName={user?.firstName} lastName={user?.lastName} url={user?.avatarUrl} size="xl" />
            <span className="presence-badge" />
            <label className={`avatar-edit-trigger ${uploadingAvatar ? "is-loading" : ""}`} aria-label={t("profile.changePhoto")} title={t("profile.changePhoto")} aria-busy={uploadingAvatar}>
              {uploadingAvatar ? <LoaderCircle className="spin" size={15} /> : <Camera size={15} />}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label={t("profile.selectPhotoAria")} disabled={uploadingAvatar} onChange={(event) => { void uploadAvatar(event.target.files?.[0]); event.currentTarget.value = ""; }} />
            </label>
          </div>
          <h2>{user?.firstName} {user?.lastName}</h2>
          <p>{user?.username ? `@${user.username}` : t("profile.usernameNotSet")}</p>
          <div className="public-id-block"><span>ID: <strong>{user?.publicId}</strong></span><button className="icon-button" onClick={() => user?.publicId && void copyProfileValue(user.publicId, t("profile.userIdCopied"))} aria-label={t("profile.copyUserId")}><Copy size={16} /></button><button className="icon-button" onClick={() => void copyProfileValue(new URL(profilePath, window.location.origin).toString(), t("profile.profileLinkCopied"))} aria-label={t("profile.copyProfileLink")}><Link2 size={16} /></button></div>
          <span className="role-badge">{user?.occupation ? t(`common.occupations.${user.occupation}`) : t("profile.teamMember")}</span>
          <dl className="profile-meta"><div><Mail size={16} /><span><small>{t("profile.email")}</small><strong>{user?.email}</strong></span></div><div><MapPin size={16} /><span><small>{t("profile.timezone")}</small><strong>{user?.timezone || "Asia/Tashkent"}</strong></span></div><div><ShieldCheck size={16} /><span><small>{t("profile.account")}</small><strong>{t("profile.verified")}</strong></span></div></dl>
          <Button variant="secondary" onClick={() => void logout()} icon={<LogOut size={17} />}>{t("profile.logoutButton")}</Button>
        </aside>

        <div className="settings-stack">
          <nav className="settings-tabs" aria-label={t("profile.sectionsAria")}>
            <button className={settingsSection === "profile" ? "active" : ""} onClick={() => setSettingsSection("profile")}><UserRound size={18} /><span><strong>{t("profile.tabProfile")}</strong><small>{t("profile.tabProfileHint")}</small></span></button>
            <button className={settingsSection === "notifications" ? "active" : ""} onClick={() => setSettingsSection("notifications")}><BellRing size={18} /><span><strong>{t("profile.tabNotifications")}</strong><small>{t("profile.tabNotificationsHint")}</small></span></button>
            <button className={settingsSection === "sessions" ? "active" : ""} onClick={() => setSettingsSection("sessions")}><ShieldCheck size={18} /><span><strong>{t("profile.tabSessions")}</strong><small>{t("profile.tabSessionsHint")}</small></span></button>
          </nav>
          {settingsSection === "profile" && <section className="panel settings-panel settings-section-enter">
            <header className="settings-header"><span><UserRound size={20} /></span><div><h2>{t("profile.personalInfoTitle")}</h2><p>{t("profile.personalInfoDesc")}</p></div></header>
            <form className="settings-form" onSubmit={saveProfile}>
              <div className="form-grid-2"><label>{t("profile.firstNameLabel")}<input name="firstName" defaultValue={user?.firstName} maxLength={50} required /></label><label>{t("profile.lastNameLabel")}<input name="lastName" defaultValue={user?.lastName} maxLength={50} required /></label></div>
              <label>{t("profile.usernameLabel")} <small>{t("profile.usernameHint")}</small><input name="username" defaultValue={user?.username || ""} placeholder={t("profile.usernamePlaceholder")} pattern="[A-Za-z0-9_-]{3,50}" /></label>
              <div className="form-grid-2"><label>{t("profile.occupationLabel")}<select name="occupation" defaultValue={user?.occupation || "other"}>{occupationValues.map((value) => <option key={value} value={value}>{t(`common.occupations.${value}`)}</option>)}</select></label><label>{t("profile.phoneLabel")}<input name="phoneNumber" inputMode="numeric" defaultValue={user?.phoneNumber || ""} placeholder="998901234567" /></label></div>
              <div className="form-grid-2"><label>{t("profile.languageLabel")}<select name="language" defaultValue={user?.language || "uz"}><option value="uz">O‘zbekcha</option><option value="ru">Русский</option><option value="en">English</option></select></label><label>{t("profile.timezoneLabel")}<select name="timezone" defaultValue={user?.timezone || "Asia/Tashkent"}><option value="Asia/Tashkent">Tashkent (UTC+5)</option><option value="Asia/Almaty">Almaty (UTC+5)</option><option value="Europe/Moscow">Moscow (UTC+3)</option><option value="UTC">UTC</option></select></label></div>
              <div className="settings-actions"><Button type="submit" loading={saving} icon={<Save size={17} />}>{t("profile.saveChanges")}</Button></div>
            </form>
          </section>}

          {settingsSection === "notifications" && <section className="panel settings-panel settings-section-enter">
            <header className="settings-header"><span><BellRing size={20} /></span><div><h2>{t("profile.notificationsTitle")}</h2><p>{t("profile.notificationsDesc")}</p></div></header>
            <div className="toggle-list">
              <button onClick={() => void toggleNotification("notificationsEnabled")}><span className="setting-icon"><Bell size={18} /></span><span><strong>{t("profile.allNotifications")}</strong><small>{t("profile.allNotificationsDesc")}</small></span><i className={notifications.notificationsEnabled ? "on" : ""}><b /></i></button>
              <button onClick={() => void toggleNotification("emailNotifications")}><span className="setting-icon"><Mail size={18} /></span><span><strong>{t("profile.emailNotifications")}</strong><small>{t("profile.emailNotificationsDesc")}</small></span><i className={notifications.emailNotifications ? "on" : ""}><b /></i></button>
              <button onClick={() => void toggleNotification("pushNotifications")}><span className="setting-icon"><Smartphone size={18} /></span><span><strong>{t("profile.pushNotifications")}</strong><small>{t("profile.pushNotificationsDesc")}</small></span><i className={notifications.pushNotifications ? "on" : ""}><b /></i></button>
              <button onClick={() => void toggleNotification("notifyMentions")}><span className="setting-icon"><Globe2 size={18} /></span><span><strong>{t("profile.mentions")}</strong><small>{t("profile.mentionsDesc")}</small></span><i className={notifications.notifyMentions ? "on" : ""}><b /></i></button>
            </div>
          </section>}

          {settingsSection === "sessions" && <section className="panel settings-panel settings-section-enter">
            <header className="settings-header"><span><Laptop size={20} /></span><div><h2>{t("profile.sessionsTitle")}</h2><p>{t("profile.sessionsDesc")}</p></div>{sessions.length > 1 && <Button variant="secondary" loading={revokingAll} onClick={() => void revokeOtherSessions()}>{t("profile.closeOthers")}</Button>}</header>
            <div className="session-list">
              {sessionsLoading && [1, 2].map((item) => <Skeleton key={item} className="skeleton-row" />)}
              {!sessionsLoading && sessions.length === 0 && <div className="compact-empty"><ShieldCheck size={21} /><span><strong>{t("profile.noActiveSessionsTitle")}</strong><small>{t("profile.noActiveSessionsDesc")}</small></span></div>}
              {sessions.map((entry, index) => <div className="session-row" key={entry.id}><span className="session-device">{entry.deviceType?.toLowerCase().includes("mobile") ? <Smartphone size={19} /> : <Laptop size={19} />}</span><span><strong>{entry.deviceName || `${entry.browser || t("profile.browserFallback")} · ${entry.os || t("profile.deviceFallback")}`}</strong><small>{entry.ipAddress || t("profile.ipUnknown")} · {sessionDate(entry.lastUsedAt || entry.createdAt)}</small></span>{index === 0 ? <em><Check size={14} /> {t("profile.current")}</em> : <button className="icon-button" onClick={() => void revoke(entry.id)} aria-label={t("profile.closeSessionAria")}><ChevronRight size={18} /></button>}</div>)}
            </div>
          </section>}
        </div>
      </div>
    </div>
  );
}
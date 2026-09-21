import { Bell, BellRing, Camera, Check, ChevronRight, Globe2, Image as ImageIcon, Laptop, Lock, LoaderCircle, LogOut, Mail, MapPin, Save, ShieldCheck, Smartphone, Trash2, UserRound, UsersRound, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "wouter";
import { Avatar, Button, DisplayName, PageHeader, Skeleton } from "../components/ui";
import { EmojiPickerButton } from "../components/EmojiPicker";
import { AnimatedEmoji } from "../components/AnimatedEmoji";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
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
  const { user, group, groups, selectWorkspace, refreshUser, logout } = useAuth();
  const { show } = useToast();
  const confirm = useConfirm();
  const { t, locale } = useI18n();
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [settingsSection, setSettingsSection] = useState<"profile" | "notifications" | "privacy" | "sessions">("profile");
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [revokingAll, setRevokingAll] = useState(false);
  const [savingNotification, setSavingNotification] = useState(false);
  const [nameEmoji, setNameEmoji] = useState<string | null>(user?.nameEmoji ?? null);
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

  useEffect(() => setNameEmoji(user?.nameEmoji ?? null), [user?.nameEmoji]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const data = new FormData(event.currentTarget);
    const phone = String(data.get("phoneNumber") || "").replace(/\D/g, "");
    const username = String(data.get("username") || "").trim().replace(/^@+/, "");
    try {
      await api.users.update({
        firstName: String(data.get("firstName") || "").trim(),
        lastName: String(data.get("lastName") || "").trim(),
        nickname: String(data.get("nickname") || "").trim() || null,
        username: username || null,
        occupation: String(data.get("occupation") || "other"),
        language: String(data.get("language") || "uz") as "uz" | "ru" | "en",
        timezone: String(data.get("timezone") || "Asia/Tashkent"),
        nameEmoji,
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

  async function uploadBackground(file?: File) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      show(t("profile.backgroundTooLarge"), "error");
      return;
    }
    setUploadingBackground(true);
    try {
      await api.users.uploadBackground(file);
      await refreshUser();
      show(t("profile.backgroundUpdated"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("profile.backgroundUploadFailed"), "error");
    } finally {
      setUploadingBackground(false);
    }
  }

  async function removeBackground() {
    setUploadingBackground(true);
    try {
      await api.users.removeBackground();
      await refreshUser();
      show(t("profile.backgroundRemoved"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("profile.backgroundUploadFailed"), "error");
    } finally {
      setUploadingBackground(false);
    }
  }

  async function setAccountVisibility(visibility: "public" | "private") {
    if (savingVisibility || user?.accountVisibility === visibility) return;
    setSavingVisibility(true);
    try {
      await api.users.updateAccountVisibility(visibility);
      await refreshUser();
      show(visibility === "public" ? t("profile.visibilityPublicSet") : t("profile.visibilityPrivateSet"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("profile.visibilitySaveFailed"), "error");
    } finally {
      setSavingVisibility(false);
    }
  }

  async function toggleNotification(key: keyof typeof notifications) {
    if (savingNotification) return;
    setSavingNotification(true);
    const next = { ...notifications, [key]: !notifications[key] };
    setNotifications(next);
    try {
      await api.users.settings({ [key]: next[key] });
      await refreshUser();
    } catch (error) {
      setNotifications(notifications);
      show(error instanceof Error ? error.message : t("profile.settingNotSaved"), "error");
    } finally {
      setSavingNotification(false);
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
    if (!(await confirm({
      title: t("profile.closeOthers"),
      description: t("profile.confirmCloseOthers"),
      confirmLabel: t("profile.closeOthers")
    }))) return;
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
      <PageHeader eyebrow={group?.name} title={t("profile.pageTitle")} description={t("profile.pageDescription")} />
      <div className="profile-layout">
        <aside className="profile-summary panel">
          <div className="profile-cover"><span>{group?.name}</span></div>
          <div className="profile-avatar-wrap">
            <Avatar firstName={user?.firstName} lastName={user?.lastName} url={user?.avatarUrl} size="xl" />
            <span className="presence-badge" />
            <label className={`avatar-edit-trigger ${uploadingAvatar ? "is-loading" : ""}`} aria-label={t("profile.changePhoto")} title={t("profile.changePhoto")} aria-busy={uploadingAvatar}>
              {uploadingAvatar ? <LoaderCircle className="spin" size={15} /> : <Camera size={15} />}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label={t("profile.selectPhotoAria")} disabled={uploadingAvatar} onChange={(event) => { void uploadAvatar(event.target.files?.[0]); event.currentTarget.value = ""; }} />
            </label>
          </div>
          <h2 className="profile-editable-name"><EmojiPickerButton className="name-emoji-picker" selectedEmoji={nameEmoji} label={t("profile.nameEmojiChoose")} onSelect={setNameEmoji} /><DisplayName firstName={user?.firstName} lastName={user?.lastName} nickname={user?.nickname} /></h2>
          {user?.username ? <button className="profile-username-copy" title={t("profile.copyUsername")} onClick={() => void copyProfileValue(`@${user.username}`, t("profile.usernameCopied"))}>@{user.username}</button> : <p>{t("profile.usernameNotSet")}</p>}
          <span className="role-badge">{user?.occupation ? t(`common.occupations.${user.occupation}`) : t("profile.teamMember")}</span>
          <dl className="profile-meta"><div><Mail size={16} /><span><small>{t("profile.email")}</small><strong>{user?.email}</strong></span></div><div><MapPin size={16} /><span><small>{t("profile.timezone")}</small><strong>{user?.timezone || "Asia/Tashkent"}</strong></span></div><div><ShieldCheck size={16} /><span><small>{t("profile.account")}</small><strong>{t("profile.verified")}</strong></span></div></dl>
          {groups.length > 1 && <label className="profile-group-select">{t("shell.group")}<select value={group?.id || ""} onChange={(event) => { const next = groups.find((item) => item.id === event.target.value); if (next) selectWorkspace(next); }}>{groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          <nav className="settings-tabs" aria-label={t("profile.sectionsAria")}>
            <Link href="/library" className="profile-library-link">{t("shell.library")}<ChevronRight size={18} /></Link>
            <button aria-pressed={settingsSection === "profile"} className={settingsSection === "profile" ? "active" : ""} onClick={() => setSettingsSection("profile")}><UserRound size={18} /><span><strong>{t("profile.tabProfile")}</strong><small>{t("profile.tabProfileHint")}</small></span></button>
            <button aria-pressed={settingsSection === "notifications"} className={settingsSection === "notifications" ? "active" : ""} onClick={() => setSettingsSection("notifications")}><BellRing size={18} /><span><strong>{t("profile.tabNotifications")}</strong><small>{t("profile.tabNotificationsHint")}</small></span></button>
            <button aria-pressed={settingsSection === "privacy"} className={settingsSection === "privacy" ? "active" : ""} onClick={() => setSettingsSection("privacy")}><UsersRound size={18} /><span><strong>{t("profile.tabPrivacy")}</strong><small>{t("profile.tabPrivacyHint")}</small></span></button>
            <button aria-pressed={settingsSection === "sessions"} className={settingsSection === "sessions" ? "active" : ""} onClick={() => setSettingsSection("sessions")}><ShieldCheck size={18} /><span><strong>{t("profile.tabSessions")}</strong><small>{t("profile.tabSessionsHint")}</small></span></button>
          </nav>
        </aside>

        <div className="settings-stack">
          <section hidden={settingsSection !== "profile"} className="panel settings-panel settings-section-enter">
            <header className="settings-header"><span><UserRound size={20} /></span><div><h2>{t("profile.personalInfoTitle")}</h2><p>{t("profile.personalInfoDesc")}</p></div></header>
            <form className="settings-form" onSubmit={saveProfile}>
              <div className="form-grid-2"><label>{t("profile.firstNameLabel")}<input name="firstName" defaultValue={user?.firstName} maxLength={50} required /></label><label>{t("profile.lastNameLabel")}<input name="lastName" defaultValue={user?.lastName} maxLength={50} required /></label></div>
              <label>{t("profile.usernameLabel")} <small>{t("profile.usernameHint")}</small><input name="username" defaultValue={user?.username || ""} placeholder={t("profile.usernamePlaceholder")} pattern="@?[A-Za-z0-9_-]{3,50}" maxLength={51} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
              <label>{t("profile.nicknameLabel")} <small>{t("profile.nicknameHint")}</small><input name="nickname" defaultValue={user?.nickname || ""} placeholder={t("profile.nicknamePlaceholder")} maxLength={50} /></label>
              <div className="name-emoji-setting">
                <span className="name-emoji-preview">{nameEmoji ? <AnimatedEmoji id={nameEmoji} label="" /> : <UserRound size={20} />}</span>
                <span><strong>{t("profile.nameEmojiLabel")}</strong><small>{t("profile.nameEmojiHint")}</small></span>
                <EmojiPickerButton className="name-emoji-picker" label={t("profile.nameEmojiChoose")} onSelect={setNameEmoji} />
                {nameEmoji && <button type="button" className="icon-button" onClick={() => setNameEmoji(null)} aria-label={t("profile.nameEmojiRemove")} title={t("profile.nameEmojiRemove")}><X size={17} /></button>}
              </div>
              <div className="form-grid-2"><label>{t("profile.occupationLabel")}<select name="occupation" defaultValue={user?.occupation || "other"}>{occupationValues.map((value) => <option key={value} value={value}>{t(`common.occupations.${value}`)}</option>)}</select></label><label>{t("profile.phoneLabel")}<input name="phoneNumber" inputMode="numeric" defaultValue={user?.phoneNumber || ""} placeholder="998901234567" /></label></div>
              <div className="form-grid-2"><label>{t("profile.languageLabel")}<select name="language" defaultValue={user?.language || "uz"}><option value="uz">O‘zbekcha</option><option value="ru">Русский</option><option value="en">English</option></select></label><label>{t("profile.timezoneLabel")}<select name="timezone" defaultValue={user?.timezone || "Asia/Tashkent"}><option value="Asia/Tashkent">Tashkent (UTC+5)</option><option value="Asia/Almaty">Almaty (UTC+5)</option><option value="Europe/Moscow">Moscow (UTC+3)</option><option value="UTC">UTC</option></select></label></div>
              <div className="settings-actions"><Button type="submit" loading={saving} icon={<Save size={17} />}>{t("profile.saveChanges")}</Button></div>
            </form>
          </section>

          <section hidden={settingsSection !== "profile"} className="panel settings-panel settings-section-enter">
            <header className="settings-header"><span><ImageIcon size={20} /></span><div><h2>{t("profile.chatBackgroundTitle")}</h2><p>{t("profile.chatBackgroundDesc")}</p></div></header>
            <div className="chat-background-picker">
              <div className="chat-background-preview" style={user?.backgroundUrl ? { backgroundImage: `url(${user.backgroundUrl})` } : undefined}>
                {!user?.backgroundUrl && <ImageIcon size={22} />}
              </div>
              <div className="chat-background-actions">
                <label className={`bg-upload-trigger ${uploadingBackground ? "is-loading" : ""}`} aria-label={t("profile.changeBackground")} title={t("profile.changeBackground")} aria-busy={uploadingBackground}>
                  {uploadingBackground ? <LoaderCircle className="spin" size={15} /> : <ImageIcon size={15} />}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label={t("profile.selectBackgroundAria")} disabled={uploadingBackground} onChange={(event) => { void uploadBackground(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                </label>
                {user?.backgroundUrl && <Button variant="secondary" disabled={uploadingBackground} onClick={() => void removeBackground()} icon={<Trash2 size={16} />}>{t("profile.removeBackground")}</Button>}
              </div>
            </div>
          </section>

          {settingsSection === "notifications" && <section className="panel settings-panel settings-section-enter">
            <header className="settings-header"><span><BellRing size={20} /></span><div><h2>{t("profile.notificationsTitle")}</h2><p>{t("profile.notificationsDesc")}</p></div></header>
            <div className="toggle-list">
              {([
                ["notificationsEnabled", Bell, "allNotifications", "allNotificationsDesc"],
                ["emailNotifications", Mail, "emailNotifications", "emailNotificationsDesc"],
                ["pushNotifications", Smartphone, "pushNotifications", "pushNotificationsDesc"],
                ["notifyMentions", Globe2, "mentions", "mentionsDesc"],
              ] as const).map(([key, Icon, label, description]) => (
                <button key={key} type="button" role="switch" aria-checked={notifications[key]}
                  aria-label={t(`profile.${label}`)} aria-describedby={`notification-${key}`}
                  disabled={savingNotification} onClick={() => void toggleNotification(key)}>
                  <span className="setting-icon"><Icon size={18} /></span>
                  <span><strong>{t(`profile.${label}`)}</strong><small id={`notification-${key}`}>{t(`profile.${description}`)}</small></span>
                  <i className={notifications[key] ? "on" : ""} aria-hidden="true"><b /></i>
                </button>
              ))}
            </div>
          </section>}

          {settingsSection === "privacy" && <section className="panel settings-panel settings-section-enter">
            <header className="settings-header"><span><Lock size={20} /></span><div><h2>{t("profile.privacyTitle")}</h2><p>{t("profile.privacyDesc")}</p></div></header>
            <div className="visibility-picker">
              <button type="button" className={`visibility-option ${(user?.accountVisibility ?? "public") === "public" ? "active" : ""}`} disabled={savingVisibility} onClick={() => void setAccountVisibility("public")}>
                <UsersRound size={20} />
                <span><strong>{t("profile.visibilityPublicTitle")}</strong><small>{t("profile.visibilityPublicDesc")}</small></span>
                {(user?.accountVisibility ?? "public") === "public" && <Check size={16} />}
              </button>
              <button type="button" className={`visibility-option ${user?.accountVisibility === "private" ? "active" : ""}`} disabled={savingVisibility} onClick={() => void setAccountVisibility("private")}>
                <Lock size={20} />
                <span><strong>{t("profile.visibilityPrivateTitle")}</strong><small>{t("profile.visibilityPrivateDesc")}</small></span>
                {user?.accountVisibility === "private" && <Check size={16} />}
              </button>
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
      <div className="profile-logout-footer"><Button variant="secondary" onClick={() => void logout()} icon={<LogOut size={17} />}>{t("profile.logoutButton")}</Button></div>
    </div>
  );
}

import { AtSign, Bell, BellRing, Briefcase, Camera, Check, ChevronRight, Clock3, Gift, Globe2, Image as ImageIcon, KeyRound, Laptop, Lock, LoaderCircle, LogOut, Mail, Phone, ShieldCheck, Smartphone, Trash2, UserRound, UsersRound, X } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Avatar, Button, Skeleton } from "../components/ui";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";
import type { User } from "../types";

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
const timezones = [["Asia/Tashkent", "Tashkent (UTC+5)"], ["Asia/Almaty", "Almaty (UTC+5)"], ["Europe/Istanbul", "Istanbul (UTC+3)"], ["Europe/Moscow", "Moscow (UTC+3)"], ["UTC", "UTC"]];
const localeTag: Record<string, string> = { uz: "uz-UZ", ru: "ru-RU", en: "en-US", tr: "tr-TR" };
const BIO_LIMIT = 140;
const passwordRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,32}$/;

type Draft = { firstName: string; lastName: string; username: string; phoneNumber: string; bio: string; birthday: string; occupation: string; timezone: string };
type Field = "name" | "phoneNumber" | "username" | "birthday" | "occupation" | "timezone";
type Section = "notifications" | "privacy" | "sessions" | "password" | "background";

function draftOf(user: User | null): Draft {
  return {
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
    username: user?.username ?? "",
    phoneNumber: user?.phoneNumber ? String(user.phoneNumber) : "",
    bio: user?.bio ?? "",
    birthday: user?.birthday ?? "",
    occupation: user?.occupation ?? "other",
    timezone: user?.timezone ?? "Asia/Tashkent",
  };
}

/** One Telegram-style info row: shows the value, turns into its editor when clicked. */
function Row({ field, editing, onEdit, notSet, icon, label, value, children }: { field: Field; editing: Field | null; onEdit: (field: Field) => void; notSet: string; icon: ReactNode; label: string; value: ReactNode; children: ReactNode }) {
  const open = editing === field;
  return (
    <div className={`tgp-row ${open ? "is-editing" : ""}`}>
      {icon}
      {open ? <div className="tgp-row-edit">{children}<small>{label}</small></div> : (
        <button type="button" className="tgp-row-main" onClick={() => onEdit(field)}>
          <strong>{value || <em>{notSet}</em>}</strong><small>{label}</small>
        </button>
      )}
    </div>
  );
}

export function ProfilePage() {
  const { user, group: workspace, refreshUser, logout } = useAuth();
  const { show } = useToast();
  const confirm = useConfirm();
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState<Draft>(() => draftOf(user));
  const [editing, setEditing] = useState<Field | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [section, setSection] = useState<Section>("notifications");
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [revokingAll, setRevokingAll] = useState(false);
  const [notifications, setNotifications] = useState({
    notificationsEnabled: user?.notificationsEnabled ?? true,
    emailNotifications: user?.emailNotifications ?? true,
    pushNotifications: user?.pushNotifications ?? true,
    notifyMentions: user?.notifyMentions ?? true,
  });
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [changingPassword, setChangingPassword] = useState(false);

  // A fresh server copy (after a save or an avatar upload) resets the draft —
  // but never while the user has unsaved edits in it.
  const saved = useMemo(() => draftOf(user), [user]);
  const changed = useMemo(() => (Object.keys(saved) as Array<keyof Draft>).filter((key) => draft[key].trim() !== saved[key].trim()), [draft, saved]);
  useEffect(() => { if (!changed.length) setDraft(saved); }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.auth.sessions().then(setSessions).catch(() => setSessions([])).finally(() => setSessionsLoading(false));
  }, []);

  function sessionDate(value?: string) {
    if (!value) return t("common.unknown");
    return new Intl.DateTimeFormat(localeTag[locale] || "uz-UZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }
  function birthdayLabel(value: string) {
    if (!value) return "";
    return new Intl.DateTimeFormat(localeTag[locale] || "uz-UZ", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  }
  const set = (key: keyof Draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  /** One request for everything edited — nothing is written field by field. */
  async function saveAll() {
    if (!draft.firstName.trim()) { show(t("profile.firstNameRequired"), "error"); setEditing("name"); return; }
    if (draft.username && !/^[A-Za-z0-9_-]{3,50}$/.test(draft.username.replace(/^@/, ""))) { show(t("profile.usernameInvalid"), "error"); setEditing("username"); return; }
    const phone = draft.phoneNumber.replace(/\D/g, "");
    const patch: Record<string, unknown> = {};
    for (const key of changed) {
      if (key === "phoneNumber") { if (phone) patch.phoneNumber = Number(phone); continue; }
      if (key === "username") { patch.username = draft.username.replace(/^@/, "").trim() || null; continue; }
      if (key === "bio" || key === "birthday") { patch[key] = draft[key].trim() || null; continue; }
      patch[key] = draft[key].trim();
    }
    setSaving(true);
    try {
      await api.users.update(patch as Partial<User>);
      setEditing(null);
      await refreshUser();
      show(t("profile.profileSaved"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("profile.profileSaveFailed"), "error");
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setDraft(saved);
    setEditing(null);
  }

  async function copy(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      show(success);
    } catch {
      show(t("profile.copyFailed"), "error");
    }
  }

  async function uploadAvatar(file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { show(t("profile.imageTooLarge"), "error"); return; }
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
    if (file.size > 8 * 1024 * 1024) { show(t("profile.backgroundTooLarge"), "error"); return; }
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
    if (!(await confirm({ title: t("profile.closeOthers"), description: t("profile.confirmCloseOthers"), confirmLabel: t("profile.closeOthers") }))) return;
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

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwords.next !== passwords.confirm) { show(t("profile.passwordMismatch"), "error"); return; }
    if (!passwordRule.test(passwords.next)) { show(t("profile.passwordRules"), "error"); return; }
    setChangingPassword(true);
    try {
      await api.auth.changePassword(passwords.current, passwords.next);
      show(t("profile.passwordChanged"));
      setPasswords({ current: "", next: "", confirm: "" });
      // Every session was revoked server-side, this one included.
      window.setTimeout(() => void logout(), 1200);
    } catch (error) {
      show(error instanceof Error ? error.message : t("profile.passwordChangeFailed"), "error");
    } finally {
      setChangingPassword(false);
    }
  }

  const sections: Array<{ key: Section; icon: ReactNode; tone: string; title: string; hint: string }> = [
    { key: "notifications", icon: <BellRing size={18} />, tone: "red", title: t("profile.tabNotifications"), hint: t("profile.tabNotificationsHint") },
    { key: "privacy", icon: <Lock size={18} />, tone: "blue", title: t("profile.tabPrivacy"), hint: t("profile.tabPrivacyHint") },
    { key: "password", icon: <KeyRound size={18} />, tone: "amber", title: t("profile.tabPassword"), hint: t("profile.tabPasswordHint") },
    { key: "sessions", icon: <Laptop size={18} />, tone: "green", title: t("profile.tabSessions"), hint: t("profile.tabSessionsHint") },
    { key: "background", icon: <ImageIcon size={18} />, tone: "violet", title: t("profile.chatBackgroundTitle"), hint: t("profile.tabBackgroundHint") },
  ];

  return (
    <div className="page profile-page tgp-page">
      <header className="tgp-heading"><span>{workspace?.name}</span><h1>{t("profile.pageTitle")}</h1></header>
      <div className="tgp-layout">
        <aside className="tgp-card" aria-label={t("profile.personalInfoTitle")}>
          <div className="tgp-hero">
            <div className="tgp-avatar">
              <Avatar firstName={draft.firstName || user?.firstName} lastName={draft.lastName || user?.lastName} url={user?.avatarUrl} size="xl" />
              <label className={`tgp-avatar-cam ${uploadingAvatar ? "is-loading" : ""}`} title={t("profile.changePhoto")} aria-busy={uploadingAvatar}>
                {uploadingAvatar ? <LoaderCircle className="spin" size={26} /> : <Camera size={26} />}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label={t("profile.selectPhotoAria")} disabled={uploadingAvatar}
                       onChange={(event) => { void uploadAvatar(event.target.files?.[0]); event.currentTarget.value = ""; }} />
              </label>
              <span className="tgp-online" aria-label={t("profile.online")} />
            </div>
            <button type="button" className="tgp-name" onClick={() => setEditing("name")} title={t("profile.editNameHint")}>
              {`${draft.firstName} ${draft.lastName}`.trim() || t("profile.notSet")}
            </button>
            <small className="tgp-status">{t("profile.online")}</small>
          </div>

          <section className="tgp-group">
            <label className="tgp-bio">
              <textarea value={draft.bio} maxLength={BIO_LIMIT} rows={2} placeholder={t("profile.bioPlaceholder")} onChange={(event) => set("bio", event.target.value)} />
              <span className={BIO_LIMIT - draft.bio.length < 15 ? "low" : ""}>{BIO_LIMIT - draft.bio.length}</span>
            </label>
          </section>
          <p className="tgp-hint">{t("profile.bioHint")}</p>

          <section className="tgp-group">
            <Row editing={editing} onEdit={setEditing} notSet={t("profile.notSet")} field="name" icon={<UserRound size={20} />} label={t("profile.nameRow")} value={`${draft.firstName} ${draft.lastName}`.trim()}>
              <div className="tgp-two">
                <input autoFocus value={draft.firstName} maxLength={50} placeholder={t("profile.firstNameLabel")} onChange={(event) => set("firstName", event.target.value)} />
                <input value={draft.lastName} maxLength={50} placeholder={t("profile.lastNameLabel")} onChange={(event) => set("lastName", event.target.value)} />
              </div>
            </Row>
            <Row editing={editing} onEdit={setEditing} notSet={t("profile.notSet")} field="phoneNumber" icon={<Phone size={20} />} label={t("profile.phoneLabel")} value={draft.phoneNumber ? `+${draft.phoneNumber.replace(/\D/g, "")}` : ""}>
              <input autoFocus inputMode="tel" value={draft.phoneNumber} placeholder="998901234567" onChange={(event) => set("phoneNumber", event.target.value.replace(/[^\d+ ]/g, ""))} />
            </Row>
            <Row editing={editing} onEdit={setEditing} notSet={t("profile.notSet")} field="username" icon={<AtSign size={20} />} label={t("profile.usernameLabel")} value={draft.username ? `@${draft.username.replace(/^@/, "")}` : ""}>
              <input autoFocus value={draft.username} maxLength={51} placeholder={t("profile.usernamePlaceholder")} onChange={(event) => set("username", event.target.value.replace(/\s/g, ""))} />
            </Row>
            <Row editing={editing} onEdit={setEditing} notSet={t("profile.notSet")} field="birthday" icon={<Gift size={20} />} label={t("profile.birthdayLabel")} value={birthdayLabel(draft.birthday)}>
              <div className="tgp-two">
                <input autoFocus type="date" value={draft.birthday} max={new Date().toISOString().slice(0, 10)} min="1900-01-01" onChange={(event) => set("birthday", event.target.value)} />
                {draft.birthday && <button type="button" className="tgp-clear" onClick={() => set("birthday", "")} aria-label={t("profile.clearBirthday")}><X size={16} /></button>}
              </div>
            </Row>
          </section>
          <p className="tgp-hint">{t("profile.usernameHint")}</p>

          <section className="tgp-group">
            <Row editing={editing} onEdit={setEditing} notSet={t("profile.notSet")} field="occupation" icon={<Briefcase size={20} />} label={t("profile.occupationLabel")} value={t(`common.occupations.${draft.occupation}`)}>
              <select autoFocus value={draft.occupation} onChange={(event) => set("occupation", event.target.value)}>{occupationValues.map((value) => <option key={value} value={value}>{t(`common.occupations.${value}`)}</option>)}</select>
            </Row>
            <Row editing={editing} onEdit={setEditing} notSet={t("profile.notSet")} field="timezone" icon={<Clock3 size={20} />} label={t("profile.timezoneLabel")} value={timezones.find(([value]) => value === draft.timezone)?.[1] ?? draft.timezone}>
              <select autoFocus value={draft.timezone} onChange={(event) => set("timezone", event.target.value)}>{timezones.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </Row>
            <div className="tgp-row"><Mail size={20} /><div className="tgp-row-main static"><strong>{user?.email}</strong><small>{t("profile.email")}</small></div><ShieldCheck size={16} className="tgp-verified" aria-label={t("profile.verified")} /></div>
          </section>

          {changed.length > 0 && <div className="tgp-savebar" role="region" aria-label={t("profile.unsavedChanges")}>
            <span>{t("profile.unsavedChanges")}</span>
            <button type="button" onClick={discard} disabled={saving}>{t("common.cancel")}</button>
            <button type="button" className="primary" onClick={() => void saveAll()} disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{t("common.save")}</button>
          </div>}

          <button type="button" className="tgp-logout" onClick={() => void logout()}><LogOut size={18} />{t("profile.logoutButton")}</button>
        </aside>

        <div className="tgp-settings">
          <nav className="tgp-nav" aria-label={t("profile.sectionsAria")}>
            {sections.map((item) => (
              <button key={item.key} type="button" className={section === item.key ? "active" : ""} onClick={() => setSection(item.key)}>
                <span className={`tgp-nav-icon tone-${item.tone}`}>{item.icon}</span>
                <span className="tgp-nav-text"><strong>{item.title}</strong><small>{item.hint}</small></span>
                <ChevronRight size={18} className="tgp-nav-chevron" />
              </button>
            ))}
          </nav>

          <section className="tgp-panel" key={section}>
            {section === "notifications" && <>
              <header><h2>{t("profile.notificationsTitle")}</h2><p>{t("profile.notificationsDesc")}</p></header>
              <div className="toggle-list">
                <button onClick={() => void toggleNotification("notificationsEnabled")}><span className="setting-icon"><Bell size={18} /></span><span><strong>{t("profile.allNotifications")}</strong><small>{t("profile.allNotificationsDesc")}</small></span><i className={notifications.notificationsEnabled ? "on" : ""}><b /></i></button>
                <button onClick={() => void toggleNotification("emailNotifications")}><span className="setting-icon"><Mail size={18} /></span><span><strong>{t("profile.emailNotifications")}</strong><small>{t("profile.emailNotificationsDesc")}</small></span><i className={notifications.emailNotifications ? "on" : ""}><b /></i></button>
                <button onClick={() => void toggleNotification("pushNotifications")}><span className="setting-icon"><Smartphone size={18} /></span><span><strong>{t("profile.pushNotifications")}</strong><small>{t("profile.pushNotificationsDesc")}</small></span><i className={notifications.pushNotifications ? "on" : ""}><b /></i></button>
                <button onClick={() => void toggleNotification("notifyMentions")}><span className="setting-icon"><Globe2 size={18} /></span><span><strong>{t("profile.mentions")}</strong><small>{t("profile.mentionsDesc")}</small></span><i className={notifications.notifyMentions ? "on" : ""}><b /></i></button>
              </div>
            </>}

            {section === "privacy" && <>
              <header><h2>{t("profile.privacyTitle")}</h2><p>{t("profile.privacyDesc")}</p></header>
              <div className="visibility-picker">
                <button type="button" className={`visibility-option ${(user?.accountVisibility ?? "public") === "public" ? "active" : ""}`} disabled={savingVisibility} onClick={() => void setAccountVisibility("public")}>
                  <UsersRound size={20} /><span><strong>{t("profile.visibilityPublicTitle")}</strong><small>{t("profile.visibilityPublicDesc")}</small></span>{(user?.accountVisibility ?? "public") === "public" && <Check size={16} />}
                </button>
                <button type="button" className={`visibility-option ${user?.accountVisibility === "private" ? "active" : ""}`} disabled={savingVisibility} onClick={() => void setAccountVisibility("private")}>
                  <Lock size={20} /><span><strong>{t("profile.visibilityPrivateTitle")}</strong><small>{t("profile.visibilityPrivateDesc")}</small></span>{user?.accountVisibility === "private" && <Check size={16} />}
                </button>
              </div>
            </>}

            {section === "password" && <>
              <header><h2>{t("profile.passwordTitle")}</h2><p>{t("profile.passwordDesc")}</p></header>
              <form className="tgp-password" onSubmit={(event) => void changePassword(event)}>
                <label>{t("profile.currentPassword")}<input type="password" autoComplete="current-password" value={passwords.current} onChange={(event) => setPasswords((current) => ({ ...current, current: event.target.value }))} required /></label>
                <label>{t("profile.newPassword")}<input type="password" autoComplete="new-password" value={passwords.next} onChange={(event) => setPasswords((current) => ({ ...current, next: event.target.value }))} required minLength={8} maxLength={32} /></label>
                <label>{t("profile.confirmPassword")}<input type="password" autoComplete="new-password" value={passwords.confirm} onChange={(event) => setPasswords((current) => ({ ...current, confirm: event.target.value }))} required /></label>
                <small className={passwords.next && !passwordRule.test(passwords.next) ? "warn" : ""}>{t("profile.passwordRules")}</small>
                <small>{t("profile.passwordSignsOut")}</small>
                <Button type="submit" loading={changingPassword} icon={<KeyRound size={17} />} disabled={!passwords.current || !passwords.next || !passwords.confirm}>{t("profile.changePasswordButton")}</Button>
              </form>
            </>}

            {section === "sessions" && <>
              <header className="with-action"><div><h2>{t("profile.sessionsTitle")}</h2><p>{t("profile.sessionsDesc")}</p></div>{sessions.length > 1 && <Button variant="secondary" loading={revokingAll} onClick={() => void revokeOtherSessions()}>{t("profile.closeOthers")}</Button>}</header>
              <div className="session-list">
                {sessionsLoading && [1, 2].map((item) => <Skeleton key={item} className="skeleton-row" />)}
                {!sessionsLoading && sessions.length === 0 && <div className="compact-empty"><ShieldCheck size={21} /><span><strong>{t("profile.noActiveSessionsTitle")}</strong><small>{t("profile.noActiveSessionsDesc")}</small></span></div>}
                {sessions.map((entry, index) => <div className="session-row" key={entry.id}><span className="session-device">{entry.deviceType?.toLowerCase().includes("mobile") ? <Smartphone size={19} /> : <Laptop size={19} />}</span><span><strong>{entry.deviceName || `${entry.browser || t("profile.browserFallback")} · ${entry.os || t("profile.deviceFallback")}`}</strong><small>{entry.ipAddress || t("profile.ipUnknown")} · {sessionDate(entry.lastUsedAt || entry.createdAt)}</small></span>{index === 0 ? <em><Check size={14} /> {t("profile.current")}</em> : <button className="icon-button" onClick={() => void revoke(entry.id)} aria-label={t("profile.closeSessionAria")}><X size={18} /></button>}</div>)}
              </div>
            </>}

            {section === "background" && <>
              <header><h2>{t("profile.chatBackgroundTitle")}</h2><p>{t("profile.chatBackgroundDesc")}</p></header>
              <div className="tgp-bg">
                <div className="tgp-bg-preview" style={user?.backgroundUrl ? { backgroundImage: `url(${user.backgroundUrl})` } : undefined}>{!user?.backgroundUrl && <ImageIcon size={26} />}</div>
                <div className="tgp-bg-actions">
                  <label className={`button button-primary ${uploadingBackground ? "is-loading" : ""}`} aria-busy={uploadingBackground}>
                    {uploadingBackground ? <LoaderCircle className="spin" size={16} /> : <ImageIcon size={16} />}{t("profile.changeBackground")}
                    <input type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" aria-label={t("profile.selectBackgroundAria")} disabled={uploadingBackground} onChange={(event) => { void uploadBackground(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                  </label>
                  {user?.backgroundUrl && <Button variant="secondary" disabled={uploadingBackground} onClick={() => void removeBackground()} icon={<Trash2 size={16} />}>{t("profile.removeBackground")}</Button>}
                </div>
              </div>
            </>}
          </section>
        </div>
      </div>
    </div>
  );
}

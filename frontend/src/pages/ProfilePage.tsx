import { Bell, BellRing, Camera, Check, ChevronRight, Copy, Globe2, Laptop, Link2, LoaderCircle, LogOut, Mail, MapPin, Save, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Avatar, Button, PageHeader, Skeleton } from "../components/ui";
import { useToast } from "../components/Toast";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

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

const occupationOptions = [
  ["developer", "Dasturchi"], ["designer", "Dizayner"], ["freelancer", "Freelancer"],
  ["project_manager", "Project manager"], ["qa_engineer", "QA engineer"],
  ["devops_engineer", "DevOps engineer"], ["product_manager", "Product manager"],
  ["student", "Talaba"], ["other", "Boshqa"],
];

function sessionDate(value?: string) {
  if (!value) return "Noma’lum";
  return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function ProfilePage() {
  const { user, workspace, refreshUser, logout } = useAuth();
  const { show } = useToast();
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
      show("Profil saqlandi");
    } catch (error) {
      show(error instanceof Error ? error.message : "Profil saqlanmadi", "error");
    } finally {
      setSaving(false);
    }
  }

  async function copyProfileValue(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      show(success);
    } catch {
      show("Nusxalab bo‘lmadi", "error");
    }
  }

  const profilePath = user?.username ? `/u/${user.username}` : `/user/${user?.publicId || ""}`;

  async function uploadAvatar(file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      show("Rasm hajmi 5 MB dan oshmasligi kerak", "error");
      return;
    }
    setUploadingAvatar(true);
    try {
      await api.users.uploadAvatar(file);
      await refreshUser();
      show("Profil rasmi yangilandi");
    } catch (error) {
      show(error instanceof Error ? error.message : "Profil rasmi yuklanmadi", "error");
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
      show(error instanceof Error ? error.message : "Sozlama saqlanmadi", "error");
    }
  }

  async function revoke(id: string) {
    try {
      await api.auth.revokeSession(id);
      setSessions((current) => current.filter((entry) => entry.id !== id));
      show("Sessiya yopildi");
    } catch (error) {
      show(error instanceof Error ? error.message : "Sessiya yopilmadi", "error");
    }
  }

  async function revokeOtherSessions() {
    if (!window.confirm("Boshqa barcha qurilmalardagi sessiyalar yopilsinmi?")) return;
    setRevokingAll(true);
    try {
      await Promise.all(sessions.slice(1).map((entry) => api.auth.revokeSession(entry.id)));
      setSessions((current) => current.slice(0, 1));
      show("Boshqa sessiyalar yopildi");
    } catch (error) {
      show(error instanceof Error ? error.message : "Sessiyalar yopilmadi", "error");
    } finally {
      setRevokingAll(false);
    }
  }

  return (
    <div className="page profile-page">
      <PageHeader eyebrow={workspace?.name} title="Profil va sozlamalar" description="Shaxsiy ma’lumotlar, xabarnomalar va faol qurilmalarni boshqaring." />
      <div className="profile-layout">
        <aside className="profile-summary panel">
          <div className="profile-cover"><span>{workspace?.name}</span></div>
          <div className="profile-avatar-wrap"><Avatar firstName={user?.firstName} lastName={user?.lastName} url={user?.avatarUrl} size="xl" /><span className="presence-badge" /></div>
          <h2>{user?.firstName} {user?.lastName}</h2>
          <p>{user?.username ? `@${user.username}` : "Username o‘rnatilmagan"}</p>
          <div className="public-id-block"><span>ID: <strong>{user?.publicId}</strong></span><button className="icon-button" onClick={() => user?.publicId && void copyProfileValue(user.publicId, "ID nusxalandi")} aria-label="User ID ni nusxalash"><Copy size={16} /></button><button className="icon-button" onClick={() => void copyProfileValue(new URL(profilePath, window.location.origin).toString(), "Profil havolasi nusxalandi")} aria-label="Profil havolasini nusxalash"><Link2 size={16} /></button></div>
          <span className="role-badge">{user?.occupation?.replace(/_/g, " ") || "Jamoa a’zosi"}</span>
          <dl className="profile-meta"><div><Mail size={16} /><span><small>Email</small><strong>{user?.email}</strong></span></div><div><MapPin size={16} /><span><small>Vaqt hududi</small><strong>{user?.timezone || "Asia/Tashkent"}</strong></span></div><div><ShieldCheck size={16} /><span><small>Hisob</small><strong>Tasdiqlangan</strong></span></div></dl>
          <Button variant="secondary" onClick={() => void logout()} icon={<LogOut size={17} />}>Hisobdan chiqish</Button>
        </aside>

        <div className="settings-stack">
          <nav className="settings-tabs" aria-label="Sozlamalar bo‘limlari">
            <button className={settingsSection === "profile" ? "active" : ""} onClick={() => setSettingsSection("profile")}><UserRound size={18} /><span><strong>Profil</strong><small>Shaxsiy ma’lumotlar</small></span></button>
            <button className={settingsSection === "notifications" ? "active" : ""} onClick={() => setSettingsSection("notifications")}><BellRing size={18} /><span><strong>Xabarnomalar</strong><small>Bildirishnoma nazorati</small></span></button>
            <button className={settingsSection === "sessions" ? "active" : ""} onClick={() => setSettingsSection("sessions")}><ShieldCheck size={18} /><span><strong>Qurilmalar</strong><small>Faol sessiyalar</small></span></button>
          </nav>
          {settingsSection === "profile" && <section className="panel settings-panel settings-section-enter">
            <header className="settings-header"><span><UserRound size={20} /></span><div><h2>Shaxsiy ma’lumotlar</h2><p>Jamoa a’zolari ko‘radigan profil.</p></div></header>
            <form className="settings-form" onSubmit={saveProfile}>
              <div className="avatar-editor">
                <Avatar firstName={user?.firstName} lastName={user?.lastName} url={user?.avatarUrl} size="xl" />
                <span><strong>Profil rasmi</strong><small>JPG, PNG, WebP yoki GIF. Maksimal 5 MB.</small></span>
                <label className={`avatar-upload-button ${uploadingAvatar ? "is-loading" : ""}`} aria-busy={uploadingAvatar}>
                  {uploadingAvatar ? <LoaderCircle className="spin" size={17} /> : <Camera size={17} />}
                  {uploadingAvatar ? "Yuklanmoqda" : "Rasmni almashtirish"}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Profil rasmini tanlash" disabled={uploadingAvatar} onChange={(event) => { void uploadAvatar(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                </label>
              </div>
              <div className="form-grid-2"><label>Ism<input name="firstName" defaultValue={user?.firstName} maxLength={50} required /></label><label>Familiya<input name="lastName" defaultValue={user?.lastName} maxLength={50} required /></label></div>
              <label>Username <small>Ixtiyoriy, keyin o‘zgartirish mumkin</small><input name="username" defaultValue={user?.username || ""} placeholder="ahmadjon" pattern="[A-Za-z0-9_\-]{3,50}" /></label>
              <div className="form-grid-2"><label>Kasb<select name="occupation" defaultValue={user?.occupation || "other"}>{occupationOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Telefon<input name="phoneNumber" inputMode="numeric" defaultValue={user?.phoneNumber || ""} placeholder="998901234567" /></label></div>
              <div className="form-grid-2"><label>Til<select name="language" defaultValue={user?.language || "uz"}><option value="uz">O‘zbekcha</option><option value="ru">Русский</option><option value="en">English</option></select></label><label>Vaqt hududi<select name="timezone" defaultValue={user?.timezone || "Asia/Tashkent"}><option value="Asia/Tashkent">Tashkent (UTC+5)</option><option value="Asia/Almaty">Almaty (UTC+5)</option><option value="Europe/Moscow">Moscow (UTC+3)</option><option value="UTC">UTC</option></select></label></div>
              <div className="settings-actions"><Button type="submit" loading={saving} icon={<Save size={17} />}>O‘zgarishlarni saqlash</Button></div>
            </form>
          </section>}

          {settingsSection === "notifications" && <section className="panel settings-panel settings-section-enter">
            <header className="settings-header"><span><BellRing size={20} /></span><div><h2>Xabarnomalar</h2><p>Qaysi yangiliklar sizga yetib borishini tanlang.</p></div></header>
            <div className="toggle-list">
              <button onClick={() => void toggleNotification("notificationsEnabled")}><span className="setting-icon"><Bell size={18} /></span><span><strong>Barcha xabarnomalar</strong><small>Optima ichidagi bildirishnomalar</small></span><i className={notifications.notificationsEnabled ? "on" : ""}><b /></i></button>
              <button onClick={() => void toggleNotification("emailNotifications")}><span className="setting-icon"><Mail size={18} /></span><span><strong>Email xabarnomalari</strong><small>Muhim yangiliklar emailga yuboriladi</small></span><i className={notifications.emailNotifications ? "on" : ""}><b /></i></button>
              <button onClick={() => void toggleNotification("pushNotifications")}><span className="setting-icon"><Smartphone size={18} /></span><span><strong>Push xabarnomalar</strong><small>Brauzer va mobil qurilma</small></span><i className={notifications.pushNotifications ? "on" : ""}><b /></i></button>
              <button onClick={() => void toggleNotification("notifyMentions")}><span className="setting-icon"><Globe2 size={18} /></span><span><strong>Mentionlar</strong><small>Kimdir sizni chatda belgilaganda</small></span><i className={notifications.notifyMentions ? "on" : ""}><b /></i></button>
            </div>
          </section>}

          {settingsSection === "sessions" && <section className="panel settings-panel settings-section-enter">
            <header className="settings-header"><span><Laptop size={20} /></span><div><h2>Faol sessiyalar</h2><p>Hisobingiz ochiq turgan qurilmalar.</p></div>{sessions.length > 1 && <Button variant="secondary" loading={revokingAll} onClick={() => void revokeOtherSessions()}>Boshqalarini yopish</Button>}</header>
            <div className="session-list">
              {sessionsLoading && [1, 2].map((item) => <Skeleton key={item} className="skeleton-row" />)}
              {!sessionsLoading && sessions.length === 0 && <div className="compact-empty"><ShieldCheck size={21} /><span><strong>Faol sessiya topilmadi</strong><small>Yangi sessiyalar shu yerda ko‘rinadi.</small></span></div>}
              {sessions.map((entry, index) => <div className="session-row" key={entry.id}><span className="session-device">{entry.deviceType?.toLowerCase().includes("mobile") ? <Smartphone size={19} /> : <Laptop size={19} />}</span><span><strong>{entry.deviceName || `${entry.browser || "Brauzer"} · ${entry.os || "Qurilma"}`}</strong><small>{entry.ipAddress || "IP noma’lum"} · {sessionDate(entry.lastUsedAt || entry.createdAt)}</small></span>{index === 0 ? <em><Check size={14} /> Joriy</em> : <button className="icon-button" onClick={() => void revoke(entry.id)} aria-label="Sessiyani yopish"><ChevronRight size={18} /></button>}</div>)}
            </div>
          </section>}
        </div>
      </div>
    </div>
  );
}

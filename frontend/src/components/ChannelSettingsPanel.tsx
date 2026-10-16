import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Bot, ChevronRight, Heart, FileText, GraduationCap, Info, LayoutGrid, Loader2, Lock, Megaphone,
  MessageSquare, Plug, Save, ScrollText, Shield, ShieldAlert, Sparkles, UserPlus, Users, Video
} from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "./Toast";
import { useI18n } from "../lib/i18n/i18n";
import { Button } from "./ui";
import type { Audience, ChannelSettings, ChatRoom, CommentAudience, RoomRole } from "../types";

/**
 * Sections whose settings are stored faithfully but which nothing enforces
 * yet, because each needs a system that doesn't exist here: model calls,
 * third-party OAuth, a scheduler. Analytics, Files and Security dropped off
 * this list once they were wired to real data — labelling them honestly is the
 * point, and a badge that never comes off is just noise.
 */
const PREVIEW_SECTIONS = new Set(["meeting", "ai", "integrations", "education"]);

type SectionId =
  | "general" | "privacy" | "permissions" | "moderation" | "notifications"
  | "content" | "analytics" | "files" | "security" | "meeting" | "ai"
  | "integrations" | "education" | "danger" | "requests";

const SECTIONS: Array<{ id: SectionId; icon: typeof Info }> = [
  { id: "general", icon: Info },
  { id: "privacy", icon: Lock },
  { id: "requests", icon: UserPlus },
  { id: "permissions", icon: Users },
  { id: "moderation", icon: Shield },
  { id: "notifications", icon: MessageSquare },
  { id: "content", icon: ScrollText },
  { id: "analytics", icon: LayoutGrid },
  { id: "files", icon: FileText },
  { id: "security", icon: ShieldAlert },
  { id: "meeting", icon: Video },
  { id: "ai", icon: Sparkles },
  { id: "integrations", icon: Plug },
  { id: "education", icon: GraduationCap },
  { id: "danger", icon: Megaphone }
];

/** Telegram-style coloured icon tile per settings row. */
const SECTION_TONES: Record<SectionId, string> = {
  general: "blue", privacy: "violet", requests: "green", content: "orange", notifications: "red",
  permissions: "teal", moderation: "indigo", files: "sky", security: "slate", analytics: "amber",
  meeting: "green", ai: "pink", integrations: "slate", education: "orange", danger: "red",
};

/**
 * Audit actions are stored as stable machine strings (`chat_room.deleted`), so
 * they survive renames and stay greppable. Anything unmapped falls through to
 * the raw string rather than rendering blank.
 */
const ACTION_LABELS: Record<string, string> = {
  "chat_room.settings_updated": "Settings updated",
  "chat_room.member_role_changed": "Role changed",
  "chat_room.ownership_transferred": "Ownership transferred",
  "chat_room.deleted": "Room deleted"
};

const AUDIENCES: Audience[] = ["owner", "admins", "moderators", "members"];
const COMMENT_AUDIENCES: CommentAudience[] = ["everyone", "subscribers", "verified", "disabled"];
const SLOW_MODES = [0, 1, 5, 10, 30, 60, 300];
const AUTO_DELETE = [null, 1, 7, 30, 90, 365];

interface Props {
  room: ChatRoom;
  /** Open straight on one section (e.g. the join requests from the chat's banner). */
  initialSection?: "requests";
  onClose: () => void;
  onSaved: () => void;
}

interface RoomMember {
  id: string;
  firstName: string;
  lastName: string;
  username?: string | null;
  role: string;
}

export function ChannelSettingsPanel({ room, onClose, onSaved, initialSection }: Props) {
  const { t } = useI18n();
  const { show } = useToast();
  // null = the Telegram-style main list; a section id = that sub-page.
  const [section, setSection] = useState<SectionId | null>(initialSection ?? null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<RoomRole>("member");
  const [canAdminister, setCanAdminister] = useState(false);
  const [settings, setSettings] = useState<Partial<ChannelSettings>>({});
  // Only what the operator actually touched is sent, so a save can never
  // clobber a field another admin changed while this dialog was open.
  const [patch, setPatch] = useState<Partial<ChannelSettings>>({});
  // Loaded here rather than passed in: the caller only had roles if the details
  // drawer happened to have been opened, so the Roles list showed everyone as
  // "Member" even when they were an admin.
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.chat.channelStats>> | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const [statsAttempt, setStatsAttempt] = useState(0);
  const [requests, setRequests] = useState<Awaited<ReturnType<typeof api.chat.joinRequests>>>([]);
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof api.chat.channelSettingsAudit>> | null>(null);

  useEffect(() => {
    setLoading(true);
    api.chat.channelSettings(room.id)
      .then((result) => {
        setSettings(result.settings);
        setRole(result.role);
        setCanAdminister(result.canAdminister);
      })
      .catch((error) => show(error instanceof Error ? error.message : t("channelSettings.loadFailed"), "error"))
      .finally(() => setLoading(false));
  }, [room.id, show, t]);

  useEffect(() => {
    if (!canAdminister) return;
    void api.chat.joinRequests(room.id).then(setRequests).catch(() => setRequests([]));
  }, [room.id, canAdminister]);

  async function resolveRequest(requestId: string, approve: boolean) {
    try {
      await api.chat.resolveJoinRequest(room.id, requestId, approve);
      setRequests((current) => current.filter((entry) => entry.id !== requestId));
      show(t(approve ? "channelSettings.requestApproved" : "channelSettings.requestDeclined"));
      if (approve) onSaved();
    } catch (error) {
      show(error instanceof Error ? error.message : t("channelSettings.saveFailed"), "error");
    }
  }

  useEffect(() => {
    if (!canAdminister) return;
    void api.chat.roomMembers(room.id)
      .then((result) => setMembers(result.items))
      .catch(() => setMembers([]));
  }, [room.id, canAdminister]);

  // Analytics and the audit trail are fetched only when their section is
  // opened — both are heavier than the settings row and most visits never
  // look at them.
  useEffect(() => {
    if (!canAdminister || (section !== "analytics" && section !== "files")) return;
    let active = true;
    setStats(null);
    setStatsFailed(false);
    void api.chat.channelStats(room.id).then(result => { if (active) setStats(result); })
      .catch(() => { if (active) setStatsFailed(true); });
    return () => { active = false; };
  }, [section, room.id, canAdminister, statsAttempt]);

  useEffect(() => {
    if (section === "security" && audit === null && canAdminister) {
      void api.chat.channelSettingsAudit(room.id).then(setAudit).catch(() => setAudit([]));
    }
  }, [section, room.id, canAdminister, audit]);

  const value = useMemo(() => ({ ...settings, ...patch }), [settings, patch]);
  const isOwner = role === "owner";

  /**
   * Members see only the sections that describe the room's rules to them —
   * the server already withholds the rest of the data, so rendering the
   * sections would produce empty panels.
   */
  const visibleSections = useMemo(
    // Preview-only sections stay hidden until something actually enforces them.
    () => (canAdminister ? SECTIONS : SECTIONS.filter((entry) => entry.id === "general" || entry.id === "content"))
      .filter((entry) => !PREVIEW_SECTIONS.has(entry.id)),
    [canAdminister]
  );

  useEffect(() => {
    if (section && !visibleSections.some((entry) => entry.id === section)) setSection(null);
  }, [visibleSections, section]);

  function set<K extends keyof ChannelSettings>(key: K, next: ChannelSettings[K]) {
    setPatch((current) => ({ ...current, [key]: next }));
  }

  async function save() {
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const result = await api.chat.updateChannelSettings(room.id, patch);
      setSettings(result.settings);
      setPatch({});
      show(t("channelSettings.saved"));
      onSaved();
    } catch (error) {
      show(error instanceof Error ? error.message : t("channelSettings.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(memberId: string, next: "admin" | "moderator" | "member") {
    try {
      await api.chat.setMemberRole(room.id, memberId, next);
      setMembers((current) => current.map((member) => member.id === memberId ? { ...member, role: next } : member));
      show(t("channelSettings.roleUpdated"));
      onSaved();
    } catch (error) {
      show(error instanceof Error ? error.message : t("channelSettings.saveFailed"), "error");
    }
  }

  /** The value Telegram shows at the right of each row in the main list. */
  function summaryFor(id: SectionId): string {
    switch (id) {
      case "privacy": return room.scope === "public" ? t("chat.visibilityPublicShort") : t("chat.visibilityPrivateShort");
      case "moderation": {
        const seconds = value.slowModeSeconds ?? 0;
        return seconds === 0 ? t("channelSettings.off") : seconds < 60 ? `${seconds}s` : `${seconds / 60}m`;
      }
      case "content": return value.welcomeMessage ? t("channelSettings.on") : t("channelSettings.off");
      case "notifications": return value.defaultNotifications ? t("channelSettings.on") : t("channelSettings.off");
      case "requests": return requests.length ? String(requests.length) : "";
      default: return "";
    }
  }

  const Toggle = ({ field, label, hint }: { field: keyof ChannelSettings; label: string; hint?: string }) => (
    <label className="cs-toggle">
      <span><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      <input type="checkbox" role="switch" checked={Boolean(value[field])} disabled={!canAdminister}
             onChange={(event) => set(field, event.target.checked as never)} />
      <i className="cs-switch" aria-hidden="true"><b /></i>
    </label>
  );

  const AudienceSelect = ({ field, label }: { field: keyof ChannelSettings; label: string }) => (
    <label className="cs-field">
      <span>{label}</span>
      <select value={String(value[field] ?? "members")} disabled={!canAdminister}
              onChange={(event) => set(field, event.target.value as never)}>
        {AUDIENCES.map((audience) => (
          <option key={audience} value={audience}>{t(`channelSettings.audience.${audience}`)}</option>
        ))}
      </select>
    </label>
  );

  if (loading) return <div className="cs-loading"><Loader2 className="spin" size={22} /></div>;

  return (
    <div className="channel-settings cs-tg">
      {section === null && <div className="cs-list">
        <div className="cs-hero">
          <span className="cs-hero-avatar">{room.avatarUrl ? <img src={room.avatarUrl} alt="" /> : (room.name || "?").trim().charAt(0).toUpperCase()}</span>
          <span className="cs-hero-text">
            <strong>{room.name}</strong>
            <small>{room.type === "channel" ? <Megaphone size={13} /> : <Users size={13} />}{room.scope === "public" ? t("chat.visibilityPublicShort") : t("chat.visibilityPrivateShort")}{room.scope === "public" && room.slug ? ` · ${window.location.host}/${room.type === "channel" ? "ch" : "g"}/${room.slug}` : ""}</small>
          </span>
        </div>
        {[
          ["general", "privacy", "requests", "content", "notifications"],
          ["permissions", "moderation", "files", "security"],
          ["analytics", "meeting", "ai", "integrations", "education"],
          ["danger"],
        ].map((group) => group.filter((id) => visibleSections.some((entry) => entry.id === id))).filter((group) => group.length > 0).map((group) => (
          <div className="cs-list-group" key={group[0]}>
            {group.map((id) => {
              const entry = SECTIONS.find((item) => item.id === id)!;
              const Icon = entry.icon;
              return (
                <button key={id} type="button" className={`cs-list-row${id === "danger" ? " danger" : ""}`} onClick={() => setSection(entry.id)}>
                  <span className={`cs-row-icon tone-${SECTION_TONES[entry.id]}`}><Icon size={17} /></span>
                  <span>{t(`channelSettings.section.${entry.id}`)}</span>
                  {PREVIEW_SECTIONS.has(entry.id) ? <em>{t("channelSettings.previewBadge")}</em> : <small>{summaryFor(entry.id)}</small>}
                  <ChevronRight size={17} />
                </button>
              );
            })}
            {group[0] === "permissions" && canAdminister && (
              <label className="cs-toggle cs-list-switch">
                <span className="cs-row-icon tone-pink"><Heart size={17} /></span>
                <span><strong>{t("channelSettings.reactions")}</strong></span>
                <input type="checkbox" role="switch" checked={Boolean(value.reactionsEnabled)} onChange={(event) => set("reactionsEnabled", event.target.checked)} />
                <i className="cs-switch" aria-hidden="true"><b /></i>
              </label>
            )}
          </div>
        ))}
      </div>}

      {section !== null && <div className="cs-body">
        <button type="button" className="cs-back" onClick={() => setSection(null)}><ArrowLeft size={18} /><span className={`cs-row-icon tone-${SECTION_TONES[section]}`}>{(() => { const Icon = SECTIONS.find((item) => item.id === section)!.icon; return <Icon size={15} />; })()}</span>{t(`channelSettings.section.${section}`)}</button>
        {PREVIEW_SECTIONS.has(section) && (
          <p className="cs-preview-note">
            <Info size={15} />
            {t("channelSettings.previewNote")}
          </p>
        )}

        {section === "general" && <>
          <label className="cs-field"><span>{t("channelSettings.bannerUrl")}</span>
            <input value={value.bannerUrl ?? ""} disabled={!canAdminister} placeholder="https://…"
                   onChange={(event) => set("bannerUrl", event.target.value || null)} /></label>
          <label className="cs-field"><span>{t("channelSettings.language")}</span>
            <select value={value.language ?? ""} disabled={!canAdminister}
                    onChange={(event) => set("language", event.target.value || null)}>
              <option value="">—</option>
              {["uz", "ru", "en", "tr"].map((code) => <option key={code} value={code}>{code.toUpperCase()}</option>)}
            </select></label>
          <label className="cs-field"><span>{t("channelSettings.category")}</span>
            <input value={value.category ?? ""} disabled={!canAdminister} maxLength={40}
                   onChange={(event) => set("category", event.target.value || null)} /></label>
          {room.scope === "public" && room.slug && <p className="cs-readonly">{t("channelSettings.publicLink")}: <code>{window.location.host}/{room.type === "channel" ? "ch" : "g"}/{room.slug}</code></p>}
        </>}

        {section === "requests" && <>
          {requests.length === 0
            ? <p className="cs-readonly">{t("channelSettings.noRequests")}</p>
            : <div className="cs-requests">
                {requests.map((entry) => (
                  <div key={entry.id} className="cs-member">
                    <span><strong>{`${entry.firstName} ${entry.lastName}`.trim()}</strong>
                      <small>{entry.username ? `@${entry.username} · ` : ""}{new Date(entry.createdAt).toLocaleString()}</small></span>
                    <span className="cs-request-actions">
                      <button type="button" className="ghost" onClick={() => void resolveRequest(entry.id, false)}>{t("channelSettings.decline")}</button>
                      <button type="button" className="primary" onClick={() => void resolveRequest(entry.id, true)}>{t("channelSettings.approve")}</button>
                    </span>
                  </div>
                ))}
              </div>}
        </>}

        {section === "privacy" && <>
          <Toggle field="discoverable" label={t("channelSettings.discoverable")} hint={t("channelSettings.discoverableHint")} />
          <Toggle field="allowInviteLinks" label={t("channelSettings.allowInviteLinks")} />
          <Toggle field="joinRequiresApproval" label={t("channelSettings.joinApproval")} />
        </>}

        {section === "permissions" && <>
          <AudienceSelect field="whoCanPost" label={t("channelSettings.whoCanPost")} />
          <label className="cs-field"><span>{t("channelSettings.whoCanComment")}</span>
            <select value={String(value.whoCanComment ?? "subscribers")} disabled={!canAdminister}
                    onChange={(event) => set("whoCanComment", event.target.value as CommentAudience)}>
              {COMMENT_AUDIENCES.map((audience) => (
                <option key={audience} value={audience}>{t(`channelSettings.comment.${audience}`)}</option>
              ))}
            </select></label>
          <AudienceSelect field="whoCanSendMedia" label={t("channelSettings.whoCanSendMedia")} />
          <AudienceSelect field="whoCanSendVoice" label={t("channelSettings.whoCanSendVoice")} />
          <AudienceSelect field="whoCanUploadFiles" label={t("channelSettings.whoCanUploadFiles")} />
          <Toggle field="reactionsEnabled" label={t("channelSettings.reactions")} hint={t("channelSettings.reactionsHint")} />

          {canAdminister && <div className="cs-members">
            <h5>{t("channelSettings.admins")}</h5>
            {members.length === 0 && <p className="cs-readonly">{t("channelSettings.noMembers")}</p>}
            {members.map((member) => (
              <div key={member.id} className="cs-member">
                <span><strong>{`${member.firstName} ${member.lastName}`.trim()}</strong>
                  {member.username && <small>@{member.username}</small>}</span>
                {/* The owner's row is shown but frozen: demoting them is what
                    ownership transfer is for, and the server refuses it here. */}
                <select value={member.role}
                        disabled={member.role === "owner" || member.id === room.createdById}
                        onChange={(event) => void changeRole(member.id, event.target.value as "admin" | "moderator" | "member")}>
                  {member.role === "owner" && <option value="owner">{t("channelSettings.role.owner")}</option>}
                  <option value="member">{t("channelSettings.role.member")}</option>
                  <option value="moderator">{t("channelSettings.role.moderator")}</option>
                  <option value="admin">{t("channelSettings.role.admin")}</option>
                </select>
              </div>
            ))}
          </div>}
        </>}

        {section === "moderation" && <>
          <label className="cs-field"><span>{t("channelSettings.slowMode")}</span>
            <select value={String(value.slowModeSeconds ?? 0)} disabled={!canAdminister}
                    onChange={(event) => set("slowModeSeconds", Number(event.target.value))}>
              {SLOW_MODES.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds === 0 ? t("channelSettings.off") : seconds < 60 ? `${seconds}s` : `${seconds / 60}min`}
                </option>
              ))}
            </select></label>
          <label className="cs-field"><span>{t("channelSettings.autoDelete")}</span>
            <select value={value.autoDeleteDays === null || value.autoDeleteDays === undefined ? "" : String(value.autoDeleteDays)}
                    disabled={!canAdminister}
                    onChange={(event) => set("autoDeleteDays", event.target.value ? Number(event.target.value) : null)}>
              {AUTO_DELETE.map((days) => (
                <option key={String(days)} value={days === null ? "" : String(days)}>
                  {days === null ? t("channelSettings.never") : t("channelSettings.days", { count: days })}
                </option>
              ))}
            </select></label>
          <Toggle field="spamFilter" label={t("channelSettings.spamFilter")} />
          <Toggle field="linkFilter" label={t("channelSettings.linkFilter")} hint={t("channelSettings.linkFilterHint")} />
          <Toggle field="badWordsFilter" label={t("channelSettings.badWordsFilter")} />
          <label className="cs-field"><span>{t("channelSettings.badWords")}</span>
            <textarea rows={3} disabled={!canAdminister} value={(value.badWords ?? []).join(", ")}
                      placeholder={t("channelSettings.badWordsPlaceholder")}
                      onChange={(event) => set("badWords", event.target.value.split(",").map((word) => word.trim()).filter(Boolean))} /></label>
        </>}

        {section === "notifications" && <>
          <Toggle field="defaultNotifications" label={t("channelSettings.defaultNotifications")} />
          <Toggle field="mentionNotifications" label={t("channelSettings.mentionNotifications")} />
          <Toggle field="eventNotifications" label={t("channelSettings.eventNotifications")} />
          <Toggle field="emailNotifications" label={t("channelSettings.emailNotifications")} />
        </>}

        {section === "content" && <>
          <label className="cs-field"><span>{t("channelSettings.welcomeMessage")}</span>
            <textarea rows={3} maxLength={2000} disabled={!canAdminister} value={value.welcomeMessage ?? ""}
                      onChange={(event) => set("welcomeMessage", event.target.value || null)} /></label>
          <label className="cs-field"><span>{t("channelSettings.rules")}</span>
            <textarea rows={5} maxLength={8000} disabled={!canAdminister} value={value.rules ?? ""}
                      onChange={(event) => set("rules", event.target.value || null)} /></label>
          <label className="cs-field"><span>{t("channelSettings.faq")}</span>
            <textarea rows={5} maxLength={8000} disabled={!canAdminister} value={value.faq ?? ""}
                      onChange={(event) => set("faq", event.target.value || null)} /></label>
        </>}

        {section === "analytics" && <>
          {statsFailed ? <div className="cs-stats-error" role="alert"><p>{t("channelSettings.loadFailed")}</p><Button variant="secondary" onClick={() => setStatsAttempt(attempt => attempt + 1)}>{t("common.retry")}</Button></div> : stats === null
            ? <div className="cs-loading"><Loader2 className="spin" size={20} /></div>
            : <>
              <div className="cs-stats">
                <div><strong>{stats.subscribers}</strong><small>{t("channelSettings.subscribers")}</small></div>
                <div><strong>{stats.views}</strong><small>{t("channelSettings.views")}</small></div>
                {/* Reach counts distinct people, not view events — one person
                    scrolling a hundred posts is one person reached. */}
                <div><strong>{stats.reach}</strong><small>{t("channelSettings.reach")}</small></div>
                <div><strong>{stats.messages}</strong><small>{t("channelSettings.messages")}</small></div>
                <div><strong>{stats.engagement}</strong><small>{t("channelSettings.engagement")}</small></div>
                <div><strong>{stats.files}</strong><small>{t("channelSettings.filesCount")}</small></div>
              </div>
              {stats.topPosts.length > 0 && <>
                <h5>{t("channelSettings.topPosts")}</h5>
                <ul className="cs-audit">
                  {stats.topPosts.map((post) => (
                    <li key={post.id}>
                      <b>{(post.content || "—").slice(0, 90)}</b>
                      <small>{post.viewCount} · {new Date(post.createdAt).toLocaleDateString()}</small>
                    </li>
                  ))}
                </ul>
              </>}
              {stats.growth.length > 0 && <>
                <h5>{t("channelSettings.growth")}</h5>
                <ul className="cs-audit">
                  {stats.growth.map((point) => (
                    <li key={point.day}><b>+{point.joined}</b><small>{point.day}</small></li>
                  ))}
                </ul>
              </>}
            </>}
        </>}

        {section === "files" && <>
          <label className="cs-field"><span>{t("channelSettings.maxUpload")}</span>
            <select value={value.maxUploadBytes === null || value.maxUploadBytes === undefined ? "" : String(value.maxUploadBytes)}
                    disabled={!canAdminister}
                    onChange={(event) => set("maxUploadBytes", event.target.value ? Number(event.target.value) : null)}>
              <option value="">{t("channelSettings.platformDefault")}</option>
              {[5, 20, 50, 100].map((mb) => <option key={mb} value={mb * 1024 * 1024}>{mb} MB</option>)}
            </select></label>
          <label className="cs-field"><span>{t("channelSettings.allowedTypes")}</span>
            <input disabled={!canAdminister} value={(value.allowedFileTypes ?? []).join(", ")}
                   placeholder="image/*, application/pdf"
                   onChange={(event) => set("allowedFileTypes", event.target.value.split(",").map((type) => type.trim()).filter(Boolean))} /></label>
          <p className="cs-readonly">{t("channelSettings.storageUsed")}:{" "}
            <code>{stats ? `${(stats.storageBytes / (1024 * 1024)).toFixed(1)} MB · ${stats.files}` : "…"}</code></p>
        </>}

        {section === "security" && <>
          <Toggle field="requireAdmin2fa" label={t("channelSettings.require2fa")} />
          <h5>{t("channelSettings.auditLog")}</h5>
          {audit === null
            ? <div className="cs-loading"><Loader2 className="spin" size={18} /></div>
            : audit.length === 0
              ? <p className="cs-readonly">{t("channelSettings.auditEmpty")}</p>
              : <ul className="cs-audit">
                  {audit.map((entry) => (
                    <li key={entry.id}>
                      <b>{ACTION_LABELS[entry.action] ?? entry.action}</b>
                      {/* The diff, field by field: "slowModeSeconds: 0 → 10". */}
                      {entry.newValue && <span className="cs-audit-diff">
                        {Object.entries(entry.newValue).map(([field, to]) => (
                          <em key={field}>{field}: {String(entry.oldValue?.[field] ?? "—")} → {String(to)}</em>
                        ))}
                      </span>}
                      <small>{`${entry.actorFirstName ?? ""} ${entry.actorLastName ?? ""}`.trim() || "—"}
                        {" · "}{new Date(entry.createdAt).toLocaleString()}</small>
                    </li>
                  ))}
                </ul>}
        </>}

        {section === "meeting" && <>
          <Toggle field="allowMeetings" label={t("channelSettings.allowMeetings")} />
          <Toggle field="allowLiveStream" label={t("channelSettings.allowLiveStream")} />
          <Toggle field="allowScreenShare" label={t("channelSettings.allowScreenShare")} />
          <Toggle field="allowRecording" label={t("channelSettings.allowRecording")} />
          <Toggle field="allowMeetingChat" label={t("channelSettings.allowMeetingChat")} />
        </>}

        {section === "ai" && <>
          <Toggle field="aiModeration" label={t("channelSettings.aiModeration")} />
          <Toggle field="aiSummary" label={t("channelSettings.aiSummary")} />
          <Toggle field="aiTags" label={t("channelSettings.aiTags")} />
          <Toggle field="aiTranslate" label={t("channelSettings.aiTranslate")} />
          <Toggle field="aiSpamDetect" label={t("channelSettings.aiSpamDetect")} />
        </>}

        {section === "integrations" && <>
          {["github", "googleCalendar", "youtube", "webhook"].map((provider) => (
            <label className="cs-field" key={provider}>
              <span>{t(`channelSettings.provider.${provider}`)}</span>
              <input disabled={!canAdminister}
                     value={String((value.integrations as Record<string, string> | undefined)?.[provider] ?? "")}
                     placeholder={t("channelSettings.integrationPlaceholder")}
                     onChange={(event) => set("integrations", {
                       ...(value.integrations ?? {}),
                       [provider]: event.target.value
                     })} />
            </label>
          ))}
        </>}

        {section === "education" && <>
          <Toggle field="trackProgress" label={t("channelSettings.trackProgress")} />
          <Toggle field="autoPostTasks" label={t("channelSettings.autoPostTasks")} />
          <label className="cs-field"><span>{t("channelSettings.minReputation")}</span>
            <input type="number" min={0} disabled={!canAdminister} value={value.minReputation ?? 0}
                   onChange={(event) => set("minReputation", Math.max(0, Number(event.target.value) || 0))} /></label>
          <label className="cs-field"><span>{t("channelSettings.joinQuestions")}</span>
            <textarea rows={3} disabled={!canAdminister} value={(value.joinQuestions ?? []).join("\n")}
                      placeholder={t("channelSettings.joinQuestionsPlaceholder")}
                      onChange={(event) => set("joinQuestions", event.target.value.split("\n").map((line) => line.trim()).filter(Boolean))} /></label>
          {isOwner && <Toggle field="isVerified" label={t("channelSettings.verified")} />}
        </>}

        {section === "danger" && <>
          <p className="cs-readonly">{t("channelSettings.dangerNote")}</p>
          {isOwner
            ? <div className="cs-danger">
                <label className="cs-field"><span>{t("channelSettings.transferOwnership")}</span>
                  <select defaultValue="" onChange={(event) => {
                    const target = event.target.value;
                    event.target.value = "";
                    if (!target) return;
                    void api.chat.transferOwnership(room.id, target)
                      .then(() => { show(t("channelSettings.ownershipTransferred")); onSaved(); })
                      .catch((error) => show(error instanceof Error ? error.message : t("channelSettings.saveFailed"), "error"));
                  }}>
                    <option value="">{t("channelSettings.chooseMember")}</option>
                    {members.filter((member) => member.id !== room.createdById).map((member) => (
                      <option key={member.id} value={member.id}>{`${member.firstName} ${member.lastName}`.trim()}</option>
                    ))}
                  </select></label>
              </div>
            : <p className="cs-readonly">{t("channelSettings.ownerOnly")}</p>}
        </>}
      </div>}

      <footer className="cs-actions">
        {!canAdminister && <span className="cs-readonly"><Bot size={14} /> {t("channelSettings.readOnlyNote")}</span>}
        <Button type="button" variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        {canAdminister && <Button type="button" onClick={() => void save()}
                                  disabled={saving || Object.keys(patch).length === 0}
                                  icon={saving ? <Loader2 className="spin" size={16} /> : <Save size={16} />}>
          {t("common.save")}
        </Button>}
      </footer>
    </div>
  );
}

import { createPortal } from "react-dom";
import { AtSign, Info, LoaderCircle, MessageCircle, Pencil, Phone, Share2, ShieldCheck, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";
import { formatPresenceLabel, isPresenceActive, usePresence } from "../lib/presence";
import { closeProfile, useOpenProfile } from "../lib/profileModal";
import { Avatar, DisplayName } from "./ui";
import { useToast } from "./Toast";
import { useDialogFocus } from "../lib/useDialogFocus";

type Profile = Awaited<ReturnType<typeof api.users.publicProfile>>;

/** Telegram-style profile card: avatar, name, last seen, actions, username, bio, channel. */
export function UserProfileModal() {
  const identifier = useOpenProfile();
  const { user } = useAuth();
  const { t } = useI18n();
  const { show } = useToast();
  const [, navigate] = useLocation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);
  const presence = usePresence(profile?.id);
  const modalRef = useRef<HTMLElement>(null);
  useDialogFocus(Boolean(identifier), modalRef, closeProfile);

  useEffect(() => {
    setProfile(null);
    setFailed(false);
    if (!identifier) return;
    let cancelled = false;
    api.users.publicProfile(identifier)
      .then((result) => { if (!cancelled) setProfile(result); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [identifier]);

  if (!identifier) return null;

  const handle = profile ? (profile.accountVisibility === "private" ? String(profile.publicId) : profile.username || String(profile.publicId)) : identifier;
  const profileUrl = `${window.location.origin}/profile/${handle}`;
  const isMe = !!profile && String(profile.publicId) === String(user?.publicId);
  // A private account keeps its username to itself.
  const showUsername = !!profile?.username && (isMe || profile.accountVisibility !== "private");

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); show(t("publicProfile.linkCopied")); } catch { show(text); }
  }

  async function share() {
    if (navigator.share) {
      try { await navigator.share({ url: profileUrl }); return; } catch { /* cancelled — fall back to copying */ }
    }
    await copy(profileUrl);
  }

  return createPortal(<div className="modal-layer upm-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeProfile()}>
    <section ref={modalRef} tabIndex={-1} className="upm" role="dialog" aria-modal="true" aria-label={profile ? `${profile.firstName} ${profile.lastName}` : t("publicProfile.profileLink")}>
      <div className="upm-top-actions">
        {isMe && <button type="button" onClick={() => { closeProfile(); navigate("/profile"); }} aria-label={t("publicProfile.editProfile")} title={t("publicProfile.editProfile")}><Pencil size={18} /></button>}
        {isMe && <button type="button" onClick={() => void share()} aria-label={t("publicProfile.share")} title={t("publicProfile.share")}><Share2 size={18} /></button>}
        <button type="button" onClick={closeProfile} aria-label={t("publicProfile.closeAria")}><X size={20} /></button>
      </div>
      {!profile && !failed && <div className="upm-loading"><LoaderCircle className="spin" size={24} /></div>}
      {failed && <div className="upm-loading"><UserRound size={32} /><strong>{t("publicProfile.notFoundTitle")}</strong><small>{t("publicProfile.notFoundDesc")}</small></div>}
      {profile && <>
        <section className={`tg-info-hero upm-hero ${isMe ? "is-me" : ""}`}>
          <span className="upm-avatar"><Avatar firstName={profile.firstName} lastName={profile.lastName} url={profile.avatarUrl} size="xl" />{isPresenceActive(presence) && <i />}</span>
          <strong className="upm-name"><DisplayName firstName={profile.firstName} lastName={profile.lastName} nickname={profile.nickname} nameEmoji={profile.nameEmoji} />{profile.isSuperAdmin && <span className="admin-tick" title={t("profile.superAdminBadge")} aria-label={t("profile.superAdminBadge")}><ShieldCheck size={13} strokeWidth={2.6} /></span>}</strong>
          <small className={isPresenceActive(presence) || isMe ? "online" : ""}>{isMe ? t("presence.online") : formatPresenceLabel(presence, t)}</small>
        </section>
        {!isMe && <div className="tg-info-actions upm-actions">
          {user && !isMe && <button type="button" onClick={() => { closeProfile(); navigate(`/u/${handle}`); }}><MessageCircle size={19} /><span>{t("publicProfile.message")}</span></button>}
          {user && !isMe && <button type="button" onClick={() => { try { sessionStorage.setItem("optima:pending-call", "audio"); } catch { /* storage off */ } closeProfile(); navigate(`/u/${handle}`); }}><Phone size={19} /><span>{t("publicProfile.call")}</span></button>}
          <button type="button" onClick={() => void share()}><Share2 size={19} /><span>{t("publicProfile.share")}</span></button>
        </div>}
        {profile.channels && profile.channels.length > 0 && <section className="tg-info-section upm-channels">
          {profile.channels.map((channel) => (
            <button key={channel.id} type="button" className="upm-channel" onClick={() => { closeProfile(); navigate(`/ch/${channel.slug}`); }}>
              <span className="upm-channel-avatar">{channel.avatarUrl ? <img src={channel.avatarUrl} alt="" /> : channel.name.charAt(0).toUpperCase()}</span>
              <span className="tg-info-text"><strong>{channel.name}</strong><small>{t("publicProfile.channelSubtitle", { count: channel.memberCount })}</small></span>
            </button>
          ))}
        </section>}
        {(profile.bio || showUsername) && <section className="tg-info-section">
          {profile.bio && <div className="tg-info-row">
            <Info size={20} /><span className="tg-info-text"><strong className="multiline">{profile.bio}</strong><small>{t("publicProfile.bioLabel")}</small></span>
          </div>}
          {showUsername && <button type="button" className="tg-info-row" onClick={() => void copy(`@${profile.username}`)}>
            <AtSign size={20} /><span className="tg-info-text"><strong className="link">@{profile.username}</strong><small>{t("publicProfile.usernameLabel")}</small></span>
          </button>}
        </section>}
      </>}
    </section>
  </div>, document.body);
}

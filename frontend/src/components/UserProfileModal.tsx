import { AtSign, Info, Link2, LoaderCircle, Megaphone, MessageCircle, Share2, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";
import { formatPresenceLabel, isPresenceActive, usePresence } from "../lib/presence";
import { closeProfile, useOpenProfile } from "../lib/profileModal";
import { Avatar, DisplayName } from "./ui";
import { useToast } from "./Toast";

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

  useEffect(() => {
    if (!identifier) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeProfile(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [identifier]);

  if (!identifier) return null;

  const handle = profile ? profile.username || String(profile.publicId) : identifier;
  const profileUrl = `${window.location.origin}/profile/${handle}`;
  const isMe = !!profile && String(profile.publicId) === String(user?.publicId);

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); show(t("publicProfile.linkCopied")); } catch { show(text); }
  }

  async function share() {
    if (navigator.share) {
      try { await navigator.share({ url: profileUrl }); return; } catch { /* cancelled — fall back to copying */ }
    }
    await copy(profileUrl);
  }

  return <div className="modal-layer upm-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeProfile()}>
    <section className="upm" role="dialog" aria-modal="true" aria-label={profile ? `${profile.firstName} ${profile.lastName}` : t("publicProfile.profileLink")}>
      <button type="button" className="upm-close" onClick={closeProfile} aria-label={t("publicProfile.closeAria")}><X size={20} /></button>
      {!profile && !failed && <div className="upm-loading"><LoaderCircle className="spin" size={24} /></div>}
      {failed && <div className="upm-loading"><UserRound size={32} /><strong>{t("publicProfile.notFoundTitle")}</strong><small>{t("publicProfile.notFoundDesc")}</small></div>}
      {profile && <>
        <section className="tg-info-hero upm-hero">
          <span className="upm-avatar"><Avatar firstName={profile.firstName} lastName={profile.lastName} url={profile.avatarUrl} size="xl" />{isPresenceActive(presence) && <i />}</span>
          <strong><DisplayName firstName={profile.firstName} lastName={profile.lastName} nickname={profile.nickname} nameEmoji={profile.nameEmoji} /></strong>
          <small className={isPresenceActive(presence) ? "online" : ""}>{isMe ? t("publicProfile.thisIsYou") : formatPresenceLabel(presence, t)}</small>
        </section>
        <div className="tg-info-actions">
          {user && !isMe && <button type="button" onClick={() => { closeProfile(); navigate(`/u/${handle}`); }}><MessageCircle size={20} /><span>{t("publicProfile.message")}</span></button>}
          <button type="button" onClick={() => void share()}><Share2 size={20} /><span>{t("publicProfile.share")}</span></button>
        </div>
        <section className="tg-info-section">
          {profile.username && <button type="button" className="tg-info-row" onClick={() => void copy(`@${profile.username}`)}>
            <AtSign size={20} /><span className="tg-info-text"><strong className="link">@{profile.username}</strong><small>{t("publicProfile.usernameLabel")}</small></span>
          </button>}
          {profile.bio && <div className="tg-info-row">
            <Info size={20} /><span className="tg-info-text"><strong className="multiline">{profile.bio}</strong><small>{t("publicProfile.bioLabel")}</small></span>
          </div>}
          {profile.channels?.map((channel) => (
            <button key={channel.id} type="button" className="tg-info-row" onClick={() => { closeProfile(); navigate(`/ch/${channel.slug}`); }}>
              <Megaphone size={20} /><span className="tg-info-text"><strong>{channel.name}</strong><small>{t("publicProfile.channelLabel")} · {window.location.host}/ch/{channel.slug} · {t("publicProfile.subscribers", { count: channel.memberCount })}</small></span>
            </button>
          ))}
          <button type="button" className="tg-info-row" onClick={() => void copy(profileUrl)}>
            <Link2 size={20} /><span className="tg-info-text"><strong className="link">{profileUrl.replace(/^https?:\/\//, "")}</strong><small>{t("publicProfile.profileLink")}</small></span>
          </button>
        </section>
      </>}
    </section>
  </div>;
}

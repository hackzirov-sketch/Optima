import { ArrowLeft, AtSign, Copy, Link2, LoaderCircle, MessageCircle, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Avatar, DisplayName, Logo } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";
import { formatPresenceLabel, isPresenceActive, usePresence } from "../lib/presence";
import type { User } from "../types";

type PublicProfile = Pick<User, "id" | "publicId" | "firstName" | "lastName" | "username" | "nickname" | "avatarUrl" | "nameEmoji">;

export function PublicProfilePage({ identifier }: { identifier: string }) {
  const { user, group } = useAuth();
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const presence = usePresence(profile?.id);

  useEffect(() => {
    api.users.publicProfile(identifier).then(setProfile).catch(() => setFailed(true));
  }, [identifier]);

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
  }

  function openChat() {
    if (!profile?.publicId || !group) return;
    if (String(profile.publicId) === String(user?.publicId)) {
      navigate("/chat");
      return;
    }
    // /u/:identifier resolves (and find-or-creates) the DM room itself - see
    // the chat route redesign's GET /chat/resolve/direct/:identifier.
    navigate(`/u/${profile.username || profile.publicId}`);
  }

  return <main className="public-profile-page">
    <header>
      <button className="public-profile-back" onClick={() => window.history.length > 1 ? window.history.back() : navigate("/chat")} aria-label={t("publicProfile.backAria")}><ArrowLeft size={20} /></button>
      <Logo />
    </header>
    <section className="public-profile-card">
      {!profile && !failed && <LoaderCircle className="spin" size={24} />}
      {failed && <><UserRound size={32} /><h1>{t("publicProfile.notFoundTitle")}</h1><p>{t("publicProfile.notFoundDesc")}</p></>}
      {profile && <>
        <div className="public-profile-hero">
          <Avatar firstName={profile.firstName} lastName={profile.lastName} url={profile.avatarUrl} size="xl" />
          {isPresenceActive(presence) && <span className="public-profile-presence" />}
          <h1><DisplayName firstName={profile.firstName} lastName={profile.lastName} nickname={profile.nickname} nameEmoji={profile.nameEmoji} /></h1>
          <p>{profile.username ? `@${profile.username}` : t("publicProfile.usernameNotSet")}</p>
          <p className="public-profile-status">{formatPresenceLabel(presence, t)}</p>
        </div>
        {user && <button className="public-profile-message" onClick={openChat} disabled={!group}>
          <MessageCircle size={19} />
          <span><strong>{t("publicProfile.chatTitle")}</strong><small>{String(profile.publicId) === String(user.publicId) ? t("publicProfile.backToChats") : t("publicProfile.openPersonalChat")}</small></span>
        </button>}
        <div className="public-profile-info">
          <div><AtSign size={18} /><span><strong>{profile.username ? `@${profile.username}` : t("common.notSet")}</strong><small>{t("publicProfile.usernameLabel")}</small></span></div>
          <button onClick={() => void copy(window.location.href)}><Link2 size={18} /><span><strong>{t("publicProfile.profileLink")}</strong><small>{t("publicProfile.clickToCopy")}</small></span><Copy size={17} /></button>
        </div>
      </>}
    </section>
  </main>;
}

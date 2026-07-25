import { ArrowLeft, AtSign, Copy, Hash, Link2, LoaderCircle, MessageCircle, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Avatar, Logo } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";
import type { User } from "../types";

type PublicProfile = Pick<User, "publicId" | "firstName" | "lastName" | "username" | "avatarUrl">;

export function PublicProfilePage({ identifier }: { identifier: string }) {
  const { user, workspace } = useAuth();
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [chatError, setChatError] = useState("");

  useEffect(() => {
    api.users.publicProfile(identifier).then(setProfile).catch(() => setFailed(true));
  }, [identifier]);

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
  }

  async function openChat() {
    if (!profile?.publicId || !workspace || openingChat) return;
    if (String(profile.publicId) === String(user?.publicId)) {
      navigate("/chat");
      return;
    }
    setChatError("");
    setOpeningChat(true);
    try {
      const room = await api.chat.createRoom(workspace.id, { type: "direct", targetPublicId: profile.publicId });
      window.location.assign(`/chat?room=${encodeURIComponent(room.id)}`);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : t("publicProfile.chatOpenFailed"));
    } finally {
      setOpeningChat(false);
    }
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
          <span className="public-profile-presence" />
          <h1>{profile.firstName} {profile.lastName}</h1>
          <p>{profile.username ? `@${profile.username}` : t("publicProfile.usernameNotSet")}</p>
        </div>
        {user && <button className="public-profile-message" onClick={() => void openChat()} disabled={!workspace || openingChat}>
          {openingChat ? <LoaderCircle className="spin" size={19} /> : <MessageCircle size={19} />}
          <span><strong>{t("publicProfile.chatTitle")}</strong><small>{String(profile.publicId) === String(user.publicId) ? t("publicProfile.backToChats") : t("publicProfile.openPersonalChat")}</small></span>
        </button>}
        {chatError && <p className="public-profile-error">{chatError}</p>}
        <div className="public-profile-info">
          <div><AtSign size={18} /><span><strong>{profile.username ? `@${profile.username}` : t("common.notSet")}</strong><small>{t("publicProfile.usernameLabel")}</small></span></div>
          <div><Hash size={18} /><span><strong>{profile.publicId}</strong><small>{t("publicProfile.userId")}</small></span><button onClick={() => void copy(profile.publicId || "")} aria-label={t("publicProfile.copyIdAria")}><Copy size={17} /></button></div>
          <button onClick={() => void copy(window.location.href)}><Link2 size={18} /><span><strong>{t("publicProfile.profileLink")}</strong><small>{t("publicProfile.clickToCopy")}</small></span><Copy size={17} /></button>
        </div>
      </>}
    </section>
  </main>;
}
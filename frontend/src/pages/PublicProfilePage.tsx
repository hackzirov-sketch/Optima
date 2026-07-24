import { ArrowLeft, AtSign, Copy, Hash, Link2, LoaderCircle, MessageCircle, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Avatar, Logo } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { User } from "../types";

type PublicProfile = Pick<User, "publicId" | "firstName" | "lastName" | "username" | "avatarUrl">;

export function PublicProfilePage({ identifier }: { identifier: string }) {
  const { user, workspace } = useAuth();
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
      setChatError(error instanceof Error ? error.message : "Shaxsiy suhbat ochilmadi");
    } finally {
      setOpeningChat(false);
    }
  }

  return <main className="public-profile-page">
    <header>
      <button className="public-profile-back" onClick={() => window.history.length > 1 ? window.history.back() : navigate("/chat")} aria-label="Ortga qaytish"><ArrowLeft size={20} /></button>
      <Logo />
    </header>
    <section className="public-profile-card">
      {!profile && !failed && <LoaderCircle className="spin" size={24} />}
      {failed && <><UserRound size={32} /><h1>Profil topilmadi</h1><p>Havolani tekshirib qayta urinib ko‘ring.</p></>}
      {profile && <>
        <div className="public-profile-hero">
          <Avatar firstName={profile.firstName} lastName={profile.lastName} url={profile.avatarUrl} size="xl" />
          <span className="public-profile-presence" />
          <h1>{profile.firstName} {profile.lastName}</h1>
          <p>{profile.username ? `@${profile.username}` : "Username o‘rnatilmagan"}</p>
        </div>
        {user && <button className="public-profile-message" onClick={() => void openChat()} disabled={!workspace || openingChat}>
          {openingChat ? <LoaderCircle className="spin" size={19} /> : <MessageCircle size={19} />}
          <span><strong>Suhbat</strong><small>{String(profile.publicId) === String(user.publicId) ? "Chatlarga qaytish" : "Shaxsiy suhbatni ochish"}</small></span>
        </button>}
        {chatError && <p className="public-profile-error">{chatError}</p>}
        <div className="public-profile-info">
          <div><AtSign size={18} /><span><strong>{profile.username ? `@${profile.username}` : "O‘rnatilmagan"}</strong><small>Username</small></span></div>
          <div><Hash size={18} /><span><strong>{profile.publicId}</strong><small>Foydalanuvchi ID</small></span><button onClick={() => void copy(profile.publicId || "")} aria-label="ID ni nusxalash"><Copy size={17} /></button></div>
          <button onClick={() => void copy(window.location.href)}><Link2 size={18} /><span><strong>Profil havolasi</strong><small>Nusxalash uchun bosing</small></span><Copy size={17} /></button>
        </div>
      </>}
    </section>
  </main>;
}

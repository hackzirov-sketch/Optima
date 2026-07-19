import { Copy, Link2, LoaderCircle, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, Logo } from "../components/ui";
import { api } from "../lib/api";
import type { User } from "../types";

type PublicProfile = Pick<User, "publicId" | "firstName" | "lastName" | "username" | "avatarUrl">;

export function PublicProfilePage({ identifier }: { identifier: string }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api.users.publicProfile(identifier).then(setProfile).catch(() => setFailed(true));
  }, [identifier]);

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
  }

  return <main className="public-profile-page">
    <header><Logo /></header>
    <section className="public-profile-card">
      {!profile && !failed && <LoaderCircle className="spin" size={24} />}
      {failed && <><UserRound size={32} /><h1>Profil topilmadi</h1><p>Havolani tekshirib qayta urinib ko‘ring.</p></>}
      {profile && <>
        <Avatar firstName={profile.firstName} lastName={profile.lastName} url={profile.avatarUrl} size="xl" />
        <h1>{profile.firstName} {profile.lastName}</h1>
        <p>{profile.username ? `@${profile.username}` : "Username o‘rnatilmagan"}</p>
        <div className="public-profile-id"><span>ID: <strong>{profile.publicId}</strong></span><button className="icon-button" onClick={() => void copy(profile.publicId || "")} aria-label="ID ni nusxalash"><Copy size={17} /></button><button className="icon-button" onClick={() => void copy(window.location.href)} aria-label="Profil linkini nusxalash"><Link2 size={17} /></button></div>
      </>}
    </section>
  </main>;
}

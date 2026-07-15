import { ArrowRight, Building2, CheckCircle2, MessageCircle, Video } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Button, Logo } from "../components/ui";
import { useAuth } from "../lib/auth";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function WorkspaceSetupPage() {
  const { user, createWorkspace, logout } = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (name || !user?.firstName) return;
    const suggestedName = `${user.firstName} Workspace`;
    setName(suggestedName);
    setSlug(`${slugify(suggestedName)}-${Date.now().toString(36)}`);
  }, [name, user?.firstName]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const workspaceName = name.trim();
    if (!workspaceName) {
      setError("Workspace nomini kiriting");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await createWorkspace({ name: workspaceName, slug: slug || `${slugify(workspaceName)}-${Date.now().toString(36)}` });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Workspace yaratilmadi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="setup-page">
      <header className="setup-top"><Logo /><button className="text-button" onClick={() => void logout()}>Boshqa hisob</button></header>
      <section className="setup-layout">
        <div className="setup-copy">
          <p className="eyebrow">Salom, {user?.firstName}</p>
          <h1>Birinchi workspace’ingizni yarating.</h1>
          <p>Jamoa a’zolari, chatlar va meetinglar shu joyda birlashadi.</p>
          <ul>
            <li><CheckCircle2 size={18} /> `general` chat avtomatik yaratiladi</li>
            <li><MessageCircle size={18} /> Guruh va shaxsiy suhbatlar</li>
            <li><Video size={18} /> Kamera va mikrofonli meeting</li>
          </ul>
        </div>
        <form className="setup-form" onSubmit={submit}>
          <span className="setup-icon"><Building2 size={24} /></span>
          <h2>Workspace ma’lumoti</h2>
          <p>Keyinroq sozlamalardan o‘zgartira olasiz.</p>
          {error && <div className="form-error" role="alert">{error}</div>}
          <label>Nomi<input value={name} onChange={(event) => { setName(event.target.value); setSlug(slugify(event.target.value)); }} placeholder="Masalan: Optima Team" maxLength={100} autoFocus required /></label>
          <label>Manzil<span className="slug-input"><span>optima.app/</span><input value={slug} onChange={(event) => setSlug(slugify(event.target.value))} placeholder="optima-team" maxLength={100} required /></span></label>
          <Button type="submit" loading={loading} icon={<ArrowRight size={17} />}>Workspace yaratish</Button>
        </form>
      </section>
    </main>
  );
}

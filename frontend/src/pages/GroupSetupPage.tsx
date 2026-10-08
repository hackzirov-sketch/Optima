import { ArrowRight, Building2, CheckCircle2, MessageCircle, Video } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Button, Logo } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function GroupSetupPage() {
  const { user, createWorkspace, logout } = useAuth();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const suggested = useRef(false);

  useEffect(() => {
    if (suggested.current || !user?.firstName) return;
    suggested.current = true;
    const suggestedName = `${user.firstName} Group`;
    setName(suggestedName);
    setSlug(`${slugify(suggestedName)}-${Date.now().toString(36)}`);
  }, [user?.firstName]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const groupName = name.trim();
    if (!groupName) {
      setError(t("groupSetup.nameRequired"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      await createWorkspace({ name: groupName, slug: slug || `${slugify(groupName)}-${Date.now().toString(36)}` });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("groupSetup.createFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="setup-page">
      <header className="setup-top"><Logo /><button className="text-button" onClick={() => void logout()}>{t("groupSetup.switchAccount")}</button></header>
      <section className="setup-layout">
        <div className="setup-copy">
          <p className="eyebrow">{t("groupSetup.greeting", { name: user?.firstName || "" })}</p>
          <h1>{t("groupSetup.heading")}</h1>
          <p>{t("groupSetup.description")}</p>
          <ul>
            <li><CheckCircle2 size={18} /> {t("groupSetup.bulletGeneralChat")}</li>
            <li><MessageCircle size={18} /> {t("groupSetup.bulletConversations")}</li>
            <li><Video size={18} /> {t("groupSetup.bulletMeetings")}</li>
          </ul>
        </div>
        <form className="setup-form" onSubmit={submit}>
          <span className="setup-icon"><Building2 size={24} /></span>
          <h2>{t("groupSetup.formTitle")}</h2>
          <p>{t("groupSetup.formDescription")}</p>
          {error && <div className="form-error" role="alert">{error}</div>}
          <label>{t("groupSetup.nameLabel")}<input value={name} onChange={(event) => { setName(event.target.value); if (!slugEdited) setSlug(slugify(event.target.value)); }} placeholder={t("groupSetup.namePlaceholder")} maxLength={100} autoFocus required /></label>
          <label>{t("groupSetup.addressLabel")}<span className="slug-input"><span>optima.app/</span><input value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.target.value)); }} placeholder={t("groupSetup.addressPlaceholder")} maxLength={100} required /></span></label>
          <Button type="submit" loading={loading} icon={<ArrowRight size={17} />}>{t("groupSetup.createButton")}</Button>
        </form>
      </section>
    </main>
  );
}
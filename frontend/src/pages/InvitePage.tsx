import { ArrowRight, Check, Link2, LoaderCircle, MailCheck } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { Button, Logo } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";

interface InvitePageProps {
  kind: "chat" | "workspace";
  token: string;
}

export function InvitePage({ kind, token }: InvitePageProps) {
  const { refreshWorkspaces, selectWorkspace } = useAuth();
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    setLoading(true);
    setError("");
    try {
      if (kind === "chat") {
        const room = await api.chat.joinByCode(token);
        const items = await refreshWorkspaces();
        const target = items.find((item) => item.id === room.workspaceId);
        if (target) selectWorkspace(target);
        navigate(`/chat?room=${room.id}`);
        return;
      }

      const membership = await api.invitations.accept(token);
      const items = await refreshWorkspaces();
      const target = items.find((item) => item.id === membership.workspaceId);
      if (target) selectWorkspace(target);
      navigate("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("invite.acceptFailed"));
    } finally {
      setLoading(false);
    }
  }

  const chat = kind === "chat";
  return (
    <main className="invite-page">
      <header><Logo /></header>
      <section className="invite-panel">
        <span className="invite-panel-icon">{chat ? <Link2 size={26} /> : <MailCheck size={26} />}</span>
        <p className="eyebrow">{t("invite.eyebrow")}</p>
        <h1>{chat ? t("invite.chatTitle") : t("invite.workspaceTitle")}</h1>
        <p>{chat ? t("invite.chatDescription") : t("invite.workspaceDescription")}</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <Button onClick={() => void accept()} loading={loading} icon={loading ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}>{t("invite.acceptButton")}</Button>
        <button className="invite-skip" onClick={() => navigate("/")}>{t("invite.skip")} <ArrowRight size={15} /></button>
      </section>
    </main>
  );
}
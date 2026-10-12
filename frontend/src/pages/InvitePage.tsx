import { ArrowRight, Check, Link2, LoaderCircle, MailCheck } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { Button, Logo } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";

interface InvitePageProps {
  kind: "chat" | "group";
  token: string;
}

export function InvitePage({ kind, token }: InvitePageProps) {
  const { refreshWorkspaces, selectWorkspace } = useAuth();
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Set once a private room took the link as an ask-to-join request.
  const [requested, setRequested] = useState<"group" | "channel" | null>(null);

  async function accept() {
    setLoading(true);
    setError("");
    try {
      if (kind === "chat") {
        const room = await api.chat.joinByCode(token);
        if ("joinRequested" in room) {
          setRequested(room.type === "channel" ? "channel" : "group");
          return;
        }
        const items = await refreshWorkspaces();
        const target = items.find((item) => item.id === room.groupId);
        if (target) selectWorkspace(target);
        navigate(`/chat?room=${room.id}`);
        return;
      }

      const membership = await api.invitations.accept(token);
      const items = await refreshWorkspaces();
      const target = items.find((item) => item.id === membership.groupId);
      if (target) selectWorkspace(target);
      navigate("/chat");
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
        {requested ? <>
          <h1>{t("invite.requestSentTitle")}</h1>
          <p>{t("invite.requestSentDesc", { kind: t(requested === "channel" ? "invite.kindChannel" : "invite.kindGroup") })}</p>
          <Button onClick={() => navigate("/chat")} icon={<ArrowRight size={17} />}>{t("invite.goToChats")}</Button>
        </> : <>
          <h1>{chat ? t("invite.chatTitle") : t("invite.groupTitle")}</h1>
          <p>{chat ? t("invite.chatDescription") : t("invite.groupDescription")}</p>
          {error && <div className="form-error" role="alert">{error}</div>}
          <Button onClick={() => void accept()} loading={loading} icon={loading ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}>{t("invite.acceptButton")}</Button>
          <button className="invite-skip" onClick={() => navigate("/")}>{t("invite.skip")} <ArrowRight size={15} /></button>
        </>}
      </section>
    </main>
  );
}
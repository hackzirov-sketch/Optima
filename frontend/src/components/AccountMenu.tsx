import { LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";
import type { PresenceStatus } from "../lib/presence";
import { openProfile } from "../lib/profileModal";
import { adminSiteUrl } from "../lib/cdn";
import { Avatar, DisplayName } from "./ui";

type Status = Exclude<PresenceStatus, "offline" | "in_meeting">;

/** The round avatar (top bar, chat list header): Profile · Settings · Log out. */
export function AccountMenu({ status = "online", align = "end" }: { status?: Status; align?: "start" | "end" }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  // Closes on a click/tap anywhere else and on Escape. (A full-screen scrim
  // didn't work: the top bar's backdrop-filter traps fixed children inside it.)
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown, true); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return <div className="account-menu-wrap" ref={wrap}>
              <button type="button" className="account-avatar-button" onClick={() => setOpen((value) => !value)} aria-label={t("shell.accountMenu")} aria-haspopup="menu" aria-expanded={open}>
                <Avatar firstName={user?.firstName} lastName={user?.lastName} url={user?.avatarUrl} size="sm" />
                <i className={`account-status-dot status-${status}`} aria-hidden="true" />
              </button>
              {open && <>
                <div className={`account-menu align-${align}`} role="menu">
                  <div className="account-menu-head">
                    <Avatar firstName={user?.firstName} lastName={user?.lastName} url={user?.avatarUrl} size="md" />
                    <span><strong><DisplayName firstName={user?.firstName} lastName={user?.lastName} nickname={user?.nickname} nameEmoji={user?.nameEmoji} /></strong>{user?.username && <small>@{user.username}</small>}</span>
                  </div>
                  <button type="button" role="menuitem" onClick={() => { setOpen(false); openProfile(user?.username || user?.publicId); }}><UserRound size={18} />{t("shell.myProfile")}</button>
                  <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate("/profile"); }}><Settings size={18} />{t("shell.settingsMenu")}</button>
                  {user?.isSuperAdmin && <button type="button" role="menuitem" onClick={() => { setOpen(false); const url = adminSiteUrl(); if (url.startsWith("http")) window.open(url, "_blank", "noopener"); else navigate(url); }}><ShieldCheck size={18} />{t("admin.title")}</button>}
                  <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); void logout(); }}><LogOut size={18} />{t("shell.logout")}</button>
                </div>
              </>}
  </div>;
}

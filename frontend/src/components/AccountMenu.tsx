import { LogOut, Settings, UserRound } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n/i18n";
import { setMyPresenceStatus, type PresenceStatus } from "../lib/presence";
import { openProfile } from "../lib/profileModal";
import { Avatar, DisplayName } from "./ui";

type Status = Exclude<PresenceStatus, "offline" | "in_meeting">;
const STATUSES: Status[] = ["online", "away", "busy", "dnd", "invisible"];

/** The round avatar (top bar, chat list header): Profile · Settings · status · Log out. */
export function AccountMenu({ status: controlled, onStatus, align = "end" }: { status?: Status; onStatus?: (status: Status) => void; align?: "start" | "end" }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState<Status>("online");
  const status = controlled ?? own;
  const choose = (next: Status) => {
    if (onStatus) onStatus(next);
    else { setOwn(next); setMyPresenceStatus(next); }
  };
  return <div className="account-menu-wrap">
              <button type="button" className="account-avatar-button" onClick={() => setOpen((value) => !value)} aria-label={t("shell.accountMenu")} aria-haspopup="menu" aria-expanded={open}>
                <Avatar firstName={user?.firstName} lastName={user?.lastName} url={user?.avatarUrl} size="sm" />
                <i className={`account-status-dot status-${status}`} aria-hidden="true" />
              </button>
              {open && <>
                <button type="button" className="account-menu-scrim" onClick={() => setOpen(false)} aria-hidden="true" tabIndex={-1} />
                <div className={`account-menu align-${align}`} role="menu">
                  <div className="account-menu-head">
                    <Avatar firstName={user?.firstName} lastName={user?.lastName} url={user?.avatarUrl} size="md" />
                    <span><strong><DisplayName firstName={user?.firstName} lastName={user?.lastName} nickname={user?.nickname} nameEmoji={user?.nameEmoji} /></strong>{user?.username && <small>@{user.username}</small>}</span>
                  </div>
                  <button type="button" role="menuitem" onClick={() => { setOpen(false); openProfile(user?.username || user?.publicId); }}><UserRound size={18} />{t("shell.myProfile")}</button>
                  <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate("/profile"); }}><Settings size={18} />{t("shell.settingsMenu")}</button>
                  <div className="account-menu-status" role="group" aria-label={t("shell.status")}>
                    {STATUSES.map((option) => (
                      <button key={option} type="button" className={status === option ? "active" : ""} onClick={() => choose(option)} title={t(`presence.${option}`)} aria-label={t(`presence.${option}`)}>
                        <i className={`account-status-dot status-${option}`} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                  <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); void logout(); }}><LogOut size={18} />{t("shell.logout")}</button>
                </div>
              </>}
  </div>;
}

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Maximize2,
  MessageCircle,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  Phone,
  PhoneOff,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChatRoom, ChatUser } from "@/types";
import { Avatar, RoomGlyph, cn, getRoomName, getRoomPeer, getUser } from "./chatShared";
import type { ChatCallMode } from "./ChatHeader";

interface ChatCallOverlayProps {
  room: ChatRoom;
  users: ChatUser[];
  mode: ChatCallMode;
  startedAt: number;
  onClose: () => void;
  onSwitchMode: (mode: ChatCallMode) => void;
}

interface CallControlProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
}

const participantStatusKeys = ["speaking", "online", "muted", "listening", "cameraOff", "joining"] as const;

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function CallControl({ icon: Icon, label, active, danger, onClick }: CallControlProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group grid h-12 w-12 place-items-center rounded-2xl border text-white shadow-lg transition-all hover:-translate-y-0.5 active:scale-95 sm:h-14 sm:w-14",
        danger
          ? "border-rose-400/30 bg-rose-500 shadow-rose-950/30 hover:bg-rose-400"
          : active
            ? "border-white/25 bg-white/20 shadow-black/20 hover:bg-white/25"
            : "border-white/10 bg-slate-950/55 shadow-black/20 hover:bg-slate-800",
      )}
      aria-label={label}
      title={label}
    >
      <Icon className="h-5 w-5 transition-transform group-hover:scale-105" />
    </button>
  );
}

function CallAvatarStack({ room, users }: { room: ChatRoom; users: ChatUser[] }) {
  const stackedUsers = room.memberIds
    .slice(0, 5)
    .map((memberId) => getUser(memberId, users))
    .filter((user): user is ChatUser => Boolean(user));

  return (
    <div className="flex items-center justify-center -space-x-4">
      {stackedUsers.map((member) => (
        <Avatar key={member.id} user={member} size={64} className="rounded-full ring-4 ring-[#0B1120]" />
      ))}
    </div>
  );
}

function ParticipantVideoTile({
  user,
  index,
  compact,
}: {
  user: ChatUser;
  index: number;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const statusKey = participantStatusKeys[index % participantStatusKeys.length];
  const cameraOff = statusKey === "cameraOff";
  const speaking = statusKey === "speaking";
  const displayName = user.id === "me" ? t("app.chat.you") : user.name;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.035 }}
      className={cn(
        "relative min-h-[148px] overflow-hidden rounded-[28px] border bg-slate-950/65 p-4 shadow-2xl shadow-black/25",
        speaking ? "border-indigo-300/70 ring-4 ring-indigo-400/15" : "border-white/10",
        compact && "min-h-[120px] rounded-[24px]",
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(99,102,241,0.38),transparent_36%),radial-gradient(circle_at_90%_20%,rgba(59,130,246,0.24),transparent_34%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(2,6,23,0.62))]" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/80 ring-1 ring-white/10 backdrop-blur">
            {t(`app.chat.call.participantStatus.${statusKey}`)}
          </span>
          {cameraOff && <VideoOff className="h-4 w-4 text-white/55" />}
        </div>

        <div className="grid place-items-center py-4">
          <div
            className={cn(
              "grid place-items-center rounded-[28px] font-black text-white shadow-2xl shadow-black/30",
              compact ? "h-14 w-14 text-base" : "h-20 w-20 text-xl",
            )}
            style={{ background: `linear-gradient(135deg, ${user.color}, #3B82F6)` }}
          >
            {user.initials}
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{displayName}</p>
            <p className="truncate text-xs text-white/55">{user.role ?? t("app.chat.call.teammate")}</p>
          </div>
          {speaking && (
            <span className="flex h-7 items-end gap-0.5 rounded-full bg-emerald-400/15 px-2 py-1 ring-1 ring-emerald-300/20">
              <span className="h-2 w-1 animate-pulse rounded-full bg-emerald-300" />
              <span className="h-4 w-1 animate-pulse rounded-full bg-emerald-300 [animation-delay:120ms]" />
              <span className="h-3 w-1 animate-pulse rounded-full bg-emerald-300 [animation-delay:240ms]" />
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function ChatCallOverlay({ room, users, mode, startedAt, onClose, onSwitchMode }: ChatCallOverlayProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  const [compact, setCompact] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(mode === "video");
  const [speakerOn, setSpeakerOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);

  const isGroupCall = room.type !== "1on1";
  const peer = getRoomPeer(room, users);
  const roomUsers = useMemo(
    () => room.memberIds.map((memberId) => getUser(memberId, users)).filter((user): user is ChatUser => Boolean(user)),
    [room.memberIds, users],
  );
  const visibleUsers = roomUsers.length > 0 ? roomUsers : users.slice(0, 4);
  const callTitle = getRoomName(room, t);
  const duration = formatDuration(now - startedAt);
  const callKindLabel = isGroupCall
    ? mode === "video"
      ? t("app.chat.call.groupVideo")
      : t("app.chat.call.groupVoice")
    : mode === "video"
      ? t("app.chat.call.video")
      : t("app.chat.call.voice");

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (mode === "video") setCameraOn(true);
  }, [mode]);

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -8 }}
        className="absolute right-3 top-3 z-[140] flex max-w-[calc(100%-24px)] items-center gap-3 rounded-full border border-white/10 bg-[#0B1120]/95 px-3 py-2 text-white shadow-2xl shadow-black/35 backdrop-blur-xl"
      >
        {room.type === "1on1" ? <Avatar user={peer} size={38} showOnline /> : <RoomGlyph room={room} className="h-10 w-10 rounded-full" />}
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{callTitle}</p>
          <p className="text-xs text-white/55">
            {callKindLabel} · {duration}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCompact(false)}
          className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/15"
          aria-label={t("app.chat.call.expand")}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full bg-rose-500 text-white transition-colors hover:bg-rose-400"
          aria-label={t("app.chat.call.end")}
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[130] overflow-hidden bg-[#07111F] text-white"
      role="dialog"
      aria-modal="true"
      aria-label={callKindLabel}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(99,102,241,0.44),transparent_34%),radial-gradient(circle_at_90%_12%,rgba(59,130,246,0.28),transparent_34%),linear-gradient(135deg,#07111F,#0B1120_48%,#111827)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/8 to-transparent" />

      <div className="relative flex h-full min-h-0 flex-col gap-3 p-3 sm:gap-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/[0.06] px-3 py-2.5 shadow-2xl shadow-black/20 backdrop-blur-xl sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            {room.type === "1on1" ? <Avatar user={peer} size={46} showOnline /> : <RoomGlyph room={room} className="h-12 w-12" />}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-black sm:text-base">{callTitle}</p>
                <span className="hidden rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-bold text-emerald-200 ring-1 ring-emerald-300/20 sm:inline-flex">
                  {t("app.chat.call.live")}
                </span>
              </div>
              <p className="truncate text-xs text-white/58">
                {callKindLabel} · {duration} · {t("app.chat.call.encryptedDemo")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCompact(true)}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/15"
              aria-label={t("app.chat.call.minimize")}
            >
              <Minimize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-10 w-10 place-items-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-950/25 transition-colors hover:bg-rose-400"
              aria-label={t("app.chat.call.end")}
            >
              <PhoneOff className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_280px]">
          <div className="relative min-h-0 overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/45 p-3 shadow-2xl shadow-black/30">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_35%)]" />

            {mode === "video" ? (
              <div className={cn("relative grid h-full gap-3", visibleUsers.length <= 2 ? "md:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3")}>
                {visibleUsers.map((member, index) => (
                  <ParticipantVideoTile key={member.id} user={member} index={index} compact={visibleUsers.length > 4} />
                ))}
              </div>
            ) : (
              <div className="relative flex h-full min-h-[340px] flex-col items-center justify-center text-center">
                <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/70 ring-1 ring-white/10">
                  <ShieldCheck className="h-4 w-4 text-emerald-200" />
                  {t("app.chat.call.secureLayer")}
                </div>
                <div className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/70 ring-1 ring-white/10">
                  {visibleUsers.length} {t("app.chat.call.participants")}
                </div>

                <div className="relative">
                  <span className="absolute inset-[-34px] animate-ping rounded-full bg-indigo-400/20" />
                  <span className="absolute inset-[-18px] rounded-full bg-blue-400/10 ring-1 ring-white/10" />
                  {isGroupCall ? (
                    <div className="relative">
                      <CallAvatarStack room={room} users={users} />
                    </div>
                  ) : (
                    <Avatar user={peer} size={132} className="relative rounded-full ring-8 ring-white/10" showOnline />
                  )}
                </div>

                <h3 className="mt-9 text-2xl font-black tracking-tight sm:text-4xl">{callTitle}</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-white/58">
                  {isGroupCall ? t("app.chat.call.groupVoiceDesc") : t("app.chat.call.directVoiceDesc")}
                </p>

                <div className="mt-6 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-bold text-white/65 backdrop-blur-xl">
                  <Sparkles className="h-4 w-4 text-indigo-200" />
                  {t("app.chat.call.telegramInspired")}
                </div>
              </div>
            )}
          </div>

          <aside className="hidden min-h-0 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.06] shadow-2xl shadow-black/20 backdrop-blur-xl lg:flex">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-sm font-black">{t("app.chat.call.people")}</p>
                <p className="text-xs text-white/48">{t("app.chat.call.peopleDesc")}</p>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white/10">
                <Users className="h-4 w-4" />
              </span>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {visibleUsers.map((member, index) => {
                const statusKey = participantStatusKeys[index % participantStatusKeys.length];
                return (
                  <div key={member.id} className="flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-white/10">
                    <Avatar user={member} size={38} showOnline />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{member.id === "me" ? t("app.chat.you") : member.name}</p>
                      <p className="truncate text-xs text-white/45">{t(`app.chat.call.participantStatus.${statusKey}`)}</p>
                    </div>
                    {statusKey === "muted" ? <MicOff className="h-4 w-4 text-white/40" /> : <Mic className="h-4 w-4 text-emerald-200" />}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-white/10 p-3">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-3 py-2.5 text-sm font-bold transition-colors hover:bg-white/15"
              >
                <UserPlus className="h-4 w-4" />
                {t("app.chat.call.invite")}
              </button>
            </div>
          </aside>
        </div>

        <div className="mx-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-[28px] border border-white/10 bg-slate-950/70 px-3 py-3 shadow-2xl shadow-black/35 backdrop-blur-xl sm:gap-3 sm:px-4">
          <CallControl icon={micOn ? Mic : MicOff} label={micOn ? t("app.chat.call.muteMic") : t("app.chat.call.unmuteMic")} active={micOn} onClick={() => setMicOn((current) => !current)} />
          <CallControl icon={speakerOn ? Volume2 : VolumeX} label={speakerOn ? t("app.chat.call.speakerOn") : t("app.chat.call.speakerOff")} active={speakerOn} onClick={() => setSpeakerOn((current) => !current)} />
          <CallControl
            icon={mode === "video" && cameraOn ? Video : VideoOff}
            label={mode === "video" ? (cameraOn ? t("app.chat.call.stopVideo") : t("app.chat.call.startVideo")) : t("app.chat.call.switchToVideo")}
            active={mode === "video" && cameraOn}
            onClick={() => {
              if (mode === "voice") {
                onSwitchMode("video");
                setCameraOn(true);
                return;
              }
              setCameraOn((current) => !current);
            }}
          />
          <CallControl icon={MonitorUp} label={t("app.chat.call.shareScreen")} active={screenOn} onClick={() => setScreenOn((current) => !current)} />
          <CallControl icon={MessageCircle} label={t("app.chat.call.backToChat")} onClick={() => setCompact(true)} />
          <CallControl icon={Phone} label={t("app.chat.call.end")} danger onClick={onClose} />
        </div>
      </div>
    </motion.div>
  );
}

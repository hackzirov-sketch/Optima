import { ArrowLeft, Camera, CameraOff, Check, Copy, Download, FileText, Hand, Hourglass, Info, LayoutGrid, Link2, Lock, LoaderCircle, Maximize2, Mic, MicOff, Minus, MonitorUp, MoreVertical, Paperclip, PhoneOff, PictureInPicture2, Pin, Settings2, ShieldCheck, ShieldX, Signal, Smile, Unlock, UsersRound, Video, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Avatar, Button } from "../components/ui";
import { useToast } from "../components/Toast";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { getSocket } from "../lib/socket";
import { useI18n } from "../lib/i18n/i18n";
import type { Meeting, MeetingFile, MeetingJoinRequest, MeetingVisibility, MeetingJoinPolicyValue, User, WorkspaceMember } from "../types";

const localeTag: Record<string, string> = { uz: "uz-UZ", ru: "ru-RU", en: "en-US", tr: "tr-TR" };
const RTC_CONFIG: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const SECURITY_EMOJIS = ["🍏", "🐳", "🌙", "⭐", "🍀", "🌊", "🎈", "🎧", "🚀", "🔑", "🧊", "☕", "🌻", "🎸", "🧩", "💎", "🦋", "🍒", "🏀", "🛡️", "📚", "🎯", "🪐", "🌈", "⚡", "🎲", "🍉", "🧭", "🎨", "🏔️", "🕊️", "🔔"];

function fileSize(value: string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function dtlsFingerprints(peer: RTCPeerConnection) {
  const values = `${peer.localDescription?.sdp || ""}\n${peer.remoteDescription?.sdp || ""}`
    .match(/a=fingerprint:[^\r\n]+/g) || [];
  return values.sort().join("|");
}

function VideoTile({ stream, muted, mirrored = false, label, avatar, microphoneOn = true, videoOn = true, pinned = false, speaking = false, handRaised = false, pipEnabled = false, onPin }: { stream?: MediaStream; muted?: boolean; mirrored?: boolean; label: string; avatar?: Pick<User, "firstName" | "lastName" | "avatarUrl">; microphoneOn?: boolean; videoOn?: boolean; pinned?: boolean; speaking?: boolean; handRaised?: boolean; pipEnabled?: boolean; onPin?: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream; }, [stream]);
  const hasVideo = videoOn && Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled));
  const requestPip = () => { void ref.current?.requestPictureInPicture().catch(() => {}); };
  return (
    <article className={`video-tile ${mirrored ? "video-tile-mirrored" : ""} ${pinned ? "video-tile-pinned" : ""} ${speaking ? "video-tile-speaking" : ""}`}>
      {stream && <video ref={ref} className={hasVideo ? "" : "video-audio-only"} autoPlay playsInline muted={muted} />}
      {!hasVideo && <div className="video-placeholder"><Avatar firstName={avatar?.firstName || label} lastName={avatar?.lastName} url={avatar?.avatarUrl} size="xl" /></div>}
      <span className="video-label">{label}</span>
      {handRaised && <span className="tile-hand" title={t("meetingRoom.handRaisedTitle")}><Hand size={16} /></span>}
      {pipEnabled && hasVideo && document.pictureInPictureEnabled && <button className="tile-pip" onClick={requestPip} aria-label={t("meetingRoom.pipAria")} title={t("meetingRoom.pipAria")}><PictureInPicture2 size={15} /></button>}
      {onPin && <button className={`tile-pin ${pinned ? "active" : ""}`} onClick={onPin} aria-label={pinned ? t("meetingRoom.releaseVideoAria") : t("meetingRoom.pinVideoAria")}><Pin size={15} /></button>}
      {!microphoneOn && <span className="tile-muted" aria-label={t("meetingRoom.micOffTileAria")}><MicOff size={15} /></span>}
    </article>
  );
}

interface MeetingTile {
  id: string;
  stream?: MediaStream;
  label: string;
  avatar?: Pick<User, "firstName" | "lastName" | "avatarUrl">;
  mic: boolean;
  video: boolean;
  isSelf: boolean;
}

/**
 * Rendered instead of the full meeting UI once the user has navigated away
 * from /meetings/:id while still in the call (see the standalone-instance
 * mode switch in MeetingRoomPage). Shows whatever is currently focused
 * (screen share / active speaker / self) plus the bare minimum controls —
 * expanding takes them back to the full room.
 */
function FloatingMeetingWidget({ tile, title, microphone, camera, onToggleMic, onToggleCamera, onExpand, onLeave }: {
  tile: MeetingTile | null;
  title: string;
  microphone: boolean;
  camera: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onExpand: () => void;
  onLeave: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="meeting-floating-widget" role="complementary" aria-label={t("meetingRoom.floatingWidgetAria")}>
      <div className="floating-widget-video" onClick={onExpand}>
        {tile ? <VideoTile stream={tile.stream} muted={tile.isSelf} mirrored={tile.isSelf} label={tile.label} avatar={tile.avatar} microphoneOn={tile.mic} videoOn={tile.video} /> : <div className="video-placeholder"><LoaderCircle className="spin" size={22} /></div>}
      </div>
      <header>
        <strong>{title}</strong>
        <button onClick={onExpand} aria-label={t("meetingRoom.expandWidgetAria")}><Maximize2 size={15} /></button>
      </header>
      <div className="floating-widget-controls">
        <button className={microphone ? "" : "off"} onClick={onToggleMic} aria-label={microphone ? t("meetingRoom.turnOffMicAria") : t("meetingRoom.turnOnMicAria")}>{microphone ? <Mic size={17} /> : <MicOff size={17} />}</button>
        <button className={camera ? "" : "off"} onClick={onToggleCamera} aria-label={camera ? t("meetingRoom.turnOffCameraAria") : t("meetingRoom.turnOnCameraAria")}>{camera ? <Camera size={17} /> : <CameraOff size={17} />}</button>
        <button className="leave-control" onClick={onLeave} aria-label={t("meetingRoom.leaveMeetingAria")}><PhoneOff size={17} /></button>
      </div>
    </div>
  );
}

/**
 * With directMode=false and no meetingId prop, this is the single persistent
 * instance mounted at the app root (see App.tsx, same pattern as ChatPage) —
 * it never unmounts on navigation, so a call survives leaving the /meetings
 * route and continues as a small floating widget instead of hanging up.
 * With a meetingId prop (ChatPage's 1:1 direct-call overlay), it behaves
 * exactly as before: a single call, full-screen, torn down when its parent
 * stops rendering it.
 */
export function MeetingRoomPage({ meetingId: meetingIdProp, directMode = false, onDirectClose }: { meetingId?: string; directMode?: boolean; onDirectClose?: () => void }) {
  const { user, workspace } = useAuth();
  const selfId = user?.id || "__self__";
  const { show } = useToast();
  const { t, locale } = useI18n();
  const [location, navigate] = useLocation();
  const routeMatch = !directMode ? location.match(/^\/meetings\/([^/]+)$/) : null;
  const [standaloneMeetingId, setStandaloneMeetingId] = useState<string | null>(null);
  useEffect(() => {
    if (!directMode && routeMatch) setStandaloneMeetingId(routeMatch[1]);
    // Route match only ever needs to set the id, never clear it — leaving
    // the route is exactly the "keep running as a widget" case.
  }, [directMode, routeMatch?.[1]]);
  const meetingId = directMode ? meetingIdProp! : standaloneMeetingId;
  // True only while this instance actually owns the screen (its own
  // /meetings/:id route, or the direct-call overlay). Off the route it is at
  // most a floating widget — and when not even in a call, nothing at all.
  // The lobby camera preview keys off this: see the getUserMedia effect below.
  const isFullMode = directMode || Boolean(routeMatch);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [entered, setEntered] = useState(false);
  const [joining, setJoining] = useState(false);
  // directMode's meetingId is available synchronously (ChatPage passes it as a
  // prop right after writing this same key), so the lazy initializer works as
  // before. The standalone instance's meetingId resolves a tick later (route
  // effect above) and can change to a different meeting within the same
  // persistent component lifetime — see the reset effect below for that case.
  const [camera, setCamera] = useState(() => (directMode ? sessionStorage.getItem(`optima:meeting-camera:${meetingIdProp}`) !== "off" : true));
  const [microphone, setMicrophone] = useState(true);
  // Standalone instance lives for the whole app session — reset the device
  // toggles whenever it points at a genuinely new meeting (directMode's
  // instance is one-meeting-per-mount and doesn't need this).
  useEffect(() => {
    if (directMode || !standaloneMeetingId) return;
    setCamera(sessionStorage.getItem(`optima:meeting-camera:${standaloneMeetingId}`) !== "off");
    setMicrophone(true);
  }, [directMode, standaloneMeetingId]);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream>();
  const [previewStream, setPreviewStream] = useState<MediaStream>();
  // Mirrored into a ref so the unmount/pagehide handlers below can release the
  // camera without re-subscribing on every preview change.
  const previewStreamRef = useRef<MediaStream | undefined>(undefined);
  previewStreamRef.current = previewStream;
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraDevice, setCameraDevice] = useState("");
  const [microphoneDevice, setMicrophoneDevice] = useState("");
  const [permissionError, setPermissionError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidePanel, setSidePanel] = useState<"participants" | "info" | "files" | "waiting" | "settings" | null>(null);
  const [accessDenied, setAccessDenied] = useState("");
  const [requestState, setRequestState] = useState<"idle" | "requesting" | "pending" | "rejected">("idle");
  const [waitingRequests, setWaitingRequests] = useState<MeetingJoinRequest[]>([]);
  const [waitingBusy, setWaitingBusy] = useState<string | null>(null);
  const [waitingCount, setWaitingCount] = useState<number | null>(null);
  const [settingsVisibility, setSettingsVisibility] = useState<MeetingVisibility>("workspace_only");
  const [settingsJoinPolicy, setSettingsJoinPolicy] = useState<MeetingJoinPolicyValue>("auto");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [inviteEmailsInput, setInviteEmailsInput] = useState("");
  const [inviting, setInviting] = useState(false);
  const [files, setFiles] = useState<MeetingFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const meetingFileInput = useRef<HTMLInputElement>(null);
  const [handRaised, setHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [reactionOpen, setReactionOpen] = useState(false);
  const [reactions, setReactions] = useState<Array<{ id: string; userId: string; emoji: string }>>([]);
  const [pinnedUserId, setPinnedUserId] = useState<string | null>(null);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const audioAnalysers = useRef(new Map<string, { ctx: AudioContext; analyser: AnalyserNode; data: Uint8Array<ArrayBuffer> }>());
  const speakerStableTicks = useRef(new Map<string, number>());
  const [localStream, setLocalStream] = useState<MediaStream>();
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [remoteMedia, setRemoteMedia] = useState<Record<string, { audio: boolean; video: boolean; screen: boolean }>>({});
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "offline">("connecting");
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const iceQueue = useRef(new Map<string, RTCIceCandidateInit[]>());
  const currentStream = useRef<MediaStream | undefined>(undefined);
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  const rtcConfig = useRef<RTCConfiguration>(RTC_CONFIG);
  const reconnectAttempts = useRef(new Map<string, number>());
  const disconnectTimers = useRef(new Map<string, number>());
  const securityKeyPair = useRef<Promise<CryptoKeyPair> | null>(null);
  const remoteSecurityKeys = useRef(new Map<string, JsonWebKey>());
  const [securityCodes, setSecurityCodes] = useState<Record<string, string[]>>({});
  const sendOfferRef = useRef<(targetUserId: string, iceRestart?: boolean) => Promise<void>>(async () => {});

  const ensureSecurityKey = useCallback(() => {
    securityKeyPair.current ||= crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    return securityKeyPair.current;
  }, []);

  const sendSecurityKey = useCallback(async (targetUserId: string) => {
    const pair = await ensureSecurityKey();
    const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
    getSocket().emit("meeting:key", { meetingId, targetUserId, publicKey });
  }, [ensureSecurityKey, meetingId]);

  const updateSecurityCode = useCallback(async (targetUserId: string, peer: RTCPeerConnection) => {
    const remoteJwk = remoteSecurityKeys.current.get(targetUserId);
    const fingerprints = dtlsFingerprints(peer);
    if (!remoteJwk || !fingerprints || !peer.localDescription || !peer.remoteDescription) return;
    const pair = await ensureSecurityKey();
    const remoteKey = await crypto.subtle.importKey("jwk", remoteJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: remoteKey }, pair.privateKey, 256);
    const context = new TextEncoder().encode(`${meetingId}|${fingerprints}`);
    const input = new Uint8Array(shared.byteLength + context.byteLength);
    input.set(new Uint8Array(shared)); input.set(context, shared.byteLength);
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
    const emojis = [0, 2, 4, 6].map((offset) => SECURITY_EMOJIS[((hash[offset] << 8) | hash[offset + 1]) % SECURITY_EMOJIS.length]);
    setSecurityCodes((current) => ({ ...current, [targetUserId]: emojis }));
  }, [ensureSecurityKey, meetingId]);

  // Lobby preview. Gated on isFullMode: this component stays mounted for the
  // whole app session, so without that gate leaving a meeting (entered=false,
  // camera still toggled on) re-acquired the camera and mic and held them open
  // forever — the OS recording indicator stayed lit while the user was off
  // reading chat.
  useEffect(() => {
    if (!isFullMode || entered || (!camera && !microphone)) {
      previewStream?.getTracks().forEach((track) => track.stop());
      setPreviewStream(undefined);
      return;
    }
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({
      video: camera ? { deviceId: cameraDevice ? { exact: cameraDevice } : undefined } : false,
      audio: microphone ? { deviceId: microphoneDevice ? { exact: microphoneDevice } : undefined } : false,
    }).then(async (stream) => {
      if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      setPermissionError("");
      setPreviewStream((current) => { current?.getTracks().forEach((track) => track.stop()); return stream; });
      setDevices(await navigator.mediaDevices.enumerateDevices());
    }).catch(() => setPermissionError(t("meetingRoom.permissionDenied")));
    return () => { cancelled = true; };
  // Device selection intentionally restarts preview.
  }, [isFullMode, entered, camera, microphone, cameraDevice, microphoneDevice]);

  useEffect(() => {
    if (!meetingId) return;
    Promise.all([api.meetings.one(meetingId), workspace ? api.workspaces.members(workspace.id).catch(() => []) : Promise.resolve([])])
      .then(([nextMeeting, nextMembers]) => {
        setMeeting(nextMeeting);
        setMembers(nextMembers);
        setSettingsVisibility(nextMeeting.scope);
        setSettingsJoinPolicy(nextMeeting.joinPolicy);
        if (typeof nextMeeting.waitingCount === "number") setWaitingCount(nextMeeting.waitingCount);
        if (nextMeeting.access?.requestStatus === "pending") setRequestState("pending");
        else if (nextMeeting.access?.requestStatus === "rejected") setRequestState("rejected");
      })
      .catch((error) => {
        if (error instanceof ApiError && error.code === "MEETING_ACCESS_DENIED") {
          setAccessDenied(t("meetingRoom.accessDeniedDesc"));
          return;
        }
        show(error instanceof Error ? error.message : t("meetingRoom.loadFailed"), "error");
      })
      .finally(() => setLoading(false));
  }, [meetingId, workspace?.id, show, t]);

  const users = useMemo(() => new Map(members.map((member) => [member.userId, member.user as User])), [members]);

  const canManageWaitingRoom = useMemo(() => {
    if (!meeting || !user) return false;
    if (meeting.hostId === user.id) return true;
    return meeting.participants.some((participant) => participant.userId === user.id && participant.role === "co_host");
  }, [meeting, user]);

  const refreshWaitingRoom = useCallback(async () => {
    try {
      const requests = await api.meetings.joinRequests.list(meetingId!);
      setWaitingRequests(requests);
      setWaitingCount(requests.length);
    } catch {
      // Waiting room is a convenience panel — a transient fetch failure isn't worth a toast.
    }
  }, [meetingId]);

  async function sendJoinRequest() {
    setRequestState("requesting");
    try {
      const result = await api.meetings.requestToJoin(meetingId!);
      if (result.status === "pending") {
        setRequestState("pending");
        show(t("meetingRoom.joinRequestSentToast"));
        return;
      }
      if (result.meeting) setMeeting(result.meeting);
      setRequestState("idle");
      await enterMeeting();
    } catch (error) {
      show(error instanceof Error ? error.message : t("meetingRoom.joinFailed"), "error");
      setRequestState("idle");
    }
  }

  async function cancelJoinRequest() {
    try {
      await api.meetings.cancelJoinRequest(meetingId!);
    } catch {
      // Best-effort — the request will simply sit pending server-side otherwise.
    }
    setRequestState("idle");
  }

  async function reviewRequest(request: MeetingJoinRequest, decision: "approve" | "reject") {
    setWaitingBusy(request.id);
    try {
      await (decision === "approve" ? api.meetings.joinRequests.approve(meetingId!, request.id) : api.meetings.joinRequests.reject(meetingId!, request.id));
      setWaitingRequests((current) => current.filter((item) => item.id !== request.id));
      setWaitingCount((current) => (current === null ? current : Math.max(0, current - 1)));
    } catch (error) {
      show(error instanceof Error ? error.message : t("meetingRoom.joinFailed"), "error");
    } finally {
      setWaitingBusy(null);
    }
  }

  async function reviewAllRequests(decision: "approve" | "reject") {
    try {
      await (decision === "approve" ? api.meetings.joinRequests.approveAll(meetingId!) : api.meetings.joinRequests.rejectAll(meetingId!));
      setWaitingRequests([]);
      setWaitingCount(0);
    } catch (error) {
      show(error instanceof Error ? error.message : t("meetingRoom.joinFailed"), "error");
    }
  }

  function visibilityLabel(value: MeetingVisibility) {
    return ({
      workspace_only: t("meetings.visibilityWorkspace"),
      private: t("meetings.visibilityPrivate"),
      public: t("meetings.visibilityPublic"),
      invite_only: t("meetings.visibilityInviteOnly"),
    })[value];
  }

  async function saveMeetingSettings() {
    setSettingsSaving(true);
    try {
      const updated = await api.meetings.update(meetingId!, {
        scope: settingsVisibility,
        joinPolicy: settingsVisibility === "invite_only" ? undefined : settingsJoinPolicy,
      });
      setMeeting(updated);
      show(t("meetingRoom.settingsSaved"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("meetingRoom.settingsSaveFailed"), "error");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function sendInvite() {
    const emails = Array.from(new Set(inviteEmailsInput.split(/[,\n]/).map((value) => value.trim()).filter(Boolean)));
    if (!emails.length) {
      show(t("meetingRoom.inviteEmptyError"), "error");
      return;
    }
    setInviting(true);
    try {
      const result = await api.meetings.invite(meetingId!, { emails });
      if (result.invitedCount > 0) show(t("meetingRoom.inviteSentToast", { count: result.invitedCount }));
      if (result.notFoundEmails.length > 0) show(t("meetingRoom.inviteNotFoundToast", { emails: result.notFoundEmails.join(", ") }), "error");
      setInviteEmailsInput("");
    } catch (error) {
      show(error instanceof Error ? error.message : t("meetingRoom.inviteFailed"), "error");
    } finally {
      setInviting(false);
    }
  }

  async function toggleLock() {
    if (!meeting) return;
    setLockBusy(true);
    try {
      const updated = meeting.locked ? await api.meetings.unlock(meetingId!) : await api.meetings.lock(meetingId!);
      setMeeting(updated);
    } catch (error) {
      show(error instanceof Error ? error.message : t("meetingRoom.joinFailed"), "error");
    } finally {
      setLockBusy(false);
    }
  }

  // Personal-channel waiting-room events — active regardless of whether this
  // client has entered the call yet, since a pending requester is sitting in
  // the lobby (not the meeting room) waiting to hear back.
  useEffect(() => {
    const socket = getSocket();
    const onRequestCreated = ({ meetingId: eventMeetingId, waitingCount: nextCount }: { meetingId: string; waitingCount?: number | null }) => {
      if (eventMeetingId !== meetingId || !canManageWaitingRoom) return;
      if (typeof nextCount === "number") setWaitingCount(nextCount);
      void refreshWaitingRoom();
      show(t("meetingRoom.newJoinRequestToast", { name: "" }).trim());
    };
    const onRequestReviewed = ({ meetingId: eventMeetingId, waitingCount: nextCount }: { meetingId: string; waitingCount?: number | null }) => {
      if (eventMeetingId !== meetingId || !canManageWaitingRoom) return;
      if (typeof nextCount === "number") setWaitingCount(nextCount);
    };
    const onRequestApproved = ({ meetingId: eventMeetingId }: { meetingId: string }) => {
      if (eventMeetingId !== meetingId) return;
      show(t("meetingRoom.joinRequestApprovedToast"));
      setRequestState("idle");
      if (!entered) void enterMeeting();
    };
    const onRequestRejected = ({ meetingId: eventMeetingId }: { meetingId: string }) => {
      if (eventMeetingId !== meetingId) return;
      setRequestState("rejected");
    };
    const onLocked = ({ meetingId: eventMeetingId }: { meetingId: string }) => {
      if (eventMeetingId !== meetingId) return;
      setMeeting((current) => (current ? { ...current, locked: true } : current));
      show(t("meetingRoom.lockedToast"));
    };
    const onUnlocked = ({ meetingId: eventMeetingId }: { meetingId: string }) => {
      if (eventMeetingId !== meetingId) return;
      setMeeting((current) => (current ? { ...current, locked: false } : current));
      show(t("meetingRoom.unlockedToast"));
    };
    socket.on("meeting:join_request:created", onRequestCreated);
    socket.on("meeting:join_request:reviewed", onRequestReviewed);
    socket.on("meeting:join_request:approved", onRequestApproved);
    socket.on("meeting:join_request:rejected", onRequestRejected);
    socket.on("meeting:locked", onLocked);
    socket.on("meeting:unlocked", onUnlocked);
    return () => {
      socket.off("meeting:join_request:created", onRequestCreated);
      socket.off("meeting:join_request:reviewed", onRequestReviewed);
      socket.off("meeting:join_request:approved", onRequestApproved);
      socket.off("meeting:join_request:rejected", onRequestRejected);
      socket.off("meeting:locked", onLocked);
      socket.off("meeting:unlocked", onUnlocked);
    };
  }, [meetingId, canManageWaitingRoom, refreshWaitingRoom, entered, show, t]);

  useEffect(() => {
    if (entered && canManageWaitingRoom) void refreshWaitingRoom();
  }, [entered, canManageWaitingRoom, refreshWaitingRoom]);

  async function shareMeetingLink() {
    if (!meeting) return;
    const url = `${window.location.origin}/meetings/${meeting.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: meeting.title, text: t("meetingRoom.shareTextTemplate", { code: meeting.code }), url });
      } else {
        await navigator.clipboard.writeText(url);
        show(t("meetingRoom.linkCopied"));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      show(t("meetingRoom.shareFailed"), "error");
    }
  }

  const closePeer = useCallback((userId: string) => {
    const timer = disconnectTimers.current.get(userId);
    if (timer) window.clearTimeout(timer);
    disconnectTimers.current.delete(userId);
    peers.current.get(userId)?.close();
    peers.current.delete(userId);
    iceQueue.current.delete(userId);
    setRemoteStreams((current) => { const next = { ...current }; delete next[userId]; return next; });
    setRemoteMedia((current) => { const next = { ...current }; delete next[userId]; return next; });
    const node = audioAnalysers.current.get(userId);
    if (node) { node.ctx.close().catch(() => {}); audioAnalysers.current.delete(userId); }
    speakerStableTicks.current.delete(userId);
    setActiveSpeakerId((current) => (current === userId ? null : current));
  }, []);

  const createPeer = useCallback((targetUserId: string) => {
    const existing = peers.current.get(targetUserId);
    if (existing) return existing;
    const socket = getSocket();
    const peer = new RTCPeerConnection(rtcConfig.current);
    currentStream.current?.getTracks().forEach((track) => peer.addTrack(track, currentStream.current!));
    peer.onicecandidate = (event) => {
      if (event.candidate) socket.emit("meeting:ice-candidate", { meetingId, targetUserId, candidate: event.candidate.toJSON() });
    };
    peer.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      setRemoteStreams((current) => ({ ...current, [targetUserId]: stream }));
      setRemoteMedia((current) => ({
        ...current,
        [targetUserId]: {
          audio: current[targetUserId]?.audio ?? true,
          video: current[targetUserId]?.video ?? stream.getVideoTracks().length > 0,
          screen: current[targetUserId]?.screen ?? false,
        },
      }));
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        reconnectAttempts.current.delete(targetUserId);
        const timer = disconnectTimers.current.get(targetUserId);
        if (timer) window.clearTimeout(timer);
        disconnectTimers.current.delete(targetUserId);
      }
      if (peer.connectionState === "disconnected" && !disconnectTimers.current.has(targetUserId)) {
        const timer = window.setTimeout(() => {
          disconnectTimers.current.delete(targetUserId);
          if (peer.connectionState === "disconnected") void sendOfferRef.current(targetUserId, true);
        }, 4000);
        disconnectTimers.current.set(targetUserId, timer);
      }
      if (peer.connectionState === "failed") {
        const attempts = reconnectAttempts.current.get(targetUserId) || 0;
        if (attempts < 2) {
          reconnectAttempts.current.set(targetUserId, attempts + 1);
          void sendOfferRef.current(targetUserId, true);
        } else closePeer(targetUserId);
      }
      if (peer.connectionState === "closed") closePeer(targetUserId);
    };
    peers.current.set(targetUserId, peer);
    return peer;
  }, [meetingId, closePeer]);

  const sendOffer = useCallback(async (targetUserId: string, iceRestart = false) => {
    const peer = createPeer(targetUserId);
    if (peer.signalingState !== "stable") return;
    const offer = await peer.createOffer({ iceRestart });
    await peer.setLocalDescription(offer);
    getSocket().emit("meeting:offer", { meetingId, targetUserId, sdp: offer });
  }, [createPeer, meetingId]);
  sendOfferRef.current = sendOffer;

  const flushIce = useCallback(async (userId: string, peer: RTCPeerConnection) => {
    const queued = iceQueue.current.get(userId) || [];
    for (const candidate of queued) await peer.addIceCandidate(candidate).catch(() => {});
    iceQueue.current.delete(userId);
  }, []);

  useEffect(() => {
    if (!entered) return;
    const socket = getSocket();
    const onConnect = () => { setConnectionState("connected"); socket.emit("meeting:join", { meetingId }); };
    const onDisconnect = () => setConnectionState("offline");
    const onParticipants = async ({ userIds }: { userIds: string[] }) => {
      for (const targetUserId of userIds) {
        await sendSecurityKey(targetUserId);
        if (user?.id && user.id.localeCompare(targetUserId) < 0) await sendOffer(targetUserId);
      }
    };
    const onUserJoined = ({ userId: joinedUserId }: { userId: string }) => {
      void sendSecurityKey(joinedUserId);
      window.setTimeout(() => {
        if (user?.id && user.id.localeCompare(joinedUserId) < 0 && !peers.current.has(joinedUserId)) void sendOffer(joinedUserId);
      }, 300);
    };
    const onOffer = async ({ fromUserId, sdp }: { fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      const peer = createPeer(fromUserId);
      await peer.setRemoteDescription(sdp);
      await flushIce(fromUserId, peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit("meeting:answer", { meetingId, targetUserId: fromUserId, sdp: answer });
      await updateSecurityCode(fromUserId, peer);
    };
    const onAnswer = async ({ fromUserId, sdp }: { fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      const peer = peers.current.get(fromUserId);
      if (!peer) return;
      await peer.setRemoteDescription(sdp);
      await flushIce(fromUserId, peer);
      await updateSecurityCode(fromUserId, peer);
    };
    const onSecurityKey = async ({ fromUserId, publicKey }: { fromUserId: string; publicKey: JsonWebKey }) => {
      const firstKey = !remoteSecurityKeys.current.has(fromUserId);
      remoteSecurityKeys.current.set(fromUserId, publicKey);
      if (firstKey) await sendSecurityKey(fromUserId);
      const peer = peers.current.get(fromUserId);
      if (peer) await updateSecurityCode(fromUserId, peer);
    };
    const onIce = async ({ fromUserId, candidate }: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
      const peer = peers.current.get(fromUserId);
      if (peer?.remoteDescription) await peer.addIceCandidate(candidate).catch(() => {});
      else iceQueue.current.set(fromUserId, [...(iceQueue.current.get(fromUserId) || []), candidate]);
    };
    const onLeft = ({ userId }: { userId: string }) => closePeer(userId);
    const onHand = ({ userId, raised }: { userId: string; raised: boolean }) => setRaisedHands((current) => { const next = new Set(current); if (raised) next.add(userId); else next.delete(userId); return next; });
    const onReaction = (reaction: { id: string; userId: string; emoji: string }) => {
      setReactions((current) => [...current, reaction]);
      window.setTimeout(() => setReactions((current) => current.filter((item) => item.id !== reaction.id)), 3200);
    };
    const onToggle = ({ userId: remoteUserId, kind, enabled }: { userId: string; kind: "audio" | "video" | "screen"; enabled: boolean }) => {
      setRemoteMedia((current) => ({
        ...current,
        [remoteUserId]: {
          audio: kind === "audio" ? enabled : current[remoteUserId]?.audio ?? true,
          video: kind === "video" ? enabled : current[remoteUserId]?.video ?? true,
          screen: kind === "screen" ? enabled : current[remoteUserId]?.screen ?? false,
        },
      }));
    };
    const onFileShared = ({ file }: { file: MeetingFile }) => {
      setFiles((current) => current.some((item) => item.id === file.id) ? current : [file, ...current]);
    };
    const onMeetingError = ({ message }: { message: string }) => { show(message || t("meetingRoom.joinFailed"), "error"); setEntered(false); };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("meeting:participants", onParticipants);
    socket.on("meeting:user-joined", onUserJoined);
    socket.on("meeting:offer", onOffer);
    socket.on("meeting:answer", onAnswer);
    socket.on("meeting:key", onSecurityKey);
    socket.on("meeting:ice-candidate", onIce);
    socket.on("meeting:user-left", onLeft);
    socket.on("meeting:hand", onHand);
    socket.on("meeting:reaction", onReaction);
    socket.on("meeting:toggled", onToggle);
    socket.on("meeting:file-shared", onFileShared);
    socket.on("meeting:error", onMeetingError);
    if (socket.connected) onConnect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("meeting:participants", onParticipants);
      socket.off("meeting:user-joined", onUserJoined);
      socket.off("meeting:offer", onOffer);
      socket.off("meeting:answer", onAnswer);
      socket.off("meeting:key", onSecurityKey);
      socket.off("meeting:ice-candidate", onIce);
      socket.off("meeting:user-left", onLeft);
      socket.off("meeting:hand", onHand);
      socket.off("meeting:reaction", onReaction);
      socket.off("meeting:toggled", onToggle);
      socket.off("meeting:file-shared", onFileShared);
      socket.off("meeting:error", onMeetingError);
    };
  }, [entered, meetingId, sendOffer, sendSecurityKey, updateSecurityCode, createPeer, flushIce, closePeer, show, user?.id]);

  async function requestTrack(kind: "audio" | "video") {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: kind === "audio" ? { deviceId: microphoneDevice ? { exact: microphoneDevice } : undefined } : false,
      video: kind === "video" ? { deviceId: cameraDevice ? { exact: cameraDevice } : undefined } : false,
    });
    return stream.getTracks().find((track) => track.kind === kind);
  }

  async function enterMeeting() {
    setJoining(true);
    previewStream?.getTracks().forEach((track) => track.stop());
    setPreviewStream(undefined);
    try {
      rtcConfig.current = { iceServers: await api.meetings.iceServers() };
    } catch {
      rtcConfig.current = RTC_CONFIG;
    }
    const tracks: MediaStreamTrack[] = [];
    let cameraReady = !camera;
    let microphoneReady = !microphone;
    if (camera) {
      try {
        const track = await requestTrack("video");
        if (track) tracks.push(track);
        cameraReady = Boolean(track);
      } catch {
        cameraReady = false;
      }
    }
    if (microphone) {
      try {
        const track = await requestTrack("audio");
        if (track) tracks.push(track);
        microphoneReady = Boolean(track);
      } catch {
        microphoneReady = false;
      }
    }
    const stream = new MediaStream(tracks);
    setCamera(camera && cameraReady);
    setMicrophone(microphone && microphoneReady);
    if ((camera && !cameraReady) || (microphone && !microphoneReady)) {
      show(t("meetingRoom.cameraMicOpenFailed"), "error");
    }
    currentStream.current = stream;
    setLocalStream(stream);
    setEntered(true);
    setConnectionState("connecting");
    setJoining(false);
  }

  useEffect(() => {
    if (directMode && !loading && meeting && !entered && !joining) void enterMeeting();
  // Direct calls skip the pre-join lobby.
  }, [directMode, loading, meeting?.id]);

  async function toggleTrack(kind: "audio" | "video") {
    const enabled = kind === "audio" ? !microphone : !camera;
    const existing = currentStream.current?.getTracks().find((track) => track.kind === kind);
    if (enabled && !existing) {
      try {
        const track = await requestTrack(kind);
        if (!track) throw new Error("Media track unavailable");
        currentStream.current ??= new MediaStream();
        currentStream.current.addTrack(track);
        setLocalStream(new MediaStream(currentStream.current.getTracks()));
        for (const [targetUserId, peer] of peers.current) {
          peer.addTrack(track, currentStream.current);
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          getSocket().emit("meeting:offer", { meetingId, targetUserId, sdp: offer });
        }
      } catch {
        show(t("meetingRoom.cameraOrMicFailed", { device: kind === "video" ? t("meetingRoom.cameraWord") : t("meetingRoom.microphoneWord") }), "error");
        return;
      }
    } else {
      existing && (existing.enabled = enabled);
    }
    if (kind === "audio") setMicrophone(enabled); else setCamera(enabled);
    getSocket().emit("meeting:toggle", { meetingId, kind, enabled });
  }

  async function stopScreenShare() {
    const sharedTrack = screenTrack.current;
    if (!sharedTrack && !screenSharing) return;
    if (sharedTrack) sharedTrack.onended = null;
    const cameraTrack = currentStream.current?.getVideoTracks()[0] ?? null;
    for (const peer of peers.current.values()) {
      const sender = peer.getSenders().find((entry) => entry.track === sharedTrack || entry.track?.kind === "video");
      if (sender) await sender.replaceTrack(cameraTrack);
    }
    sharedTrack?.stop();
    screenTrack.current = null;
    setScreenStream(undefined);
    setScreenSharing(false);
    getSocket().emit("meeting:toggle", { meetingId, kind: "screen", enabled: false });
  }

  async function toggleScreen() {
    if (screenSharing) {
      await stopScreenShare();
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = display.getVideoTracks()[0];
      if (!track) throw new Error("Screen track unavailable");
      screenTrack.current = track;
      setScreenStream(display);
      for (const [targetUserId, peer] of peers.current) {
        const sender = peer.getSenders().find((entry) => entry.track?.kind === "video");
        if (sender) await sender.replaceTrack(track);
        else {
          peer.addTrack(track, display);
          await sendOffer(targetUserId);
        }
      }
      setScreenSharing(true);
      getSocket().emit("meeting:toggle", { meetingId, kind: "screen", enabled: true });
      track.onended = () => void stopScreenShare();
    } catch {
      show(t("meetingRoom.screenShareCancelled"), "error");
    }
  }

  const cleanup = useCallback(() => {
    getSocket().emit("meeting:leave", { meetingId });
    peers.current.forEach((peer) => peer.close());
    peers.current.clear();
    disconnectTimers.current.forEach(window.clearTimeout);
    disconnectTimers.current.clear();
    screenTrack.current?.stop();
    screenTrack.current = null;
    currentStream.current?.getTracks().forEach((track) => track.stop());
    currentStream.current = undefined;
    setLocalStream(undefined);
    setScreenSharing(false);
    setScreenStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return undefined;
    });
  }, [meetingId]);

  function leave() {
    cleanup();
    setEntered(false);
    // The session is over for this user: drop the meeting this persistent
    // instance points at, so nothing keeps a lobby preview (or a widget) alive
    // in the background. Opening /meetings/:id again starts it fresh.
    if (!directMode) setStandaloneMeetingId(null);
    if (directMode) onDirectClose?.();
    // Called from the meeting page itself -> go back to the list. Called
    // from the floating widget (user is elsewhere in the app) -> just let
    // the widget disappear (entered=false already does that) without
    // yanking them to a page they didn't ask to visit.
    else if (routeMatch) navigate("/meetings");
  }

  function toggleHand() {
    const raised = !handRaised;
    setHandRaised(raised);
    setRaisedHands((current) => { const next = new Set(current); if (user?.id) { if (raised) next.add(user.id); else next.delete(user.id); } return next; });
    getSocket().emit("meeting:hand", { meetingId, raised });
  }

  function sendReaction(emoji: string) {
    setReactionOpen(false);
    getSocket().emit("meeting:reaction", { meetingId, emoji });
  }

  useEffect(() => {
    if (sidePanel !== "files" || !entered) return;
    void api.meetings.files(meetingId!)
      .then(setFiles)
      .catch((error) => show(error instanceof Error ? error.message : t("meetingRoom.filesLoadFailed"), "error"));
  }, [sidePanel, entered, meetingId, show]);

  async function uploadMeetingFile(file: File) {
    if (file.size > 100 * 1024 * 1024) {
      show(t("meetingRoom.fileTooLarge"), "error");
      return;
    }
    setUploadingFile(true);
    try {
      const shared = await api.meetings.shareFile(meetingId!, file);
      setFiles((current) => current.some((item) => item.id === shared.id) ? current : [shared, ...current]);
      setSidePanel("files");
      show(t("meetingRoom.fileShared"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("meetingRoom.fileShareFailed"), "error");
    } finally {
      setUploadingFile(false);
      if (meetingFileInput.current) meetingFileInput.current.value = "";
    }
  }

  useEffect(() => () => { if (entered) cleanup(); }, [entered, cleanup]);

  // Last-resort release of the camera/mic: on unmount, and when the page is
  // being torn down or backgrounded on mobile (where pagehide, not unload, is
  // the event that actually fires). Without this the OS keeps showing the
  // recording indicator after the tab goes away.
  useEffect(() => {
    const release = () => {
      previewStreamRef.current?.getTracks().forEach((track) => track.stop());
      currentStream.current?.getTracks().forEach((track) => track.stop());
      screenTrack.current?.stop();
    };
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      release();
    };
  }, []);

  /** Lazily creates (or reuses) a Web Audio analyser for one participant's audio track. */
  const ensureAudioAnalyser = useCallback((id: string, stream: MediaStream) => {
    const existing = audioAnalysers.current.get(id);
    if (existing) return existing;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return null;
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const node = { ctx, analyser, data: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) };
      audioAnalysers.current.set(id, node);
      return node;
    } catch {
      return null;
    }
  }, []);

  // Active speaker detection — pure client-side volume polling on tracks we
  // already receive over WebRTC. Requires 2 consecutive above-threshold
  // ticks before switching, so a brief cough/click doesn't steal focus.
  useEffect(() => {
    if (!entered) return;
    const SPEAKING_THRESHOLD = 14;
    const STABLE_TICKS_REQUIRED = 2;
    const interval = window.setInterval(() => {
      const levels: Array<[string, number]> = [];
      if (localStream && microphone) {
        const node = ensureAudioAnalyser(selfId, localStream);
        if (node) {
          node.analyser.getByteFrequencyData(node.data);
          levels.push([selfId, node.data.reduce((a, b) => a + b, 0) / node.data.length]);
        }
      }
      for (const [uid, stream] of Object.entries(remoteStreams)) {
        const node = ensureAudioAnalyser(uid, stream);
        if (node) {
          node.analyser.getByteFrequencyData(node.data);
          levels.push([uid, node.data.reduce((a, b) => a + b, 0) / node.data.length]);
        }
      }
      const loudest = levels.filter(([, level]) => level > SPEAKING_THRESHOLD).sort((a, b) => b[1] - a[1])[0];
      if (!loudest) return;
      const [uid] = loudest;
      for (const key of speakerStableTicks.current.keys()) {
        if (key !== uid) speakerStableTicks.current.set(key, 0);
      }
      const ticks = (speakerStableTicks.current.get(uid) || 0) + 1;
      speakerStableTicks.current.set(uid, ticks);
      if (ticks >= STABLE_TICKS_REQUIRED) {
        setActiveSpeakerId((current) => (current === uid ? current : uid));
      }
    }, 400);
    return () => window.clearInterval(interval);
  }, [entered, localStream, remoteStreams, microphone, selfId, ensureAudioAnalyser]);

  // Close every analyser's AudioContext on unmount — AudioContext instances
  // are a limited browser resource, never leave them dangling.
  useEffect(() => () => {
    audioAnalysers.current.forEach((node) => node.ctx.close().catch(() => {}));
    audioAnalysers.current.clear();
  }, []);

  const remoteEntries = Object.entries(remoteStreams);
  const securityCode = Object.values(securityCodes)[0];

  // ── Screen Share / Active Speaker auto-focus ──────────────────────────────
  // Priority: Screen Share > Active Speaker > Pinned > Grid. Screen-share
  // state is already synced across peers via the existing `meeting:toggle`
  // event (remoteMedia[id].screen); active speaker is detected purely
  // client-side via Web Audio levels on each already-received track — no new
  // socket events or server state needed for either signal.
  // NOTE: this block must stay ABOVE every conditional `return` below —
  // none of these hooks depend on `meeting`/`loading`, but calling them only
  // on some renders (e.g. after `loading` flips) would violate the rules of
  // hooks and crash React on the transition.
  const screenSharingUserId = useMemo(() => {
    if (screenSharing) return selfId;
    const entry = Object.entries(remoteMedia).find(([, media]) => media?.screen);
    return entry ? entry[0] : null;
  }, [screenSharing, remoteMedia, selfId]);

  const focusedUserId = screenSharingUserId || activeSpeakerId || pinnedUserId || null;

  const allTiles = useMemo(() => {
    const self = {
      id: selfId,
      stream: screenStream || localStream,
      label: screenSharing ? t("meetingRoom.youSharingScreen") : t("meetingRoom.you"),
      avatar: user || undefined,
      mic: microphone,
      video: camera || screenSharing,
      isSelf: true,
    };
    const remotes = remoteEntries.map(([id, stream]) => {
      const remote = users.get(id);
      const media = remoteMedia[id];
      return {
        id,
        stream,
        label: `${remote ? `${remote.firstName} ${remote.lastName}`.trim() : t("meetingRoom.participantFallback")}${media?.screen ? t("meetingRoom.screenSuffix") : ""}`,
        avatar: remote,
        mic: media?.audio ?? true,
        video: media?.video ?? true,
        isSelf: false,
      };
    });
    return [self, ...remotes];
  }, [selfId, screenStream, localStream, screenSharing, user, microphone, camera, remoteEntries, users, remoteMedia, t]);

  const focusedTile = focusedUserId ? allTiles.find((tile) => tile.id === focusedUserId) ?? null : null;

  // ── Standalone persistent instance: full page vs. floating widget vs. idle ──
  // directMode is unaffected (always "full", exactly as before). The
  // standalone instance (mounted once at the app root) is "full" while on
  // its own /meetings/:id route, becomes a floating widget when the user
  // navigates elsewhere while still in the call, and renders nothing when
  // there's no active call and no matching route. (isFullMode is computed up
  // top, next to routeMatch, because the lobby preview effect needs it too.)
  const isWidgetMode = !isFullMode && entered;

  if (!meetingId && !isWidgetMode) return null;

  if (isWidgetMode) {
    return (
      <FloatingMeetingWidget
        tile={focusedTile}
        title={meeting?.title || ""}
        microphone={microphone}
        camera={camera}
        onToggleMic={() => void toggleTrack("audio")}
        onToggleCamera={() => void toggleTrack("video")}
        onExpand={() => navigate(`/meetings/${meetingId}`)}
        onLeave={leave}
      />
    );
  }

  if (!isFullMode) return null;

  const overlayClass = directMode ? "" : "meeting-standalone-overlay";
  if (loading) return <div className={`meeting-room-loading ${overlayClass}`}><LoaderCircle className="spin" size={26} /><p>{t("meetingRoom.preparing")}</p></div>;
  if (accessDenied) return <div className={`meeting-room-loading ${overlayClass}`}><ShieldX size={26} /><p><strong>{t("meetingRoom.accessDeniedTitle")}</strong></p><p>{accessDenied}</p><Button onClick={() => directMode ? onDirectClose?.() : navigate("/meetings")}>{t("meetingRoom.back")}</Button></div>;
  if (!meeting) return <div className={`meeting-room-loading ${overlayClass}`}><p>{directMode ? t("meetingRoom.callNotFound") : t("meetingRoom.meetingNotFound")}</p><Button onClick={() => directMode ? onDirectClose?.() : navigate("/meetings")}>{t("meetingRoom.back")}</Button></div>;

  if (!entered) return (
    <div className={`meeting-lobby ${overlayClass}`}>
      <header><button className="icon-button" onClick={() => directMode ? onDirectClose?.() : navigate("/meetings")} aria-label={t("meetingRoom.back")}><ArrowLeft size={20} /></button><span className="lobby-brand">{directMode ? t("meetingRoom.directCallBrand") : t("meetingRoom.brand")}</span><span className="lobby-secure"><Signal size={15} /> {t("meetingRoom.secureConnection")}</span></header>
      <main>
        <section className="lobby-media-column">
          <div className="lobby-preview"><VideoTile stream={previewStream} muted mirrored label={t("meetingRoom.you")} avatar={user || undefined} microphoneOn={microphone} /><div className="lobby-preview-controls"><button className={microphone ? "active" : "off"} onClick={() => setMicrophone((value) => !value)} aria-label={t("meetingRoom.microphoneAria")}>{microphone ? <Mic size={20} /> : <MicOff size={20} />}</button><button className={camera ? "active" : "off"} onClick={() => setCamera((value) => !value)} aria-label={t("meetingRoom.cameraAria")}>{camera ? <Camera size={20} /> : <CameraOff size={20} />}</button><button onClick={() => setSettingsOpen((value) => !value)} aria-label={t("meetingRoom.deviceSettingsAria")} aria-expanded={settingsOpen}><Settings2 size={20} /></button></div></div>
          {permissionError && <div className="permission-notice" role="alert"><CameraOff size={18} /><span>{permissionError}</span></div>}
          {settingsOpen && <div className="device-settings"><label>{t("meetingRoom.cameraLabel")}<select value={cameraDevice} onChange={(event) => setCameraDevice(event.target.value)}><option value="">{t("meetingRoom.defaultCamera")}</option>{devices.filter((device) => device.kind === "videoinput").map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || t("meetingRoom.cameraFallback")}</option>)}</select></label><label>{t("meetingRoom.microphoneLabel")}<select value={microphoneDevice} onChange={(event) => setMicrophoneDevice(event.target.value)}><option value="">{t("meetingRoom.defaultMicrophone")}</option>{devices.filter((device) => device.kind === "audioinput").map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || t("meetingRoom.microphoneFallback")}</option>)}</select></label></div>}
        </section>
        <section className="lobby-details"><span className={`status-pill status-${meeting.status}`}>{meeting.status === "live" ? t("meetingRoom.liveLabel") : t("meetingRoom.readyLabel")}</span><h1>{meeting.title}</h1><p>{meeting.description || t("meetingRoom.lobbyDescriptionFallback")}</p><div className="lobby-meta"><span><UsersRound size={17} /> {t("meetingRoom.participantCountLabel", { count: meeting.participantCount })}</span><button onClick={() => void shareMeetingLink()}><Link2 size={17} /> {t("meetingRoom.shareLinkButton")}</button></div>
          {requestState === "pending" ? (
            <div className="join-request-pending"><Hourglass size={18} className="spin-slow" /><div><strong>{t("meetingRoom.requestPendingTitle")}</strong><small>{t("meetingRoom.requestPendingDesc")}</small></div><Button variant="secondary" onClick={() => void cancelJoinRequest()}>{t("meetingRoom.cancelRequestButton")}</Button></div>
          ) : requestState === "rejected" ? (
            <div className="join-request-pending join-request-rejected"><ShieldX size={18} /><div><strong>{t("meetingRoom.requestRejectedTitle")}</strong><small>{t("meetingRoom.requestRejectedDesc")}</small></div></div>
          ) : meeting.access && !meeting.access.canJoin && meeting.access.canRequest ? (
            <Button loading={requestState === "requesting"} onClick={() => void sendJoinRequest()} icon={<Hourglass size={18} />}>{t("meetingRoom.requestToJoinButton")}</Button>
          ) : (
            <Button loading={joining} onClick={() => void enterMeeting()} icon={<Video size={18} />}>{t("meetingRoom.joinNowButton")}</Button>
          )}
          <small><Check size={14} /> {t("meetingRoom.deviceStateHint")}</small></section>
      </main>
    </div>
  );

  return (
    <div className={`meeting-room ${directMode ? "direct-call-room" : overlayClass}`}>
      <header className="meeting-room-header"><div><span className={`connection-dot ${connectionState}`} /><span><strong>{meeting.title}{meeting.locked && <span className="locked-badge"><Lock size={12} /> {t("meetingRoom.lockedBadge")}</span>}</strong><small>{connectionState === "connected" ? t("meetingRoom.connectionStable") : connectionState === "offline" ? t("meetingRoom.reconnecting") : t("meetingRoom.connecting")}</small></span></div><div className="meeting-header-actions">{!directMode && <button onClick={() => navigate("/")} aria-label={t("meetingRoom.minimizeMeetingAria")} title={t("meetingRoom.minimizeMeetingAria")}><Minus size={18} /></button>}<button onClick={() => setSidePanel(sidePanel === "files" ? null : "files")} aria-label={t("meetingRoom.sharedFilesAria")}><Paperclip size={18} />{files.length > 0 && <span>{files.length}</span>}</button><button onClick={() => setSidePanel(sidePanel === "info" ? null : "info")} aria-label={t("meetingRoom.meetingInfoAria")}><Info size={18} /></button>{canManageWaitingRoom && <button onClick={() => setSidePanel(sidePanel === "waiting" ? null : "waiting")} aria-label={t("meetingRoom.waitingRoomTab")}><Hourglass size={18} />{(waitingCount ?? waitingRequests.length) > 0 && <span>{waitingCount ?? waitingRequests.length}</span>}</button>}{meeting.hostId === user?.id && <button onClick={() => void toggleLock()} disabled={lockBusy} aria-label={meeting.locked ? t("meetingRoom.unlockMeetingButton") : t("meetingRoom.lockMeetingButton")} className={meeting.locked ? "active" : ""}>{lockBusy ? <LoaderCircle className="spin" size={18} /> : meeting.locked ? <Lock size={18} /> : <Unlock size={18} />}</button>}{meeting.hostId === user?.id && <button onClick={() => setSidePanel(sidePanel === "settings" ? null : "settings")} aria-label={t("meetingRoom.settingsTab")}><Settings2 size={18} /></button>}<button onClick={() => setSidePanel(sidePanel === "participants" ? null : "participants")} aria-label={t("meetingRoom.participantsAria")}><UsersRound size={18} /><span>{remoteEntries.length + 1}</span></button></div></header>
      {securityCode && <button className="call-security-badge" onClick={() => setSidePanel("info")} aria-label={t("meetingRoom.checkSecurityKeyAria")}><ShieldCheck size={16} /><span>{securityCode.map((emoji, index) => <b key={`${emoji}-${index}`}>{emoji}</b>)}</span><small>{t("meetingRoom.compareKeyHint")}</small></button>}
      <div className={`meeting-stage ${sidePanel ? "panel-open" : ""}`}>
      {focusedTile ? (
        <main className="meeting-stage-focus">
          <div className="stage-main">
            <VideoTile stream={focusedTile.stream} muted={focusedTile.isSelf} mirrored={focusedTile.isSelf && !screenSharing} label={focusedTile.label} avatar={focusedTile.avatar} microphoneOn={focusedTile.mic} videoOn={focusedTile.video} pinned={pinnedUserId === focusedTile.id} pipEnabled handRaised={raisedHands.has(focusedTile.id)} onPin={() => setPinnedUserId((current) => current === focusedTile.id ? null : focusedTile.id)} />
          </div>
          <div className="stage-filmstrip">
            {allTiles.filter((tile) => tile.id !== focusedTile.id).map((tile) => (
              <VideoTile key={tile.id} stream={tile.stream} muted={tile.isSelf} mirrored={tile.isSelf} label={tile.label} avatar={tile.avatar} microphoneOn={tile.mic} videoOn={tile.video} pinned={pinnedUserId === tile.id} speaking={tile.id === activeSpeakerId} handRaised={raisedHands.has(tile.id)} onPin={() => setPinnedUserId((current) => current === tile.id ? null : tile.id)} />
            ))}
          </div>
        </main>
      ) : (
        <main className={`video-grid video-grid-${Math.min(4, remoteEntries.length + 1)}`}>
          <VideoTile stream={screenStream || localStream} muted mirrored={!screenSharing} label={screenSharing ? t("meetingRoom.youSharingScreen") : t("meetingRoom.you")} avatar={user || undefined} microphoneOn={microphone} pinned={pinnedUserId === user?.id} speaking={selfId === activeSpeakerId} handRaised={Boolean(user?.id && raisedHands.has(user.id))} onPin={() => setPinnedUserId((current) => current === user?.id ? null : user?.id || null)} />
          {remoteEntries.map(([remoteUserId, stream]) => { const remote = users.get(remoteUserId); const media = remoteMedia[remoteUserId]; return <VideoTile key={remoteUserId} stream={stream} label={`${remote ? `${remote.firstName} ${remote.lastName}`.trim() : t("meetingRoom.participantFallback")}${media?.screen ? t("meetingRoom.screenSuffix") : ""}`} avatar={remote} microphoneOn={media?.audio ?? true} videoOn={media?.video ?? true} pinned={pinnedUserId === remoteUserId} speaking={remoteUserId === activeSpeakerId} handRaised={raisedHands.has(remoteUserId)} onPin={() => setPinnedUserId((current) => current === remoteUserId ? null : remoteUserId)} />; })}
          {remoteEntries.length === 0 && <article className="waiting-tile"><span><UsersRound size={28} /></span><h2>{t("meetingRoom.waitingTitle")}</h2><p>{t("meetingRoom.waitingDesc")}</p><button onClick={() => void shareMeetingLink()}><Link2 size={16} /> {t("meetingRoom.shareLinkButton")}</button></article>}
        </main>
      )}
      {sidePanel && <aside className="meeting-side-panel"><header><div><strong>{sidePanel === "participants" ? t("meetingRoom.participantsTab") : sidePanel === "files" ? t("meetingRoom.filesTab") : sidePanel === "waiting" ? t("meetingRoom.waitingRoomTab") : sidePanel === "settings" ? t("meetingRoom.settingsTab") : t("meetingRoom.infoTab")}</strong><small>{sidePanel === "participants" ? t("meetingRoom.peopleCount", { count: remoteEntries.length + 1 }) : sidePanel === "files" ? t("meetingRoom.filesCount", { count: files.length }) : sidePanel === "waiting" ? t("meetingRoom.waitingRoomCount", { count: waitingCount ?? waitingRequests.length }) : meeting.code}</small></div><button onClick={() => setSidePanel(null)} aria-label={t("meetingRoom.closePanelAria")}><X size={19} /></button></header>{sidePanel === "participants" ? <div className="participant-list"><div><Avatar firstName={user?.firstName} lastName={user?.lastName} url={user?.avatarUrl} size="sm" /><span><strong>{user?.firstName} {user?.lastName}{t("meetingRoom.youSuffix")}</strong><small>{meeting.hostId === user?.id ? t("meetingRoom.hostLabel") : t("meetingRoom.participantLabel")}</small></span>{microphone ? <Mic size={16} /> : <MicOff size={16} />}</div>{remoteEntries.map(([id]) => { const remote = users.get(id); const media = remoteMedia[id]; return <div key={id}><Avatar firstName={remote?.firstName} lastName={remote?.lastName} url={remote?.avatarUrl} size="sm" /><span><strong>{remote ? `${remote.firstName} ${remote.lastName}` : t("meetingRoom.participantFallback")}</strong><small>{media?.screen ? t("meetingRoom.sharingScreenLabel") : t("meetingRoom.inMeetingLabel")}</small></span>{media?.audio === false ? <MicOff size={16} /> : <Mic size={16} />}</div>; })}</div> : sidePanel === "waiting" ? <div className="waiting-room-panel">
        {waitingRequests.length > 1 && <div className="waiting-room-batch"><Button variant="secondary" onClick={() => void reviewAllRequests("reject")} icon={<X size={16} />}>{t("meetingRoom.rejectAll")}</Button><Button onClick={() => void reviewAllRequests("approve")} icon={<Check size={16} />}>{t("meetingRoom.acceptAll")}</Button></div>}
        {waitingRequests.length === 0 ? <div className="meeting-files-empty"><Hourglass size={26} /><strong>{t("meetingRoom.waitingRoomEmptyTitle")}</strong><small>{t("meetingRoom.waitingRoomEmptyDesc")}</small></div> : <div className="waiting-room-list">{waitingRequests.map((request) => (
          <div className="waiting-room-item" key={request.id}>
            <Avatar firstName={request.firstName} lastName={request.lastName} url={request.avatarUrl} size="sm" />
            <span><strong>{`${request.firstName || ""} ${request.lastName || ""}`.trim() || t("meetingRoom.participantFallback")}</strong></span>
            <button className="waiting-room-accept" disabled={waitingBusy === request.id} onClick={() => void reviewRequest(request, "approve")} aria-label={t("meetingRoom.acceptAria")}>{waitingBusy === request.id ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}</button>
            <button className="waiting-room-reject" disabled={waitingBusy === request.id} onClick={() => void reviewRequest(request, "reject")} aria-label={t("meetingRoom.rejectAria")}><X size={16} /></button>
          </div>
        ))}</div>}
      </div> : sidePanel === "files" ? <div className="meeting-files-panel"><button className="meeting-file-upload" onClick={() => meetingFileInput.current?.click()} disabled={uploadingFile}>{uploadingFile ? <LoaderCircle className="spin" size={18} /> : <Paperclip size={18} />}<span><strong>{uploadingFile ? t("meetingRoom.uploadingLabel") : t("meetingRoom.shareFileTitle")}</strong><small>{t("meetingRoom.fileFormatsHint")}</small></span></button>{files.length === 0 ? <div className="meeting-files-empty"><FileText size={26} /><strong>{t("meetingRoom.noFilesTitle")}</strong><small>{t("meetingRoom.noFilesDesc")}</small></div> : <div className="meeting-file-list">{files.map((file) => <a key={file.id} href={file.storageUrl} target="_blank" rel="noreferrer"><span><FileText size={19} /></span><span><strong>{file.fileName}</strong><small>{fileSize(file.fileSize)} · {file.firstName || t("meetingRoom.participantFallback")}</small></span><Download size={17} /></a>)}</div>}</div> : sidePanel === "settings" ? <div className="meeting-info-panel">
        <label>{t("meetings.visibilityLabel")}
          <select value={settingsVisibility} onChange={(event) => setSettingsVisibility(event.target.value as MeetingVisibility)}>
            {(["workspace_only", "private", "public", "invite_only"] as MeetingVisibility[]).map((option) => <option key={option} value={option}>{visibilityLabel(option)}</option>)}
          </select>
        </label>
        {settingsVisibility !== "invite_only" && settingsVisibility !== "private" && (
          <label>{t("meetings.joinPolicyLabel")}
            <select value={settingsJoinPolicy} onChange={(event) => setSettingsJoinPolicy(event.target.value as MeetingJoinPolicyValue)}>
              <option value="auto">{t("meetings.joinPolicyAuto")}</option>
              <option value="request_approval">{t("meetings.joinPolicyApproval")}</option>
            </select>
          </label>
        )}
        <Button loading={settingsSaving} onClick={() => void saveMeetingSettings()} icon={<Check size={17} />}>{t("meetingRoom.settingsSaveButton")}</Button>
        <Button variant="secondary" onClick={() => void toggleLock()} loading={lockBusy} icon={meeting.locked ? <Unlock size={17} /> : <Lock size={17} />}>{meeting.locked ? t("meetingRoom.unlockMeetingButton") : t("meetingRoom.lockMeetingButton")}</Button>
        <hr className="settings-divider" />
        <label>{t("meetingRoom.inviteSectionTitle")}
          <textarea rows={3} value={inviteEmailsInput} onChange={(event) => setInviteEmailsInput(event.target.value)} placeholder={t("meetingRoom.inviteEmailPlaceholder")} />
        </label>
        <p className="field-hint">{t("meetingRoom.inviteEmailHint")}</p>
        <Button loading={inviting} onClick={() => void sendInvite()} icon={<Link2 size={17} />}>{t("meetingRoom.inviteButton")}</Button>
      </div> : <div className="meeting-info-panel"><p>{meeting.description || t("meetingRoom.meetingDescriptionFallback")}</p><label>{t("meetingRoom.meetingCodeLabel")}<span><code>{meeting.code}</code><button onClick={() => { void navigator.clipboard.writeText(meeting.code); show(t("meetingRoom.codeCopied")); }}><Copy size={16} /></button></span></label><Button onClick={() => void shareMeetingLink()} icon={<Link2 size={17} />}>{t("meetingRoom.shareLinkButton")}</Button></div>}</aside>}
      </div>
      <div className="meeting-reaction-layer" aria-live="polite">{reactions.map((reaction) => <span key={reaction.id}>{reaction.emoji}</span>)}</div>
      <input ref={meetingFileInput} className="sr-only" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMeetingFile(file); }} />
      <footer className="meeting-controls"><div className="meeting-control-info"><time>{new Intl.DateTimeFormat(localeTag[locale] || "uz-UZ", { hour: "2-digit", minute: "2-digit" }).format(new Date())}</time><span>{meeting.code}</span></div><div className="meeting-control-primary"><button className={microphone ? "" : "off"} onClick={() => void toggleTrack("audio")} aria-label={microphone ? t("meetingRoom.turnOffMicAria") : t("meetingRoom.turnOnMicAria")}>{microphone ? <Mic size={21} /> : <MicOff size={21} />}</button><button className={camera ? "" : "off"} onClick={() => void toggleTrack("video")} aria-label={camera ? t("meetingRoom.turnOffCameraAria") : t("meetingRoom.turnOnCameraAria")}>{camera ? <Camera size={21} /> : <CameraOff size={21} />}</button><button className={screenSharing ? "active" : ""} onClick={() => void toggleScreen()} aria-label={t("meetingRoom.shareScreenAria")}><MonitorUp size={21} /></button><button onClick={() => meetingFileInput.current?.click()} disabled={uploadingFile} aria-label={t("meetingRoom.shareFileAria")}>{uploadingFile ? <LoaderCircle className="spin" size={20} /> : <Paperclip size={20} />}</button><button className={handRaised ? "active" : ""} onClick={toggleHand} aria-label={handRaised ? t("meetingRoom.lowerHandAria") : t("meetingRoom.raiseHandAria")}><Hand size={21} /></button><span className="meeting-reaction-wrap"><button className={reactionOpen ? "active" : ""} onClick={() => setReactionOpen((value) => !value)} aria-label={t("meetingRoom.sendReactionAria")}><Smile size={21} /></button>{reactionOpen && <span className="meeting-reaction-menu">{["👍", "❤️", "🎉", "👏", "😂", "😮"].map((emoji) => <button key={emoji} onClick={() => sendReaction(emoji)}>{emoji}</button>)}</span>}</span><button className="leave-control" onClick={leave} aria-label={t("meetingRoom.leaveMeetingAria")}><PhoneOff size={21} /></button></div><div className="meeting-control-secondary"><button aria-label={t("meetingRoom.gridViewAria")}><LayoutGrid size={20} /></button><button onClick={() => setSidePanel(sidePanel === "files" ? null : "files")} aria-label={t("meetingRoom.sharedFilesAria")}><Paperclip size={20} /></button><button aria-label={t("meetingRoom.moreActionsAria")}><MoreVertical size={20} /></button></div></footer>
    </div>
  );
}

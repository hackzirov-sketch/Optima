import { ArrowLeft, Camera, CameraOff, Check, Circle, Copy, Download, FileText, Hand, Info, LayoutGrid, Link2, LoaderCircle, Mic, MicOff, MonitorUp, MoreVertical, Paperclip, PhoneOff, Pin, Settings2, ShieldCheck, Signal, Smile, Square, UsersRound, Video, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Avatar, Button } from "../components/ui";
import { useToast } from "../components/Toast";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { getSocket } from "../lib/socket";
import type { Meeting, MeetingFile, User, WorkspaceMember } from "../types";

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

function VideoTile({ stream, muted, mirrored = false, label, avatar, microphoneOn = true, videoOn = true, pinned = false, handRaised = false, onPin }: { stream?: MediaStream; muted?: boolean; mirrored?: boolean; label: string; avatar?: Pick<User, "firstName" | "lastName" | "avatarUrl">; microphoneOn?: boolean; videoOn?: boolean; pinned?: boolean; handRaised?: boolean; onPin?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream; }, [stream]);
  const hasVideo = videoOn && Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled));
  return (
    <article className={`video-tile ${mirrored ? "video-tile-mirrored" : ""} ${pinned ? "video-tile-pinned" : ""}`}>
      {stream && <video ref={ref} className={hasVideo ? "" : "video-audio-only"} autoPlay playsInline muted={muted} />}
      {!hasVideo && <div className="video-placeholder"><Avatar firstName={avatar?.firstName || label} lastName={avatar?.lastName} url={avatar?.avatarUrl} size="xl" /></div>}
      <span className="video-label">{label}</span>
      {handRaised && <span className="tile-hand" title="Qo'l ko'tarilgan"><Hand size={16} /></span>}
      {onPin && <button className={`tile-pin ${pinned ? "active" : ""}`} onClick={onPin} aria-label={pinned ? "Videoni bo'shatish" : "Videoni mahkamlash"}><Pin size={15} /></button>}
      {!microphoneOn && <span className="tile-muted" aria-label="Mikrofon o‘chirilgan"><MicOff size={15} /></span>}
    </article>
  );
}

export function MeetingRoomPage({ meetingId, directMode = false, onDirectClose }: { meetingId: string; directMode?: boolean; onDirectClose?: () => void }) {
  const { user, workspace } = useAuth();
  const { show } = useToast();
  const [, navigate] = useLocation();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [entered, setEntered] = useState(false);
  const [joining, setJoining] = useState(false);
  const [camera, setCamera] = useState(() => sessionStorage.getItem(`optima:meeting-camera:${meetingId}`) !== "off");
  const [microphone, setMicrophone] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream>();
  const [previewStream, setPreviewStream] = useState<MediaStream>();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraDevice, setCameraDevice] = useState("");
  const [microphoneDevice, setMicrophoneDevice] = useState("");
  const [permissionError, setPermissionError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidePanel, setSidePanel] = useState<"participants" | "info" | "files" | null>(null);
  const [files, setFiles] = useState<MeetingFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const meetingFileInput = useRef<HTMLInputElement>(null);
  const [handRaised, setHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [reactionOpen, setReactionOpen] = useState(false);
  const [reactions, setReactions] = useState<Array<{ id: string; userId: string; emoji: string }>>([]);
  const [pinnedUserId, setPinnedUserId] = useState<string | null>(null);
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
  const [leavePrompt, setLeavePrompt] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const recordingIdRef = useRef<string | null>(null);
  const recordingStateRef = useRef<{ recorder: MediaRecorder; chunks: Blob[]; canvas: HTMLCanvasElement; audioCtx: AudioContext; rafId: number; outputStream: MediaStream } | null>(null);
  const stageRef = useRef<HTMLElement>(null);
  const cleanupRef = useRef<() => void>(() => {});

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

  useEffect(() => {
    if (entered || (!camera && !microphone)) {
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
    }).catch(() => setPermissionError("Kamera yoki mikrofon ruxsati berilmadi. Brauzer sozlamalarini tekshiring."));
    return () => { cancelled = true; };
  // Device selection intentionally restarts preview.
  }, [entered, camera, microphone, cameraDevice, microphoneDevice]);

  useEffect(() => {
    Promise.all([api.meetings.one(meetingId), workspace ? api.workspaces.members(workspace.id).catch(() => []) : Promise.resolve([])])
      .then(([nextMeeting, nextMembers]) => { setMeeting(nextMeeting); setMembers(nextMembers); })
      .catch((error) => show(error instanceof Error ? error.message : "Meeting ochilmadi", "error"))
      .finally(() => setLoading(false));
  }, [meetingId, workspace?.id, show]);

  const users = useMemo(() => new Map(members.map((member) => [member.userId, member.user as User])), [members]);
  const isHost = Boolean(meeting && user && meeting.hostId === user.id);
  const myRole = meeting?.participants.find((participant) => participant.userId === user?.id)?.role;
  const canRecord = isHost || myRole === "co_host";

  async function shareMeetingLink() {
    if (!meeting) return;
    const url = `${window.location.origin}/meetings/${meeting.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: meeting.title, text: `OPTIMA meeting kodi: ${meeting.code}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        show("Meeting havolasi nusxalandi");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      show("Havolani ulashib bo‘lmadi", "error");
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
    const onMeetingError = ({ message }: { message: string }) => { show(message || "Meetingga qo‘shilib bo‘lmadi", "error"); setEntered(false); };
    const onMeetingEnded = ({ reason }: { reason?: string }) => {
      show(reason === "host_ended" ? "Host meetingni yakunladi" : "Meeting yakunlandi");
      cleanupRef.current();
      if (directMode) onDirectClose?.(); else navigate("/meetings");
    };
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
    socket.on("meeting:ended", onMeetingEnded);
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
      socket.off("meeting:ended", onMeetingEnded);
    };
  }, [entered, meetingId, sendOffer, sendSecurityKey, updateSecurityCode, createPeer, flushIce, closePeer, show, user?.id, directMode, onDirectClose, navigate]);

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
      show("Kamera yoki mikrofon ochilmadi. Pastdagi tugma orqali qayta urinishingiz mumkin.", "error");
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
        show(`${kind === "video" ? "Kamera" : "Mikrofon"} ochilmadi. Brauzer ruxsatini tekshiring.`, "error");
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
      show("Ekran ulash bekor qilindi", "error");
    }
  }

  const drawRecordingFrame = useCallback(() => {
    const state = recordingStateRef.current;
    if (!state) return;
    const ctx = state.canvas.getContext("2d");
    const videos = stageRef.current ? (Array.from(stageRef.current.querySelectorAll("video")) as HTMLVideoElement[]) : [];
    if (ctx) {
      const count = Math.max(1, videos.length);
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      const cellW = state.canvas.width / cols;
      const cellH = state.canvas.height / rows;
      ctx.fillStyle = "#0b0b0f";
      ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);
      videos.forEach((video, index) => {
        if (video.readyState < 2 || !video.videoWidth) return;
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = col * cellW;
        const y = row * cellH;
        const scale = Math.min(cellW / video.videoWidth, cellH / video.videoHeight);
        const w = video.videoWidth * scale;
        const h = video.videoHeight * scale;
        ctx.drawImage(video, x + (cellW - w) / 2, y + (cellH - h) / 2, w, h);
      });
    }
    state.rafId = requestAnimationFrame(drawRecordingFrame);
  }, []);

  // Client-side "meeting recording": composites every visible <video> tile onto
  // a canvas and mixes every stream's audio through Web Audio, since this
  // backend uses mesh WebRTC (no SFU to record server-side). The blob is
  // uploaded to R2 via the same presign flow used for shared files.
  const startRecording = useCallback(async () => {
    if (!canRecord || recording || recordingBusy) return;
    setRecordingBusy(true);
    try {
      const created = await api.meetings.recordings.start(meetingId);
      recordingIdRef.current = created.id;
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const canvasStream = canvas.captureStream(30);
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      const sourceStreams = [currentStream.current, ...Object.values(remoteStreams)].filter(Boolean) as MediaStream[];
      for (const stream of sourceStreams) {
        if (!stream.getAudioTracks().length) continue;
        try { audioCtx.createMediaStreamSource(stream).connect(dest); } catch { /* stream not mixable — skip */ }
      }
      const outputStream = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
      const recorder = new MediaRecorder(outputStream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.start(1000);
      recordingStateRef.current = { recorder, chunks, canvas, audioCtx, rafId: 0, outputStream };
      recordingStateRef.current.rafId = requestAnimationFrame(drawRecordingFrame);
      setRecording(true);
      show("Yozib olish boshlandi");
    } catch (error) {
      show(error instanceof Error ? error.message : "Yozib olishni boshlab bo‘lmadi", "error");
    } finally {
      setRecordingBusy(false);
    }
  }, [canRecord, recording, recordingBusy, meetingId, remoteStreams, drawRecordingFrame, show]);

  const stopRecording = useCallback(async () => {
    const state = recordingStateRef.current;
    const recordingId = recordingIdRef.current;
    if (!state || !recordingId) return;
    setRecordingBusy(true);
    try {
      cancelAnimationFrame(state.rafId);
      const blob: Blob = await new Promise((resolve) => {
        state.recorder.onstop = () => resolve(new Blob(state.chunks, { type: state.recorder.mimeType || "video/webm" }));
        if (state.recorder.state !== "inactive") state.recorder.stop();
        else resolve(new Blob(state.chunks, { type: "video/webm" }));
      });
      state.outputStream.getTracks().forEach((track) => track.stop());
      await state.audioCtx.close().catch(() => {});
      recordingStateRef.current = null;
      setRecording(false);
      const signed = await api.meetings.recordings.upload(meetingId, recordingId, blob);
      await api.meetings.recordings.stop(meetingId, { storageKey: signed.storageKey, storageUrl: signed.storageUrl, fileSize: blob.size });
      show("Yozuv saqlandi");
    } catch (error) {
      show(error instanceof Error ? error.message : "Yozuvni saqlab bo‘lmadi", "error");
    } finally {
      recordingIdRef.current = null;
      setRecordingBusy(false);
    }
  }, [meetingId, show]);

  function toggleRecording() {
    if (recording) void stopRecording();
    else void startRecording();
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
    const recState = recordingStateRef.current;
    if (recState) {
      cancelAnimationFrame(recState.rafId);
      if (recState.recorder.state !== "inactive") recState.recorder.stop();
      recState.outputStream.getTracks().forEach((track) => track.stop());
      recState.audioCtx.close().catch(() => {});
      recordingStateRef.current = null;
    }
  }, [meetingId]);
  cleanupRef.current = cleanup;

  async function performLeave() {
    if (recording) await stopRecording();
    cleanup();
    if (directMode) onDirectClose?.();
    else navigate("/meetings");
  }

  function leave() {
    if (isHost) { setLeavePrompt(true); return; }
    void performLeave();
  }

  async function confirmEndMeeting() {
    setLeavePrompt(false);
    if (recording) await stopRecording();
    try {
      await api.meetings.end(meetingId);
    } catch (error) {
      show(error instanceof Error ? error.message : "Meetingni yakunlab bo‘lmadi", "error");
    }
    cleanup();
    if (directMode) onDirectClose?.();
    else navigate("/meetings");
  }

  async function confirmLeaveOnly() {
    setLeavePrompt(false);
    await performLeave();
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
    void api.meetings.files(meetingId)
      .then(setFiles)
      .catch((error) => show(error instanceof Error ? error.message : "Fayllar ochilmadi", "error"));
  }, [sidePanel, entered, meetingId, show]);

  async function uploadMeetingFile(file: File) {
    if (file.size > 100 * 1024 * 1024) {
      show("Fayl hajmi 100 MB dan oshmasligi kerak", "error");
      return;
    }
    setUploadingFile(true);
    try {
      const shared = await api.meetings.shareFile(meetingId, file);
      setFiles((current) => current.some((item) => item.id === shared.id) ? current : [shared, ...current]);
      setSidePanel("files");
      show("Fayl qatnashchilarga ulashildi");
    } catch (error) {
      show(error instanceof Error ? error.message : "Fayl ulashilmadi", "error");
    } finally {
      setUploadingFile(false);
      if (meetingFileInput.current) meetingFileInput.current.value = "";
    }
  }

  useEffect(() => () => { if (entered) cleanup(); }, [entered, cleanup]);

  if (loading) return <div className="meeting-room-loading"><LoaderCircle className="spin" size={26} /><p>Meeting tayyorlanmoqda...</p></div>;
  if (!meeting) return <div className="meeting-room-loading"><p>{directMode ? "Qo'ng'iroq topilmadi." : "Meeting topilmadi."}</p><Button onClick={() => directMode ? onDirectClose?.() : navigate("/meetings")}>Orqaga</Button></div>;

  if (!entered) return (
    <div className="meeting-lobby">
      <header><button className="icon-button" onClick={() => directMode ? onDirectClose?.() : navigate("/meetings")} aria-label="Orqaga"><ArrowLeft size={20} /></button><span className="lobby-brand">{directMode ? "Direct call" : "Optima Meet"}</span><span className="lobby-secure"><Signal size={15} /> Himoyalangan aloqa</span></header>
      <main>
        <section className="lobby-media-column">
          <div className="lobby-preview"><VideoTile stream={previewStream} muted mirrored label="Siz" avatar={user || undefined} microphoneOn={microphone} /><div className="lobby-preview-controls"><button className={microphone ? "active" : "off"} onClick={() => setMicrophone((value) => !value)} aria-label="Mikrofon">{microphone ? <Mic size={20} /> : <MicOff size={20} />}</button><button className={camera ? "active" : "off"} onClick={() => setCamera((value) => !value)} aria-label="Kamera">{camera ? <Camera size={20} /> : <CameraOff size={20} />}</button><button onClick={() => setSettingsOpen((value) => !value)} aria-label="Qurilma sozlamalari" aria-expanded={settingsOpen}><Settings2 size={20} /></button></div></div>
          {permissionError && <div className="permission-notice" role="alert"><CameraOff size={18} /><span>{permissionError}</span></div>}
          {settingsOpen && <div className="device-settings"><label>Kamera<select value={cameraDevice} onChange={(event) => setCameraDevice(event.target.value)}><option value="">Standart kamera</option>{devices.filter((device) => device.kind === "videoinput").map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || "Kamera"}</option>)}</select></label><label>Mikrofon<select value={microphoneDevice} onChange={(event) => setMicrophoneDevice(event.target.value)}><option value="">Standart mikrofon</option>{devices.filter((device) => device.kind === "audioinput").map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || "Mikrofon"}</option>)}</select></label></div>}
        </section>
        <section className="lobby-details"><span className={`status-pill status-${meeting.status}`}>{meeting.status === "live" ? "Jonli" : "Tayyor"}</span><h1>{meeting.title}</h1><p>{meeting.description || "Meetingga qo‘shilishdan oldin kamera va mikrofonni tekshiring."}</p><div className="lobby-meta"><span><UsersRound size={17} /> {meeting.participantCount} qatnashchi</span><button onClick={() => void shareMeetingLink()}><Link2 size={17} /> Havolani ulashish</button></div><Button loading={joining} onClick={() => void enterMeeting()} icon={<Video size={18} />}>Hozir qo‘shilish</Button><small><Check size={14} /> Kamera va mikrofon holati siz tanlagandek saqlanadi.</small></section>
      </main>
    </div>
  );

  const remoteEntries = Object.entries(remoteStreams);
  const securityCode = Object.values(securityCodes)[0];
  return (
    <div className={`meeting-room ${directMode ? "direct-call-room" : ""}`}>
      <header className="meeting-room-header"><div><span className={`connection-dot ${connectionState}`} /><span><strong>{meeting.title}</strong><small>{connectionState === "connected" ? "Aloqa barqaror" : connectionState === "offline" ? "Qayta ulanmoqda" : "Ulanmoqda"}</small></span></div>{recording && <span className="recording-badge"><Circle size={9} /> YOZILMOQDA</span>}<div className="meeting-header-actions"><button onClick={() => setSidePanel(sidePanel === "files" ? null : "files")} aria-label="Ulashilgan fayllar"><Paperclip size={18} />{files.length > 0 && <span>{files.length}</span>}</button><button onClick={() => setSidePanel(sidePanel === "info" ? null : "info")} aria-label="Meeting ma’lumoti"><Info size={18} /></button><button onClick={() => setSidePanel(sidePanel === "participants" ? null : "participants")} aria-label="Qatnashchilar"><UsersRound size={18} /><span>{remoteEntries.length + 1}</span></button></div></header>
      {securityCode && <button className="call-security-badge" onClick={() => setSidePanel("info")} aria-label="Shifrlash kalitini tekshirish"><ShieldCheck size={16} /><span>{securityCode.map((emoji, index) => <b key={`${emoji}-${index}`}>{emoji}</b>)}</span><small>Kalitni solishtiring</small></button>}
      <div className={`meeting-stage ${sidePanel ? "panel-open" : ""}`}>
      <main ref={stageRef} className={`video-grid video-grid-${Math.min(4, remoteEntries.length + 1)}`}>
        <VideoTile stream={screenStream || localStream} muted mirrored={!screenSharing} label={screenSharing ? "Siz ekran ulashyapsiz" : "Siz"} avatar={user || undefined} microphoneOn={microphone} pinned={pinnedUserId === user?.id} handRaised={Boolean(user?.id && raisedHands.has(user.id))} onPin={() => setPinnedUserId((current) => current === user?.id ? null : user?.id || null)} />
        {remoteEntries.map(([remoteUserId, stream]) => { const remote = users.get(remoteUserId); const media = remoteMedia[remoteUserId]; return <VideoTile key={remoteUserId} stream={stream} label={`${remote ? `${remote.firstName} ${remote.lastName}`.trim() : "Qatnashchi"}${media?.screen ? " · ekran" : ""}`} avatar={remote} microphoneOn={media?.audio ?? true} videoOn={media?.video ?? true} pinned={pinnedUserId === remoteUserId} handRaised={raisedHands.has(remoteUserId)} onPin={() => setPinnedUserId((current) => current === remoteUserId ? null : remoteUserId)} />; })}
        {remoteEntries.length === 0 && <article className="waiting-tile"><span><UsersRound size={28} /></span><h2>Boshqalarni kutyapmiz</h2><p>Havolani yuboring, qatnashchilar shu yerda paydo bo‘ladi.</p><button onClick={() => void shareMeetingLink()}><Link2 size={16} /> Havolani ulashish</button></article>}
      </main>
      {sidePanel && <aside className="meeting-side-panel"><header><div><strong>{sidePanel === "participants" ? "Qatnashchilar" : sidePanel === "files" ? "Ulashilgan fayllar" : "Meeting ma’lumoti"}</strong><small>{sidePanel === "participants" ? `${remoteEntries.length + 1} kishi` : sidePanel === "files" ? `${files.length} ta fayl` : meeting.code}</small></div><button onClick={() => setSidePanel(null)} aria-label="Panelni yopish"><X size={19} /></button></header>{sidePanel === "participants" ? <div className="participant-list"><div><Avatar firstName={user?.firstName} lastName={user?.lastName} url={user?.avatarUrl} size="sm" /><span><strong>{user?.firstName} {user?.lastName} (siz)</strong><small>{meeting.hostId === user?.id ? "Host" : "Qatnashchi"}</small></span>{microphone ? <Mic size={16} /> : <MicOff size={16} />}</div>{remoteEntries.map(([id]) => { const remote = users.get(id); const media = remoteMedia[id]; return <div key={id}><Avatar firstName={remote?.firstName} lastName={remote?.lastName} url={remote?.avatarUrl} size="sm" /><span><strong>{remote ? `${remote.firstName} ${remote.lastName}` : "Qatnashchi"}</strong><small>{media?.screen ? "Ekran ulashmoqda" : "Meetingda"}</small></span>{media?.audio === false ? <MicOff size={16} /> : <Mic size={16} />}</div>; })}</div> : sidePanel === "files" ? <div className="meeting-files-panel"><button className="meeting-file-upload" onClick={() => meetingFileInput.current?.click()} disabled={uploadingFile}>{uploadingFile ? <LoaderCircle className="spin" size={18} /> : <Paperclip size={18} />}<span><strong>{uploadingFile ? "Yuklanmoqda..." : "Fayl ulashish"}</strong><small>PDF, hujjat, rasm yoki arxiv · 100 MB gacha</small></span></button>{files.length === 0 ? <div className="meeting-files-empty"><FileText size={26} /><strong>Hozircha fayl yo‘q</strong><small>Birinchi faylni meeting qatnashchilariga ulashing.</small></div> : <div className="meeting-file-list">{files.map((file) => <a key={file.id} href={file.storageUrl} target="_blank" rel="noreferrer"><span><FileText size={19} /></span><span><strong>{file.fileName}</strong><small>{fileSize(file.fileSize)} · {file.firstName || "Qatnashchi"}</small></span><Download size={17} /></a>)}</div>}</div> : <div className="meeting-info-panel"><p>{meeting.description || "Jamoa video suhbati"}</p><label>Meeting kodi<span><code>{meeting.code}</code><button onClick={() => { void navigator.clipboard.writeText(meeting.code); show("Kod nusxalandi"); }}><Copy size={16} /></button></span></label><Button onClick={() => void shareMeetingLink()} icon={<Link2 size={17} />}>Havolani ulashish</Button></div>}</aside>}
      </div>
      <div className="meeting-reaction-layer" aria-live="polite">{reactions.map((reaction) => <span key={reaction.id}>{reaction.emoji}</span>)}</div>
      <input ref={meetingFileInput} className="sr-only" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMeetingFile(file); }} />
      <footer className="meeting-controls"><div className="meeting-control-info"><time>{new Intl.DateTimeFormat("uz-UZ", { hour: "2-digit", minute: "2-digit" }).format(new Date())}</time><span>{meeting.code}</span></div><div className="meeting-control-primary"><button className={microphone ? "" : "off"} onClick={() => void toggleTrack("audio")} aria-label={microphone ? "Mikrofonni o‘chirish" : "Mikrofonni yoqish"}>{microphone ? <Mic size={21} /> : <MicOff size={21} />}</button><button className={camera ? "" : "off"} onClick={() => void toggleTrack("video")} aria-label={camera ? "Kamerani o‘chirish" : "Kamerani yoqish"}>{camera ? <Camera size={21} /> : <CameraOff size={21} />}</button><button className={screenSharing ? "active" : ""} onClick={() => void toggleScreen()} aria-label="Ekranni ulash"><MonitorUp size={21} /></button><button onClick={() => meetingFileInput.current?.click()} disabled={uploadingFile} aria-label="Fayl ulashish">{uploadingFile ? <LoaderCircle className="spin" size={20} /> : <Paperclip size={20} />}</button><button className={handRaised ? "active" : ""} onClick={toggleHand} aria-label={handRaised ? "Qo'lni tushirish" : "Qo'l ko'tarish"}><Hand size={21} /></button><span className="meeting-reaction-wrap"><button className={reactionOpen ? "active" : ""} onClick={() => setReactionOpen((value) => !value)} aria-label="Reaksiya yuborish"><Smile size={21} /></button>{reactionOpen && <span className="meeting-reaction-menu">{["👍", "❤️", "🎉", "👏", "😂", "😮"].map((emoji) => <button key={emoji} onClick={() => sendReaction(emoji)}>{emoji}</button>)}</span>}</span><button className="leave-control" onClick={leave} aria-label="Meetingdan chiqish"><PhoneOff size={21} /></button></div><div className="meeting-control-secondary"><button aria-label="Grid ko‘rinishi"><LayoutGrid size={20} /></button><button onClick={() => setSidePanel(sidePanel === "files" ? null : "files")} aria-label="Ulashilgan fayllar"><Paperclip size={20} /></button>{canRecord && <button className={recording ? "active" : ""} onClick={toggleRecording} disabled={recordingBusy} aria-label={recording ? "Yozishni to‘xtatish" : "Meetingni yozib olish"}>{recordingBusy ? <LoaderCircle className="spin" size={20} /> : recording ? <Square size={20} /> : <Circle size={20} />}</button>}<button aria-label="Qo‘shimcha amallar"><MoreVertical size={20} /></button></div></footer>
      {leavePrompt && <div className="meeting-modal-overlay" role="dialog" aria-modal="true"><div className="meeting-modal"><h2>Meetingdan chiqyapsiz</h2><p>Siz host sifatida chiqmoqchisiz. Meeting hammaga yakunlansinmi yoki davom etsinmi?</p><div className="meeting-modal-actions"><Button onClick={() => void confirmEndMeeting()}>Meeting hammaga tugasin</Button><Button variant="secondary" onClick={() => void confirmLeaveOnly()}>Faqat men chiqaman</Button><button className="meeting-modal-cancel" onClick={() => setLeavePrompt(false)}>Bekor qilish</button></div></div></div>}
    </div>
  );
}

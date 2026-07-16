import { ArrowLeft, Camera, CameraOff, Check, Copy, Hand, Info, LayoutGrid, Link2, LoaderCircle, MessageSquare, Mic, MicOff, MonitorUp, MoreVertical, PhoneOff, Pin, Settings2, Signal, Smile, UsersRound, Video, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Avatar, Button } from "../components/ui";
import { useToast } from "../components/Toast";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { getSocket } from "../lib/socket";
import type { Meeting, User, WorkspaceMember } from "../types";

const RTC_CONFIG: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function VideoTile({ stream, muted, mirrored = false, label, avatar, microphoneOn = true, pinned = false, handRaised = false, onPin }: { stream?: MediaStream; muted?: boolean; mirrored?: boolean; label: string; avatar?: Pick<User, "firstName" | "lastName" | "avatarUrl">; microphoneOn?: boolean; pinned?: boolean; handRaised?: boolean; onPin?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream; }, [stream]);
  return (
    <article className={`video-tile ${mirrored ? "video-tile-mirrored" : ""} ${pinned ? "video-tile-pinned" : ""}`}>
      {stream?.getVideoTracks().some((track) => track.enabled) ? <video ref={ref} autoPlay playsInline muted={muted} /> : <div className="video-placeholder"><Avatar firstName={avatar?.firstName || label} lastName={avatar?.lastName} url={avatar?.avatarUrl} size="xl" /></div>}
      <span className="video-label">{label}</span>
      {handRaised && <span className="tile-hand" title="Qo'l ko'tarilgan"><Hand size={16} /></span>}
      {onPin && <button className={`tile-pin ${pinned ? "active" : ""}`} onClick={onPin} aria-label={pinned ? "Videoni bo'shatish" : "Videoni mahkamlash"}><Pin size={15} /></button>}
      {!microphoneOn && <span className="tile-muted" aria-label="Mikrofon o‘chirilgan"><MicOff size={15} /></span>}
    </article>
  );
}

export function MeetingRoomPage({ meetingId }: { meetingId: string }) {
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
  const [sidePanel, setSidePanel] = useState<"participants" | "info" | null>(null);
  const [handRaised, setHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [reactionOpen, setReactionOpen] = useState(false);
  const [reactions, setReactions] = useState<Array<{ id: string; userId: string; emoji: string }>>([]);
  const [pinnedUserId, setPinnedUserId] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream>();
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "offline">("connecting");
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const iceQueue = useRef(new Map<string, RTCIceCandidateInit[]>());
  const currentStream = useRef<MediaStream | undefined>(undefined);
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  const rtcConfig = useRef<RTCConfiguration>(RTC_CONFIG);
  const reconnectAttempts = useRef(new Map<string, number>());
  const sendOfferRef = useRef<(targetUserId: string, iceRestart?: boolean) => Promise<void>>(async () => {});

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
    peers.current.get(userId)?.close();
    peers.current.delete(userId);
    iceQueue.current.delete(userId);
    setRemoteStreams((current) => { const next = { ...current }; delete next[userId]; return next; });
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
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") reconnectAttempts.current.delete(targetUserId);
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
        await sendOffer(targetUserId);
      }
    };
    const onUserJoined = ({ userId: joinedUserId }: { userId: string }) => {
      window.setTimeout(() => {
        if (!peers.current.has(joinedUserId)) void sendOffer(joinedUserId);
      }, 800);
    };
    const onOffer = async ({ fromUserId, sdp }: { fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      const peer = createPeer(fromUserId);
      await peer.setRemoteDescription(sdp);
      await flushIce(fromUserId, peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit("meeting:answer", { meetingId, targetUserId: fromUserId, sdp: answer });
    };
    const onAnswer = async ({ fromUserId, sdp }: { fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      const peer = peers.current.get(fromUserId);
      if (!peer) return;
      await peer.setRemoteDescription(sdp);
      await flushIce(fromUserId, peer);
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
    const onMeetingError = ({ message }: { message: string }) => { show(message || "Meetingga qo‘shilib bo‘lmadi", "error"); setEntered(false); };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("meeting:participants", onParticipants);
    socket.on("meeting:user-joined", onUserJoined);
    socket.on("meeting:offer", onOffer);
    socket.on("meeting:answer", onAnswer);
    socket.on("meeting:ice-candidate", onIce);
    socket.on("meeting:user-left", onLeft);
    socket.on("meeting:hand", onHand);
    socket.on("meeting:reaction", onReaction);
    socket.on("meeting:error", onMeetingError);
    if (socket.connected) onConnect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("meeting:participants", onParticipants);
      socket.off("meeting:user-joined", onUserJoined);
      socket.off("meeting:offer", onOffer);
      socket.off("meeting:answer", onAnswer);
      socket.off("meeting:ice-candidate", onIce);
      socket.off("meeting:user-left", onLeft);
      socket.off("meeting:hand", onHand);
      socket.off("meeting:reaction", onReaction);
      socket.off("meeting:error", onMeetingError);
    };
  }, [entered, meetingId, sendOffer, createPeer, flushIce, closePeer, show]);

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

  const cleanup = useCallback(() => {
    getSocket().emit("meeting:leave", { meetingId });
    peers.current.forEach((peer) => peer.close());
    peers.current.clear();
    screenTrack.current?.stop();
    screenTrack.current = null;
    currentStream.current?.getTracks().forEach((track) => track.stop());
  }, [meetingId]);

  function leave() {
    cleanup();
    navigate("/meetings");
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

  useEffect(() => () => { if (entered) cleanup(); }, [entered, cleanup]);

  if (loading) return <div className="meeting-room-loading"><LoaderCircle className="spin" size={26} /><p>Meeting tayyorlanmoqda...</p></div>;
  if (!meeting) return <div className="meeting-room-loading"><p>Meeting topilmadi.</p><Button onClick={() => navigate("/meetings")}>Orqaga</Button></div>;

  if (!entered) return (
    <div className="meeting-lobby">
      <header><button className="icon-button" onClick={() => navigate("/meetings")} aria-label="Orqaga"><ArrowLeft size={20} /></button><span className="lobby-brand">Optima Meet</span><span className="lobby-secure"><Signal size={15} /> Himoyalangan aloqa</span></header>
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
  return (
    <div className="meeting-room">
      <header className="meeting-room-header"><div><span className={`connection-dot ${connectionState}`} /><span><strong>{meeting.title}</strong><small>{connectionState === "connected" ? "Aloqa barqaror" : connectionState === "offline" ? "Qayta ulanmoqda" : "Ulanmoqda"}</small></span></div><div className="meeting-header-actions"><button onClick={() => setSidePanel(sidePanel === "info" ? null : "info")} aria-label="Meeting ma’lumoti"><Info size={18} /></button><button onClick={() => setSidePanel(sidePanel === "participants" ? null : "participants")} aria-label="Qatnashchilar"><UsersRound size={18} /><span>{remoteEntries.length + 1}</span></button></div></header>
      <div className={`meeting-stage ${sidePanel ? "panel-open" : ""}`}>
      <main className={`video-grid video-grid-${Math.min(4, remoteEntries.length + 1)}`}>
        <VideoTile stream={screenStream || localStream} muted mirrored={!screenSharing} label={screenSharing ? "Siz ekran ulashyapsiz" : "Siz"} avatar={user || undefined} microphoneOn={microphone} pinned={pinnedUserId === user?.id} handRaised={Boolean(user?.id && raisedHands.has(user.id))} onPin={() => setPinnedUserId((current) => current === user?.id ? null : user?.id || null)} />
        {remoteEntries.map(([remoteUserId, stream]) => { const remote = users.get(remoteUserId); return <VideoTile key={remoteUserId} stream={stream} label={remote ? `${remote.firstName} ${remote.lastName}`.trim() : "Qatnashchi"} avatar={remote} pinned={pinnedUserId === remoteUserId} handRaised={raisedHands.has(remoteUserId)} onPin={() => setPinnedUserId((current) => current === remoteUserId ? null : remoteUserId)} />; })}
        {remoteEntries.length === 0 && <article className="waiting-tile"><span><UsersRound size={28} /></span><h2>Boshqalarni kutyapmiz</h2><p>Havolani yuboring, qatnashchilar shu yerda paydo bo‘ladi.</p><button onClick={() => void shareMeetingLink()}><Link2 size={16} /> Havolani ulashish</button></article>}
      </main>
      {sidePanel && <aside className="meeting-side-panel"><header><div><strong>{sidePanel === "participants" ? "Qatnashchilar" : "Meeting ma’lumoti"}</strong><small>{sidePanel === "participants" ? `${remoteEntries.length + 1} kishi` : meeting.code}</small></div><button onClick={() => setSidePanel(null)} aria-label="Panelni yopish"><X size={19} /></button></header>{sidePanel === "participants" ? <div className="participant-list"><div><Avatar firstName={user?.firstName} lastName={user?.lastName} url={user?.avatarUrl} size="sm" /><span><strong>{user?.firstName} {user?.lastName} (siz)</strong><small>{meeting.hostId === user?.id ? "Host" : "Qatnashchi"}</small></span>{microphone ? <Mic size={16} /> : <MicOff size={16} />}</div>{remoteEntries.map(([id]) => { const remote = users.get(id); return <div key={id}><Avatar firstName={remote?.firstName} lastName={remote?.lastName} url={remote?.avatarUrl} size="sm" /><span><strong>{remote ? `${remote.firstName} ${remote.lastName}` : "Qatnashchi"}</strong><small>Meetingda</small></span><MoreVertical size={16} /></div>; })}</div> : <div className="meeting-info-panel"><p>{meeting.description || "Jamoa video suhbati"}</p><label>Meeting kodi<span><code>{meeting.code}</code><button onClick={() => { void navigator.clipboard.writeText(meeting.code); show("Kod nusxalandi"); }}><Copy size={16} /></button></span></label><Button onClick={() => void shareMeetingLink()} icon={<Link2 size={17} />}>Havolani ulashish</Button></div>}</aside>}
      </div>
      <div className="meeting-reaction-layer" aria-live="polite">{reactions.map((reaction) => <span key={reaction.id}>{reaction.emoji}</span>)}</div>
      <footer className="meeting-controls"><div className="meeting-control-info"><time>{new Intl.DateTimeFormat("uz-UZ", { hour: "2-digit", minute: "2-digit" }).format(new Date())}</time><span>{meeting.code}</span></div><div className="meeting-control-primary"><button className={microphone ? "" : "off"} onClick={() => void toggleTrack("audio")} aria-label={microphone ? "Mikrofonni o‘chirish" : "Mikrofonni yoqish"}>{microphone ? <Mic size={21} /> : <MicOff size={21} />}</button><button className={camera ? "" : "off"} onClick={() => void toggleTrack("video")} aria-label={camera ? "Kamerani o‘chirish" : "Kamerani yoqish"}>{camera ? <Camera size={21} /> : <CameraOff size={21} />}</button><button className={screenSharing ? "active" : ""} onClick={() => void toggleScreen()} aria-label="Ekranni ulash"><MonitorUp size={21} /></button><button className={handRaised ? "active" : ""} onClick={toggleHand} aria-label={handRaised ? "Qo'lni tushirish" : "Qo'l ko'tarish"}><Hand size={21} /></button><span className="meeting-reaction-wrap"><button className={reactionOpen ? "active" : ""} onClick={() => setReactionOpen((value) => !value)} aria-label="Reaksiya yuborish"><Smile size={21} /></button>{reactionOpen && <span className="meeting-reaction-menu">{["👍", "❤️", "🎉", "👏", "😂", "😮"].map((emoji) => <button key={emoji} onClick={() => sendReaction(emoji)}>{emoji}</button>)}</span>}</span><button className="leave-control" onClick={leave} aria-label="Meetingdan chiqish"><PhoneOff size={21} /></button></div><div className="meeting-control-secondary"><button><LayoutGrid size={20} /></button><button disabled title="Backend ulanishi kutilmoqda"><MessageSquare size={20} /></button><button><MoreVertical size={20} /></button></div></footer>
    </div>
  );
}

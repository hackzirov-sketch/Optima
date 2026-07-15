import { ArrowLeft, Camera, CameraOff, Check, Copy, Link2, LoaderCircle, Mic, MicOff, MonitorUp, PhoneOff, UsersRound, Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Avatar, Button } from "../components/ui";
import { useToast } from "../components/Toast";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { getSocket } from "../lib/socket";
import type { Meeting, User, WorkspaceMember } from "../types";

const RTC_CONFIG: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function VideoTile({ stream, muted, mirrored = false, label, avatar }: { stream?: MediaStream; muted?: boolean; mirrored?: boolean; label: string; avatar?: Pick<User, "firstName" | "lastName" | "avatarUrl"> }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream; }, [stream]);
  return (
    <article className={`video-tile ${mirrored ? "video-tile-mirrored" : ""}`}>
      {stream?.getVideoTracks().some((track) => track.enabled) ? <video ref={ref} autoPlay playsInline muted={muted} /> : <div className="video-placeholder"><Avatar firstName={avatar?.firstName || label} lastName={avatar?.lastName} url={avatar?.avatarUrl} size="xl" /></div>}
      <span className="video-label">{label}</span>
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
  const [camera, setCamera] = useState(true);
  const [microphone, setMicrophone] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream>();
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "offline">("connecting");
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const iceQueue = useRef(new Map<string, RTCIceCandidateInit[]>());
  const currentStream = useRef<MediaStream | undefined>(undefined);
  const rtcConfig = useRef<RTCConfiguration>(RTC_CONFIG);
  const reconnectAttempts = useRef(new Map<string, number>());
  const sendOfferRef = useRef<(targetUserId: string, iceRestart?: boolean) => Promise<void>>(async () => {});

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
    const onMeetingError = ({ message }: { message: string }) => { show(message || "Meetingga qo‘shilib bo‘lmadi", "error"); setEntered(false); };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("meeting:participants", onParticipants);
    socket.on("meeting:user-joined", onUserJoined);
    socket.on("meeting:offer", onOffer);
    socket.on("meeting:answer", onAnswer);
    socket.on("meeting:ice-candidate", onIce);
    socket.on("meeting:user-left", onLeft);
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
      socket.off("meeting:error", onMeetingError);
    };
  }, [entered, meetingId, sendOffer, createPeer, flushIce, closePeer, show]);

  async function requestTrack(kind: "audio" | "video") {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: kind === "audio",
      video: kind === "video",
    });
    return stream.getTracks().find((track) => track.kind === kind);
  }

  async function enterMeeting() {
    setJoining(true);
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

  async function toggleScreen() {
    if (screenSharing) {
      const cameraTrack = currentStream.current?.getVideoTracks()[0];
      if (cameraTrack) for (const peer of peers.current.values()) await peer.getSenders().find((sender) => sender.track?.kind === "video")?.replaceTrack(cameraTrack);
      setScreenSharing(false);
      getSocket().emit("meeting:toggle", { meetingId, kind: "screen", enabled: false });
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = display.getVideoTracks()[0];
      for (const peer of peers.current.values()) await peer.getSenders().find((sender) => sender.track?.kind === "video")?.replaceTrack(track);
      setScreenSharing(true);
      getSocket().emit("meeting:toggle", { meetingId, kind: "screen", enabled: true });
      track.onended = () => void toggleScreen();
    } catch {
      show("Ekran ulash bekor qilindi", "error");
    }
  }

  const cleanup = useCallback(() => {
    getSocket().emit("meeting:leave", { meetingId });
    peers.current.forEach((peer) => peer.close());
    peers.current.clear();
    currentStream.current?.getTracks().forEach((track) => track.stop());
  }, [meetingId]);

  function leave() {
    cleanup();
    navigate("/meetings");
  }

  useEffect(() => () => { if (entered) cleanup(); }, [entered, cleanup]);

  if (loading) return <div className="meeting-room-loading"><LoaderCircle className="spin" size={26} /><p>Meeting tayyorlanmoqda...</p></div>;
  if (!meeting) return <div className="meeting-room-loading"><p>Meeting topilmadi.</p><Button onClick={() => navigate("/meetings")}>Orqaga</Button></div>;

  if (!entered) return (
    <div className="meeting-lobby">
      <header><button className="icon-button" onClick={() => navigate("/meetings")} aria-label="Orqaga"><ArrowLeft size={20} /></button><span>Meeting oldidan tekshiruv</span></header>
      <main>
        <section className="lobby-preview"><div className="video-placeholder"><Avatar firstName={user?.firstName} lastName={user?.lastName} url={user?.avatarUrl} size="xl" /></div><div className="lobby-preview-controls"><button className={microphone ? "active" : ""} onClick={() => setMicrophone((value) => !value)} aria-label="Mikrofon">{microphone ? <Mic size={20} /> : <MicOff size={20} />}</button><button className={camera ? "active" : ""} onClick={() => setCamera((value) => !value)} aria-label="Kamera">{camera ? <Camera size={20} /> : <CameraOff size={20} />}</button></div></section>
        <section className="lobby-details"><span className={`status-pill status-${meeting.status}`}>{meeting.status === "live" ? "Jonli" : "Tayyor"}</span><h1>{meeting.title}</h1><p>{meeting.description || "Meetingga qo‘shilishdan oldin kamera va mikrofonni tekshiring."}</p><dl><div><dt>Meeting kodi</dt><dd><code>{meeting.code}</code><button className="icon-button icon-button-sm" onClick={() => { void navigator.clipboard.writeText(meeting.code); show("Kod nusxalandi"); }} aria-label="Kodni nusxalash"><Copy size={15} /></button><button className="icon-button icon-button-sm" onClick={() => void shareMeetingLink()} aria-label="Meeting havolasini ulashish"><Link2 size={15} /></button></dd></div><div><dt>Qatnashchilar</dt><dd>{meeting.participantCount} / {meeting.maxParticipants}</dd></div></dl><Button loading={joining} onClick={() => void enterMeeting()} icon={<Video size={18} />}>Meetingga kirish</Button><small><Check size={14} /> Kirgandan keyin media boshqaruvini o‘zgartira olasiz.</small></section>
      </main>
    </div>
  );

  const remoteEntries = Object.entries(remoteStreams);
  return (
    <div className="meeting-room">
      <header className="meeting-room-header"><div><span className={`connection-dot ${connectionState}`} /><span><strong>{meeting.title}</strong><small>{meeting.code}</small></span></div><div><UsersRound size={17} /><span>{remoteEntries.length + 1}</span></div></header>
      <main className={`video-grid video-grid-${Math.min(4, remoteEntries.length + 1)}`}>
        <VideoTile stream={localStream} muted mirrored label="Siz" avatar={user || undefined} />
        {remoteEntries.map(([remoteUserId, stream]) => { const remote = users.get(remoteUserId); return <VideoTile key={remoteUserId} stream={stream} label={remote ? `${remote.firstName} ${remote.lastName}`.trim() : "Qatnashchi"} avatar={remote} />; })}
        {remoteEntries.length === 0 && <article className="waiting-tile"><UsersRound size={30} /><h2>Boshqalarni kutyapmiz</h2><p>Meeting kodini jamoangizga yuboring.</p><button onClick={() => { void navigator.clipboard.writeText(meeting.code); show("Kod nusxalandi"); }}><code>{meeting.code}</code><Copy size={16} /></button></article>}
      </main>
      <footer className="meeting-controls"><button className={microphone ? "" : "off"} onClick={() => void toggleTrack("audio")} aria-label={microphone ? "Mikrofonni o‘chirish" : "Mikrofonni yoqish"}>{microphone ? <Mic size={21} /> : <MicOff size={21} />}</button><button className={camera ? "" : "off"} onClick={() => void toggleTrack("video")} aria-label={camera ? "Kamerani o‘chirish" : "Kamerani yoqish"}>{camera ? <Camera size={21} /> : <CameraOff size={21} />}</button><button className={screenSharing ? "active" : ""} onClick={() => void toggleScreen()} aria-label="Ekranni ulash"><MonitorUp size={21} /></button><button className="leave-control" onClick={leave} aria-label="Meetingdan chiqish"><PhoneOff size={21} /></button></footer>
    </div>
  );
}

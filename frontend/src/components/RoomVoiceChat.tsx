import { Mic, MicOff, Minimize2, MoreVertical, PhoneOff, Settings, UserPlus, Video, VideoOff, X } from "lucide-react";
import { RoomEvent } from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "./ui";
import { useToast } from "./Toast";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { LiveKitMeeting, type MediaFlags } from "../lib/liveKitMeeting";
import { useI18n } from "../lib/i18n/i18n";

export type VoiceChatPerson = { firstName?: string | null; lastName?: string | null; avatarUrl?: string | null };
type Phase = "connecting" | "connected" | "reconnecting" | "failed";
type Remote = { stream: MediaStream | null; media: MediaFlags };

/**
 * A group or channel video chat, Telegram style: a compact dark panel with
 * the participant list, the speaking ring on whoever talks, and Settings /
 * Video / Mic / Leave at the bottom. Media goes through the meeting's LiveKit
 * room; joining starts the chat if the room had none.
 */
export function RoomVoiceChat({ roomId, title, me, people, inviteLink, minimized, onMinimize, onClose, onState }: {
  roomId: string;
  title: string;
  me: { id: string } & VoiceChatPerson;
  people: Map<string, VoiceChatPerson>;
  inviteLink: string;
  minimized: boolean;
  onMinimize: (value: boolean) => void;
  onClose: () => void;
  /** Lets the chat's top bar mirror the call (mic state, phase, leave). */
  onState: (state: { phase: Phase; micOn: boolean; canSpeak: boolean; toggleMic: () => void; leave: () => void; count: number }) => void;
}) {
  const { t } = useI18n();
  const { show } = useToast();
  const [phase, setPhase] = useState<Phase>("connecting");
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [canSpeak, setCanSpeak] = useState(false);
  const [canEnd, setCanEnd] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [localVideo, setLocalVideo] = useState<MediaStream | null>(null);
  const [remotes, setRemotes] = useState<Record<string, Remote>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [micDevice, setMicDevice] = useState("");
  const [speakerDevice, setSpeakerDevice] = useState("");
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [level, setLevel] = useState(0);
  const session = useRef<LiveKitMeeting | null>(null);
  const micTrack = useRef<MediaStreamTrack | null>(null);
  const camTrack = useRef<MediaStreamTrack | null>(null);
  const left = useRef(false);

  const leave = useCallback(async () => {
    if (left.current) return;
    left.current = true;
    micTrack.current?.stop();
    camTrack.current?.stop();
    await session.current?.disconnect();
    if (meetingId) {
      getSocket().emit("meeting:leave", { meetingId });
      await api.meetings.leave(meetingId).catch(() => undefined);
    }
    onClose();
  }, [meetingId, onClose]);

  /** `publish`: swap it into the live session. The first track instead goes to connect() — publishing before the room is connected never resolves. */
  async function openMic(deviceId = micDevice, suppress = noiseSuppression, publish = true) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: deviceId ? { exact: deviceId } : undefined, noiseSuppression: suppress, echoCancellation: true, autoGainControl: true },
    });
    const track = stream.getAudioTracks()[0];
    track.enabled = micOn;
    const previous = micTrack.current;
    micTrack.current = track;
    if (publish && session.current) {
      if (previous) await session.current.unpublish(previous);
      await session.current.publish(track);
    }
    previous?.stop();
    return track;
  }

  // Join, connect media, start muted (as Telegram does).
  useEffect(() => {
    let cancelled = false;
    left.current = false;
    (async () => {
      try {
        const chat = await api.chat.voiceChatJoin(roomId);
        if (cancelled) return;
        setMeetingId(chat.meetingId);
        setCanSpeak(chat.canSpeak);
        setCanEnd(chat.canEnd);
        getSocket().emit("meeting:join", { meetingId: chat.meetingId });
        const media = await api.meetings.mediaSession(chat.meetingId);
        if (cancelled) return;
        if (media.provider !== "livekit") throw new Error(t("voiceChat.unavailable"));
        const live = new LiveKitMeeting({
          onRemote: (userId, stream, flags) => setRemotes((current) => {
            const next = { ...current };
            if (!stream && !flags.audio && !flags.video) delete next[userId];
            else next[userId] = { stream, media: flags };
            return next;
          }),
          onState: (state) => setPhase(state === "connected" ? "connected" : state === "reconnecting" ? "reconnecting" : state === "disconnected" ? "failed" : "connecting"),
          onData: () => undefined,
          onDisconnected: () => { if (!left.current) setPhase("failed"); },
        });
        session.current = live;
        live.room
          .on(RoomEvent.ActiveSpeakersChanged, (list) => setSpeaking(new Set(list.map((p) => p.identity))))
          .on(RoomEvent.ParticipantConnected, (p) => setNames((current) => ({ ...current, [p.identity]: p.name || "" })))
          // Drop the leaver from both maps — the list is built from the two,
          // so leaving them in `names` kept them listed after they'd gone.
          .on(RoomEvent.ParticipantDisconnected, (p) => {
            setRemotes((current) => { const next = { ...current }; delete next[p.identity]; return next; });
            setNames((current) => { const next = { ...current }; delete next[p.identity]; return next; });
          });
        const tracks: MediaStreamTrack[] = [];
        if (chat.canSpeak) {
          try { tracks.push(await openMic("", true, false)); } catch { show(t("voiceChat.micBlocked"), "error"); }
        }
        await live.connect(media.url, media.token, tracks);
        if (cancelled) { void live.disconnect(); return; }
        const known: Record<string, string> = {};
        live.room.remoteParticipants.forEach((p) => { known[p.identity] = p.name || ""; });
        setNames((current) => ({ ...current, ...known }));
      } catch (error) {
        if (!cancelled) {
          setPhase("failed");
          show(error instanceof Error ? error.message : t("voiceChat.joinFailed"), "error");
        }
      }
    })();
    return () => {
      cancelled = true;
      micTrack.current?.stop();
      camTrack.current?.stop();
      void session.current?.disconnect();
      session.current = null;
    };
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ended for everyone by an admin.
  useEffect(() => {
    if (!meetingId) return;
    const socket = getSocket();
    const onEnded = (data: { meetingId?: string }) => {
      if (data?.meetingId !== meetingId) return;
      show(t("voiceChat.endedByAdmin"));
      left.current = true;
      void session.current?.disconnect();
      onClose();
    };
    socket.on("meeting:ended", onEnded);
    return () => { socket.off("meeting:ended", onEnded); };
  }, [meetingId, onClose, show, t]);

  // Mic level for the settings meter.
  useEffect(() => {
    if (!settingsOpen || !micTrack.current) return;
    const context = new AudioContext();
    const source = context.createMediaStreamSource(new MediaStream([micTrack.current]));
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    const tick = () => { analyser.getByteFrequencyData(data); setLevel(Math.min(1, data.reduce((a, b) => a + b, 0) / data.length / 60)); frame = requestAnimationFrame(tick); };
    tick();
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      setMics(devices.filter((device) => device.kind === "audioinput"));
      setSpeakers(devices.filter((device) => device.kind === "audiooutput"));
    }).catch(() => undefined);
    return () => { cancelAnimationFrame(frame); void context.close(); };
  }, [settingsOpen, micDevice, noiseSuppression]);

  const toggleMic = useCallback(() => {
    if (!canSpeak || !micTrack.current) return;
    const next = !micOn;
    micTrack.current.enabled = next;
    setMicOn(next);
    void session.current?.setEnabled("audio", next);
  }, [canSpeak, micOn]);

  async function toggleCam() {
    if (!canSpeak || !session.current) return;
    if (camOn && camTrack.current) {
      await session.current.unpublish(camTrack.current);
      camTrack.current.stop();
      camTrack.current = null;
      setLocalVideo(null);
      setCamOn(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 } });
      camTrack.current = stream.getVideoTracks()[0];
      await session.current.publish(camTrack.current);
      setLocalVideo(stream);
      setCamOn(true);
    } catch {
      show(t("voiceChat.cameraBlocked"), "error");
    }
  }

  async function endForAll() {
    try {
      await api.chat.voiceChatEnd(roomId);
    } catch (error) {
      show(error instanceof Error ? error.message : t("voiceChat.endFailed"), "error");
    }
  }

  async function copyInvite() {
    try { await navigator.clipboard.writeText(inviteLink); show(t("voiceChat.linkCopied")); } catch { show(inviteLink); }
  }

  const participantIds = useMemo(() => [me.id, ...Object.keys(remotes).filter((id) => id !== me.id), ...Object.keys(names).filter((id) => id !== me.id && !remotes[id])], [me.id, remotes, names]);
  const count = participantIds.length;
  useEffect(() => { onState({ phase, micOn, canSpeak, toggleMic, leave: () => void leave(), count }); }, [phase, micOn, canSpeak, toggleMic, leave, count, onState]);

  const person = (id: string): VoiceChatPerson => (id === me.id ? me : people.get(id) ?? { firstName: names[id] || t("voiceChat.participant") });
  const fullName = (id: string) => { const p = person(id); return [p.firstName, p.lastName].filter(Boolean).join(" ") || t("voiceChat.participant"); };
  const statusOf = (id: string) => {
    if (id === me.id) return phase === "connected" ? (micOn ? t("voiceChat.speakingYou") : canSpeak ? t("voiceChat.muted") : t("voiceChat.listening")) : t("voiceChat.connecting");
    if (speaking.has(id)) return t("voiceChat.speaking");
    return remotes[id]?.media.audio ? t("voiceChat.listening") : t("voiceChat.muted");
  };
  const videos = [...(localVideo ? [[me.id, localVideo] as const] : []), ...Object.entries(remotes).filter(([, r]) => r.media.video && r.stream).map(([id, r]) => [id, r.stream!] as const)];

  return <section className={`vc-panel ${minimized ? "vc-min" : ""}`} role="dialog" aria-label={t("voiceChat.title")}>
    {/* Remote audio plays regardless of the panel being minimised. */}
    {Object.entries(remotes).map(([id, remote]) => remote.stream && remote.media.audio && <RemoteAudio key={id} stream={remote.stream} sinkId={speakerDevice} />)}
    <header className="vc-head">
      <button type="button" className="vc-icon" onClick={() => setSettingsOpen(true)} aria-label={t("voiceChat.settings")}><MoreVertical size={18} /></button>
      <div><strong>{title}</strong><small>{phase === "connected" ? t("voiceChat.participants", { count }) : phase === "failed" ? t("voiceChat.failed") : t("voiceChat.connecting")}</small></div>
      <button type="button" className="vc-icon" onClick={() => onMinimize(true)} aria-label={t("voiceChat.minimize")}><Minimize2 size={17} /></button>
      <button type="button" className="vc-icon" onClick={() => void leave()} aria-label={t("voiceChat.leave")}><X size={18} /></button>
    </header>
    {videos.length > 0 && <div className={`vc-videos vc-videos-${Math.min(videos.length, 4)}`}>{videos.map(([id, stream]) => <VideoTile key={id} stream={stream} mirrored={id === me.id} name={fullName(id)} speaking={speaking.has(id)} />)}</div>}
    <div className="vc-list">
      {participantIds.map((id) => {
        const p = person(id);
        const talking = speaking.has(id) || (id === me.id && micOn && speaking.has(me.id));
        return <div key={id} className={`vc-person ${talking ? "talking" : ""}`}>
          <span className="vc-avatar"><Avatar firstName={p.firstName} lastName={p.lastName} url={p.avatarUrl} size="sm" /></span>
          <span className="vc-person-text"><strong>{fullName(id)}{id === me.id ? ` (${t("voiceChat.you")})` : ""}</strong><small className={talking ? "on" : ""}>{statusOf(id)}</small></span>
          {(id === me.id ? micOn : remotes[id]?.media.audio) ? <Mic size={18} className={talking ? "on" : ""} /> : <MicOff size={18} className="off" />}
        </div>;
      })}
      <button type="button" className="vc-invite" onClick={() => void copyInvite()}><UserPlus size={20} />{t("voiceChat.invite")}</button>
    </div>
    <footer className="vc-controls">
      <button type="button" className="vc-ctl" onClick={() => setSettingsOpen(true)}><span><Settings size={22} /></span><small>{t("voiceChat.settings")}</small></button>
      {canSpeak && <button type="button" className={`vc-ctl ${camOn ? "on" : ""}`} onClick={() => void toggleCam()}><span>{camOn ? <Video size={22} /> : <VideoOff size={22} />}</span><small>{t("voiceChat.video")}</small></button>}
      <button type="button" className={`vc-mic ${micOn ? "on" : ""} ${phase !== "connected" ? "busy" : ""} ${speaking.has(me.id) && micOn ? "talking" : ""}`} onClick={toggleMic} disabled={!canSpeak || phase !== "connected"} aria-pressed={micOn} aria-label={micOn ? t("voiceChat.muteMe") : t("voiceChat.unmuteMe")}>
        <span>{micOn ? <Mic size={30} /> : <MicOff size={30} />}</span>
        <small>{phase !== "connected" ? t("voiceChat.connecting") : !canSpeak ? t("voiceChat.listenOnly") : micOn ? t("voiceChat.muteMe") : t("voiceChat.unmuteMe")}</small>
      </button>
      <button type="button" className="vc-ctl vc-leave" onClick={() => void leave()}><span><PhoneOff size={22} /></span><small>{t("voiceChat.leave")}</small></button>
    </footer>
    {settingsOpen && <div className="vc-settings-layer" onMouseDown={(event) => event.target === event.currentTarget && setSettingsOpen(false)} onKeyDown={(event) => event.key === "Escape" && setSettingsOpen(false)}>
      <div className="vc-settings" role="dialog" aria-label={t("voiceChat.settings")}>
        <h3>{t("voiceChat.settings")}</h3>
        {speakers.length > 0 && <label className="vc-row"><span>{t("voiceChat.speakers")}</span>
          <select value={speakerDevice} onChange={(event) => setSpeakerDevice(event.target.value)}>
            <option value="">{t("voiceChat.default")}</option>
            {speakers.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || t("voiceChat.default")}</option>)}
          </select></label>}
        {canSpeak && <label className="vc-row"><span>{t("voiceChat.microphone")}</span>
          <select value={micDevice} onChange={(event) => { setMicDevice(event.target.value); void openMic(event.target.value); }}>
            <option value="">{t("voiceChat.default")}</option>
            {mics.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || t("voiceChat.default")}</option>)}
          </select></label>}
        {canSpeak && <div className="vc-meter" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} className={i / 28 < level ? "on" : ""} />)}</div>}
        {canSpeak && <label className="vc-row vc-switch"><span>{t("voiceChat.noiseSuppression")}</span>
          <input type="checkbox" role="switch" checked={noiseSuppression} onChange={(event) => { setNoiseSuppression(event.target.checked); void openMic(micDevice, event.target.checked); }} /></label>}
        <button type="button" className="vc-row vc-link" onClick={() => void copyInvite()}>{t("voiceChat.shareLink")}</button>
        {canEnd && <button type="button" className="vc-row vc-danger" onClick={() => void endForAll()}>{t("voiceChat.endForAll")}</button>}
        <div className="vc-settings-actions"><button type="button" onClick={() => setSettingsOpen(false)}>{t("voiceChat.done")}</button></div>
      </div>
    </div>}
  </section>;
}

function RemoteAudio({ stream, sinkId }: { stream: MediaStream; sinkId: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    if (audio.srcObject !== stream) audio.srcObject = stream;
    void audio.play().catch(() => undefined);
  }, [stream]);
  useEffect(() => {
    const audio = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (audio?.setSinkId) void audio.setSinkId(sinkId).catch(() => undefined);
  }, [sinkId]);
  return <audio ref={ref} autoPlay />;
}

function VideoTile({ stream, mirrored, name, speaking }: { stream: MediaStream; mirrored: boolean; name: string; speaking: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [stream]);
  return <figure className={`vc-video ${speaking ? "talking" : ""}`}><video ref={ref} autoPlay playsInline muted className={mirrored ? "mirrored" : ""} /><figcaption>{name}</figcaption></figure>;
}

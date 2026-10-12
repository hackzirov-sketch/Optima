import { ArrowLeft, Camera, CameraOff, Check, ChevronLeft, ChevronRight, ChevronUp, Copy, Hand, Hourglass, Info, LayoutGrid, Link2, Lock, LoaderCircle, Maximize2, MessageSquareText, Mic, MicOff, Minus, MonitorUp, MoreVertical, PhoneOff, PictureInPicture2, Pin, Settings2, ShieldCheck, ShieldX, Smile, Unlock, UserPlus, UsersRound, Video, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Avatar, Button } from "../components/ui";
import { DirectCallSurface } from "../components/DirectCallSurface";
import { MeetingChat } from "../components/MeetingChat";
import { MeetMenu, MeetPopover, type MeetMenuItem } from "../components/meet/MeetPopover";
import { AllowDevicesIllustration } from "../components/meet/MeetIllustrations";
import { clock } from "../lib/meetDates";
import { useMeetingChat } from "../lib/meetingChat";
import { LiveKitMeeting } from "../lib/liveKitMeeting";
import { useToast } from "../components/Toast";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { currentSocket, getSocket } from "../lib/socket";
import { forgetAudio, playWithUnlock } from "../lib/audioUnlock";
import { getActiveMeeting, setActiveMeeting } from "../lib/activeMeeting";
import { useI18n } from "../lib/i18n/i18n";
import type { Meeting, MeetingParticipant, MeetingPermissions, MeetingUser, MeetingJoinRequest, MeetingVisibility, MeetingJoinPolicyValue, User, GroupMember } from "../types";

const localeTag: Record<string, string> = { uz: "uz-UZ", ru: "ru-RU", en: "en-US", tr: "tr-TR" };
/** Host controls default to "everything allowed" (older meetings, before 022). */
const ALL_ALLOWED: MeetingPermissions = { screenShare: true, reactions: true, microphone: true, video: true, chat: true };
/** Must match ALLOWED_MEETING_REACTIONS in the gateway. */
const MEETING_REACTIONS = ["💖", "👍", "🎉", "👏", "😂", "😮", "😢", "🤔", "👎"];

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

/** Voice processing for the microphone: echo, noise and level handled by the browser, mono 48 kHz. */
const VOICE_CAPTURE: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48_000 };

function VideoTile({ stream, muted, mirrored = false, label, avatar, microphoneOn = true, videoOn = true, pinned = false, speaking = false, handRaised = false, pipEnabled = false, onPin }: { stream?: MediaStream; muted?: boolean; mirrored?: boolean; label: string; avatar?: Pick<User, "firstName" | "lastName" | "avatarUrl">; microphoneOn?: boolean; videoOn?: boolean; pinned?: boolean; speaking?: boolean; handRaised?: boolean; pipEnabled?: boolean; onPin?: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    // Firefox doesn't always resume autoplay after srcObject is swapped (a
    // screen share replacing the camera): the element sat on its first,
    // empty frame. Ask explicitly; a rejected play() just means "not yet".
    void video.play().catch(() => undefined);
  }, [stream]);
  /**
   * A remote MediaStream is a live object: renegotiation adds tracks to it,
   * and the sender muting or removing a track flips the existing one — all
   * long after React last rendered this tile. Without listening for that, a
   * camera switched on mid-call kept showing the avatar (and a stopped screen
   * share kept showing its last frame) until some unrelated state change
   * happened to force a re-render.
   */
  const [trackEpoch, onTracksChanged] = useReducer((value: number) => value + 1, 0);
  // Recomputed every render, so a track that appeared since the last one
  // re-runs the effect below and gets listeners of its own. Relying on the
  // stream's own addtrack event alone was not enough: a screen share arrives
  // as a brand new track that is still `muted` until its first frame, and if
  // nothing was listening for that unmute the tile stayed on the avatar for
  // good.
  const videoTrackKey = stream?.getVideoTracks().map((track) => track.id).join("|") ?? "";
  // A video track that appears on an already-playing stream needs the same nudge.
  useEffect(() => { if (videoTrackKey) void ref.current?.play().catch(() => undefined); }, [videoTrackKey]);
  useEffect(() => {
    if (!stream) return;
    const tracks = stream.getVideoTracks();
    stream.addEventListener("addtrack", onTracksChanged);
    stream.addEventListener("removetrack", onTracksChanged);
    for (const track of tracks) {
      track.addEventListener("mute", onTracksChanged);
      track.addEventListener("unmute", onTracksChanged);
      track.addEventListener("ended", onTracksChanged);
    }
    return () => {
      stream.removeEventListener("addtrack", onTracksChanged);
      stream.removeEventListener("removetrack", onTracksChanged);
      for (const track of tracks) {
        track.removeEventListener("mute", onTracksChanged);
        track.removeEventListener("unmute", onTracksChanged);
        track.removeEventListener("ended", onTracksChanged);
      }
    };
    // videoTrackKey/trackEpoch re-subscribe onto whatever the track set has become.
  }, [stream, videoTrackKey, trackEpoch]);
  // `muted` is the receiver's "no media is arriving on this track" signal —
  // an added-but-not-yet-flowing track must not count as video.
  const hasVideo = videoOn && Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled && !track.muted));
  const requestPip = () => { void ref.current?.requestPictureInPicture().catch(() => {}); };
  return (
    <article className={`video-tile ${mirrored ? "video-tile-mirrored" : ""} ${pinned ? "video-tile-pinned" : ""} ${speaking ? "video-tile-speaking" : ""}`}>
      {stream && <video ref={ref} className={hasVideo ? "" : "video-audio-only"} autoPlay playsInline muted={muted} />}
      {!hasVideo && <div className="video-placeholder"><Avatar firstName={avatar?.firstName || label} lastName={avatar?.lastName} url={avatar?.avatarUrl} size="xl" /></div>}
      <span className="video-label">{label}</span>
      {handRaised && <span className="tile-hand" title={t("meetingRoom.handRaisedTitle")}><Hand size={16} /></span>}
      {pipEnabled && hasVideo && document.pictureInPictureEnabled && <button className="tile-pip" onClick={requestPip} aria-label={t("meetingRoom.pipAria")} title={t("meetingRoom.pipAria")}><PictureInPicture2 size={15} /></button>}
      {onPin && <button className={`tile-pin ${pinned ? "active" : ""}`} onClick={onPin} title={pinned ? t("meetingRoom.releaseVideoAria") : t("meetingRoom.pinVideoAria")} aria-label={pinned ? t("meetingRoom.releaseVideoAria") : t("meetingRoom.pinVideoAria")}><Pin size={15} /></button>}
      {!microphoneOn && <span className="tile-muted" aria-label={t("meetingRoom.micOffTileAria")}><MicOff size={15} /></span>}
    </article>
  );
}

/** One row of Meet's host controls: a label (and optional hint) with a switch. */
function HostSwitch({ label, hint, checked, disabled = false, onChange }: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="gm-switch-row">
      <span><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    </label>
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
/** Plays one participant's audio while their tile isn't on screen. */
function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  // One stable stream per element holding just the audio tracks: the caller
  // hands a new MediaStream on every track change, and re-assigning srcObject
  // each time restarted playback (an aborted play() and a gap in the voice).
  const own = useRef<MediaStream | null>(null);
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    const sync = () => {
      own.current ??= new MediaStream();
      const wanted = stream.getAudioTracks();
      own.current.getAudioTracks().forEach((track) => { if (!wanted.includes(track)) own.current!.removeTrack(track); });
      wanted.forEach((track) => { if (!own.current!.getTrackById(track.id)) own.current!.addTrack(track); });
      if (audio.srcObject !== own.current) audio.srcObject = own.current;
      if (own.current.getAudioTracks().length) playWithUnlock(audio);
    };
    sync();
    // The audio track often lands after the video one: pick it up when it does.
    stream.addEventListener("addtrack", sync);
    return () => { stream.removeEventListener("addtrack", sync); };
  }, [stream]);
  useEffect(() => () => forgetAudio(ref.current), []);
  return <audio ref={ref} autoPlay playsInline />;
}

/** How close (px) to a side edge the pointer must get to tuck the widget there. */
const EDGE_ZONE = 30;
const minWidgetWidth = () => (window.innerWidth < 600 ? 150 : 220);

function FloatingMeetingWidget({ tile, remotes, title, microphone, camera, onToggleMic, onToggleCamera, onExpand, onLeave }: {
  tile: MeetingTile | null;
  /** Everyone else in the call: the widget shows one tile but must play all of their audio. */
  remotes: MeetingTile[];
  title: string;
  microphone: boolean;
  camera: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onExpand: () => void;
  onLeave: () => void;
}) {
  const { t } = useI18n();
  // Movable (drag the title bar) and resizable (drag the corner); both are
  // remembered. Kept inside the window whatever its size.
  const [box, setBox] = useState<{ x: number; y: number; w: number }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("optima-call-widget") ?? "null");
      if (saved && typeof saved.x === "number") return { x: saved.x, y: saved.y, w: saved.w };
    } catch { /* default */ }
    // Phones get a smaller first size: 300px is most of a 390px screen.
    return { x: -1, y: -1, w: window.innerWidth < 600 ? Math.round(window.innerWidth * 0.48) : 300 };
  });
  const boxRef = useRef(box);
  boxRef.current = box;
  // Pushed off a side edge, the widget tucks away into a small tab on that
  // edge (iOS picture-in-picture style); tapping the tab brings it back. The
  // call — and everyone's audio — keeps going while it is tucked.
  const [docked, setDocked] = useState<"left" | "right" | null>(() => {
    try { const saved = JSON.parse(localStorage.getItem("optima-call-widget") ?? "null"); return saved?.docked ?? null; } catch { return null; }
  });
  // While dragging: the side the widget will tuck into if let go now — shown
  // as a coloured glow along that screen edge (at most EDGE_ZONE px wide).
  const [edgeHint, setEdgeHint] = useState<"left" | "right" | null>(null);
  const edgeHintRef = useRef<"left" | "right" | null>(null);
  const persist = (next: { x: number; y: number; w: number }, side: "left" | "right" | null) => {
    try { localStorage.setItem("optima-call-widget", JSON.stringify({ ...next, docked: side })); } catch { /* storage off */ }
  };
  // mode "move", or the edge/corner being dragged to resize: n, s, e, w, ne, nw, se, sw.
  const drag = useRef<{ mode: string; startX: number; startY: number; box: { x: number; y: number; w: number }; height: number } | null>(null);
  // A drag that started on the video must not also count as "tap to expand".
  const dragged = useRef(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const clamp = useCallback((next: { x: number; y: number; w: number }) => {
    const w = Math.max(minWidgetWidth(), Math.min(next.w, window.innerWidth - 16, 720));
    const h = widgetRef.current?.offsetHeight ?? w * 0.75;
    return { w, x: Math.max(8, Math.min(next.x, window.innerWidth - w - 8)), y: Math.max(8, Math.min(next.y, window.innerHeight - h - 8)) };
  }, []);
  // First show only (nothing saved yet): bottom-right corner. Keyed on a
  // sentinel, not on "x is negative" — dragging past the left edge makes x
  // negative too, and that used to throw the widget back to the right side.
  const placed = useRef(box.x !== -1 || box.y !== -1);
  useEffect(() => {
    if (placed.current) return;
    placed.current = true;
    const h = widgetRef.current?.offsetHeight ?? 220;
    setBox((current) => clamp({ ...current, x: window.innerWidth - current.w - 20, y: window.innerHeight - h - 96 }));
  }, [clamp]);
  useEffect(() => {
    const onResize = () => setBox((current) => clamp(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);
  // Phones: dragging runs on native touch events (below) — pointer events got
  // cancelled by the browser's own scroll/back-swipe gestures and the widget
  // only crept along a few pixels per try.
  const touchMode = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const [snapping, setSnapping] = useState(false);
  useEffect(() => {
    const node = widgetRef.current;
    if (!touchMode || !node) return;
    let startX = 0, startY = 0, origin = { x: 0, y: 0, w: 0 }, moved = false, lastX = 0, lastT = 0, velocity = 0, active = false;
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || (event.target as HTMLElement).closest("button")) return;
      const touch = event.touches[0];
      active = true; moved = false; velocity = 0;
      startX = lastX = touch.clientX; startY = touch.clientY; lastT = performance.now();
      origin = { ...boxRef.current };
      setSnapping(false);
    };
    const onMove = (event: TouchEvent) => {
      if (!active) return;
      const touch = event.touches[0];
      const dx = touch.clientX - startX, dy = touch.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      event.preventDefault();
      const now = performance.now();
      velocity = (touch.clientX - lastX) / Math.max(1, now - lastT);
      lastX = touch.clientX; lastT = now;
      const h = node.offsetHeight;
      setBox({
        w: origin.w,
        x: Math.max(-origin.w + 40, Math.min(origin.x + dx, window.innerWidth - 40)),
        y: Math.max(8, Math.min(origin.y + dy, window.innerHeight - h - 8)),
      });
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      if (!moved) return;
      dragged.current = true;
      window.setTimeout(() => { dragged.current = false; }, 50);
      const current = boxRef.current;
      const hidden = current.x < 0 ? -current.x : Math.max(0, current.x + current.w - window.innerWidth);
      // Pushed well past a side, or flicked hard towards it: tuck it away there.
      const side = hidden > current.w * 0.35 ? (current.x < 0 ? "left" : "right")
        : Math.abs(velocity) > 1.1 ? (velocity < 0 ? "left" : "right") : null;
      if (side) {
        setDocked(side);
        const parked = clamp(current);
        persist(parked, side);
        setBox(parked);
        return;
      }
      // Otherwise settle into the nearest corner, like picture-in-picture.
      const h = node.offsetHeight, m = 12;
      const left = current.x + current.w / 2 < window.innerWidth / 2;
      const top = current.y + h / 2 < window.innerHeight / 2;
      const next = { w: current.w, x: left ? m : window.innerWidth - current.w - m, y: top ? 72 : window.innerHeight - h - 96 };
      setSnapping(true);
      setBox(next);
      persist(next, null);
      window.setTimeout(() => setSnapping(false), 260);
    };
    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("touchmove", onMove, { passive: false });
    node.addEventListener("touchend", onEnd);
    node.addEventListener("touchcancel", onEnd);
    return () => {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onEnd);
    };
  }, [touchMode, docked, clamp]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (mode: string) => (event: React.PointerEvent) => {
    if (event.pointerType === "touch" && touchMode) return; // touch handled natively above
    // Grab anywhere — except the buttons and (for moving) the resize edges.
    if (mode === "move" && (event.target as HTMLElement).closest("button, .floating-widget-resize")) return;
    if (event.button > 0) return;
    dragged.current = false;
    drag.current = { mode, startX: event.clientX, startY: event.clientY, box, height: widgetRef.current?.offsetHeight ?? box.w * 0.75 };
    if (mode !== "move") {
      // An edge is a thin strip the pointer leaves on its first move: keep
      // following it from the start (moving waits 5px so a tap still expands).
      event.stopPropagation();
      dragged.current = true;
      widgetRef.current?.setPointerCapture(event.pointerId);
    }
  };
  const move = (event: React.PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.startX, dy = event.clientY - state.startY;
    if (!dragged.current) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return; // still a tap
      dragged.current = true;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    if (state.mode === "move") {
      // Vertically it stays on screen; sideways it may be pushed past the
      // edge — far enough and letting go tucks it into the edge tab.
      const clamped = clamp({ ...state.box, x: state.box.x + dx, y: state.box.y + dy });
      const x = Math.max(-state.box.w + 48, Math.min(state.box.x + dx, window.innerWidth - 48));
      setBox({ ...clamped, x });
      // The pointer reaching a side edge — or the widget pushed a good way
      // past it — means "tuck it away there".
      const hidden = x < 0 ? -x : Math.max(0, x + state.box.w - window.innerWidth);
      const hint = event.clientX <= EDGE_ZONE || (x < 0 && hidden > state.box.w * 0.3) ? "left"
        : event.clientX >= window.innerWidth - EDGE_ZONE || (x > 0 && hidden > state.box.w * 0.3) ? "right"
        : null;
      if (hint !== edgeHintRef.current) { edgeHintRef.current = hint; setEdgeHint(hint); }
      return;
    }
    // Resizing keeps the shape: width follows the dragged edge(s); the opposite
    // side stays put, so a left/top edge moves x/y by what the width/height gained.
    const ratio = state.height / state.box.w;
    let grow = 0;
    if (state.mode.includes("e")) grow += dx;
    if (state.mode.includes("w")) grow -= dx;
    if (state.mode.includes("s")) grow += dy / ratio;
    if (state.mode.includes("n")) grow -= dy / ratio;
    if (state.mode.length === 2) grow /= 2; // a corner moves along both axes at once
    const w = Math.max(minWidgetWidth(), Math.min(state.box.w + grow, window.innerWidth - 16, 720));
    const gained = w - state.box.w;
    setBox(clamp({
      w,
      x: state.mode.includes("w") ? state.box.x - gained : state.box.x,
      y: state.mode.includes("n") ? state.box.y - gained * ratio : state.box.y,
    }));
  };
  const end = () => {
    if (!drag.current) return;
    const wasMove = drag.current.mode === "move";
    drag.current = null;
    const side = wasMove ? edgeHintRef.current : null;
    edgeHintRef.current = null;
    setEdgeHint(null);
    if (side) setDocked(side);
    setBox((current) => {
      const next = clamp(current);
      persist(next, side);
      return next;
    });
  };
  const undock = () => {
    setDocked(null);
    setBox((current) => { const next = clamp(current); persist(next, null); return next; });
  };
  if (docked) {
    const tabTop = Math.max(8, Math.min(box.y + 40, window.innerHeight - 96));
    return <>
      {/* Still mounted while tucked away: the call's audio must keep playing. */}
      {remotes.map((remote) => remote.stream && <RemoteAudio key={remote.id} stream={remote.stream} />)}
      <button type="button" className={`meeting-widget-tab ${docked}`} style={{ top: tabTop }} onClick={undock}
              aria-label={t("meetingRoom.expandWidgetAria")} title={title}>
        {docked === "left" ? <ChevronRight size={22} /> : <ChevronLeft size={22} />}
        {!microphone && <MicOff size={12} className="meeting-widget-tab-mic" />}
      </button>
    </>;
  }
  return (<>
    {edgeHint && <div className={`meeting-dock-hint ${edgeHint}`} aria-hidden="true" />}
    <div ref={widgetRef} className={`meeting-floating-widget${edgeHint ? " is-docking" : ""}${snapping ? " is-snapping" : ""}${touchMode ? " is-touch" : ""}`} role="complementary" aria-label={t("meetingRoom.floatingWidgetAria")}
         style={placed.current ? { left: box.x, top: box.y, right: "auto", bottom: "auto", width: box.w } : { width: box.w }}
         onPointerDown={start("move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
      <div className="floating-widget-video" onClick={() => { if (!dragged.current) onExpand(); }}>
        {/* Muted: the audio comes from the <audio> elements below, one per person. */}
        {tile ? <VideoTile stream={tile.stream} muted mirrored={tile.isSelf} label={tile.label} avatar={tile.avatar} microphoneOn={tile.mic} videoOn={tile.video} /> : <div className="video-placeholder"><LoaderCircle className="spin" size={22} /></div>}
      </div>
      {remotes.map((remote) => remote.stream && <RemoteAudio key={remote.id} stream={remote.stream} />)}
      <header className="floating-widget-handle" title={t("meetingRoom.dragToMove")}>
        <strong>{title}</strong>
        <button onClick={onExpand} title={t("meetingRoom.expandWidgetAria")} aria-label={t("meetingRoom.expandWidgetAria")}><Maximize2 size={15} /></button>
      </header>
      <div className="floating-widget-controls">
        <button className={microphone ? "" : "off"} onClick={onToggleMic} title={microphone ? t("meetingRoom.turnOffMicAria") : t("meetingRoom.turnOnMicAria")} aria-label={microphone ? t("meetingRoom.turnOffMicAria") : t("meetingRoom.turnOnMicAria")}>{microphone ? <Mic size={17} /> : <MicOff size={17} />}</button>
        <button className={camera ? "" : "off"} onClick={onToggleCamera} title={camera ? t("meetingRoom.turnOffCameraAria") : t("meetingRoom.turnOnCameraAria")} aria-label={camera ? t("meetingRoom.turnOffCameraAria") : t("meetingRoom.turnOnCameraAria")}>{camera ? <Camera size={17} /> : <CameraOff size={17} />}</button>
        <button className="leave-control" onClick={onLeave} title={t("meetingRoom.leaveMeetingAria")} aria-label={t("meetingRoom.leaveMeetingAria")}><PhoneOff size={17} /></button>
      </div>
      {(["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const).map((edge) => (
        <span key={edge} className={`floating-widget-resize resize-${edge}`} onPointerDown={start(edge)} role="separator" aria-label={t("meetingRoom.dragToResize")} title={t("meetingRoom.dragToResize")} />
      ))}
    </div>
  </>);
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
export function MeetingRoomPage({ meetingId: meetingIdProp, directMode = false, directKind = "audio", directPeer, onDirectClose }: { meetingId?: string; directMode?: boolean; directKind?: "audio" | "video"; directPeer?: Pick<User, "firstName" | "lastName" | "avatarUrl">; onDirectClose?: () => void }) {
  const { user, group } = useAuth();
  const selfId = user?.id || "__self__";
  const { show } = useToast();
  const { t, locale } = useI18n();
  const [location, navigate] = useLocation();
  // Two ways in: the shareable /meet/<code> link (Google Meet style) and the
  // older /meetings/<id>, which is rewritten to /meet/<code> once loaded.
  const routeMatch = !directMode ? location.match(/^\/(?:meetings\/([0-9a-f-]{36})|meet\/([a-z0-9-]{3,20}))\/?$/i) : null;
  const routeId = routeMatch?.[1] ?? null;
  const routeCode = routeMatch?.[2]?.toLowerCase() ?? null;
  const [standaloneMeetingId, setStandaloneMeetingId] = useState<string | null>(null);
  const [codeNotFound, setCodeNotFound] = useState(false);
  useEffect(() => {
    // Route match only ever needs to set the id, never clear it — leaving
    // the route is exactly the "keep running as a widget" case.
    if (directMode) return;
    // One meeting at a time: a link to another meeting while in one is refused
    // and the page goes back to the meeting this person is in.
    const pick = (id: string) => {
      const active = getActiveMeeting();
      if (active && active.id !== id) {
        show(t("meetingRoom.alreadyInMeeting"), "error");
        navigate(active.code ? `/meet/${active.code}` : `/meetings/${active.id}`, { replace: true });
        return;
      }
      setStandaloneMeetingId(id);
    };
    if (routeId) { setCodeNotFound(false); pick(routeId); return; }
    if (!routeCode) return;
    let cancelled = false;
    setCodeNotFound(false);
    api.meetings.resolveByCode(routeCode)
      .then((found) => { if (!cancelled) pick(found.id); })
      .catch(() => { if (!cancelled) setCodeNotFound(true); });
    return () => { cancelled = true; };
  }, [directMode, routeId, routeCode]);
  const meetingId = directMode ? meetingIdProp! : standaloneMeetingId;
  // True only while this instance actually owns the screen (its own
  // /meetings/:id route, or the direct-call overlay). Off the route it is at
  // most a floating widget — and when not even in a call, nothing at all.
  // The lobby camera preview keys off this: see the getUserMedia effect below.
  const isFullMode = directMode || Boolean(routeMatch);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
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
  /** The browser is showing its camera/microphone prompt right now (drives the "Click Allow" overlay). */
  const [permissionPrompt, setPermissionPrompt] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidePanel, setSidePanel] = useState<"participants" | "info" | "waiting" | "settings" | null>(null);
  const [meetingChatOpen, setMeetingChatOpen] = useState(false);
  const meetingChat = useMeetingChat(meetingId, user?.id || "");
  const attachMeetingChat = meetingChat.attach;
  useEffect(() => { if (sidePanel) setMeetingChatOpen(false); }, [sidePanel]);
  const [accessDenied, setAccessDenied] = useState("");
  const [requestState, setRequestState] = useState<"idle" | "requesting" | "pending" | "rejected">("idle");
  const [waitingRequests, setWaitingRequests] = useState<MeetingJoinRequest[]>([]);
  const [waitingBusy, setWaitingBusy] = useState<string | null>(null);
  const [waitingCount, setWaitingCount] = useState<number | null>(null);
  const [settingsVisibility, setSettingsVisibility] = useState<MeetingVisibility>("public");
  const [settingsJoinPolicy, setSettingsJoinPolicy] = useState<MeetingJoinPolicyValue>("auto");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [inviteEmailsInput, setInviteEmailsInput] = useState("");
  const [inviting, setInviting] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [reactionOpen, setReactionOpen] = useState(false);
  const [reactions, setReactions] = useState<Array<{ id: string; userId: string; emoji: string }>>([]);
  const [pinnedUserId, setPinnedUserId] = useState<string | null>(null);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  // Manual override for the footer's grid-view button — lets someone drop
  // out of screen-share/speaker/pinned spotlight and see everyone at once,
  // Meet-style, without having to unpin or wait for the share to stop.
  const [gridViewForced, setGridViewForced] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const audioAnalysers = useRef(new Map<string, { ctx: AudioContext; analyser: AnalyserNode; data: Uint8Array<ArrayBuffer> }>());
  const speakerStableTicks = useRef(new Map<string, number>());
  const [localStream, setLocalStream] = useState<MediaStream>();
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  /**
   * Who else is in the room, independent of whether any media has arrived
   * from them.
   *
   * The grid, the header count and the participants panel all used to be
   * derived from `remoteStreams`, i.e. from WebRTC tracks. Someone who joins
   * with the camera and microphone off publishes no track at all, so they
   * were invisible to everyone already in the call — the room kept saying
   * "waiting for others" while they sat in it, and whichever side happened to
   * publish something first was the only one anybody could see. Presence is a
   * roster fact, not a media fact; the stream is attached to a tile when and
   * if it shows up.
   */
  const [roster, setRoster] = useState<Record<string, MeetingUser | null>>({});
  const [remoteMedia, setRemoteMedia] = useState<Record<string, { audio: boolean; video: boolean; screen: boolean }>>({});
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "offline">("connecting");
  /**
   * Per-peer RTCPeerConnection.connectionState. The header used to report the
   * *socket* state, so a call whose media never crossed the NAT — every peer
   * `failed`, nothing visible or audible — still read "connection stable" and
   * gave the user nothing to go on. Signalling being up says nothing about
   * whether media is flowing.
   */
  const [peerStates, setPeerStates] = useState<Record<string, RTCPeerConnectionState>>({});
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const iceQueue = useRef(new Map<string, RTCIceCandidateInit[]>());
  const currentStream = useRef<MediaStream | undefined>(undefined);
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  /**
   * The sender carrying our screen share to each peer, and whether we got it
   * by borrowing the camera's sender (replaceTrack) or by adding a new one.
   * Stopping the share has to undo exactly what starting it did.
   */
  const screenSenders = useRef(new Map<string, { sender: RTCRtpSender; borrowed: boolean }>());
  // Perfect negotiation: peers we currently have an offer in flight to.
  const makingOffer = useRef(new Set<string>());
  const rtcConfig = useRef<RTCConfiguration>(RTC_CONFIG);
  const reconnectAttempts = useRef(new Map<string, number>());
  const disconnectTimers = useRef(new Map<string, number>());
  const securityKeyPair = useRef<Promise<CryptoKeyPair> | null>(null);
  const remoteSecurityKeys = useRef(new Map<string, JsonWebKey>());
  const [securityCodes, setSecurityCodes] = useState<Record<string, string[]>>({});
  const negotiateRef = useRef<(targetUserId: string, iceRestart?: boolean) => Promise<void>>(async () => {});
  /**
   * The socket connection this client last sent `meeting:join` on. Each join
   * makes everyone else drop their connection to us and start a fresh one, so
   * it must happen exactly once per socket connection: not again when the
   * effect below merely re-subscribes (settings saved, meeting refetched), and
   * — after a reconnect — only once our own stale connections are gone too.
   */
  const joinedSocketId = useRef<string | null>(null);
  /**
   * Media transport, decided on entering: "livekit" (SFU) when the server has
   * it configured, the peer-to-peer mesh otherwise. With LiveKit the socket
   * still carries the roster, hands, reactions and toggles; only audio/video
   * and in-call chat move to the SFU, and none of the offer/answer/ICE
   * handling below runs.
   */
  const mediaProvider = useRef<"livekit" | "p2p">("p2p");
  const liveKit = useRef<LiveKitMeeting | null>(null);
  const liveKitStarting = useRef(false);

  /**
   * Perfect negotiation's tie-breaker. The same comparison already decides who
   * sends the *initial* offer, so reusing it keeps one consistent role per
   * pair: the peer that does not open the connection is the polite one, and
   * politeness is what resolves a collision when both sides renegotiate at
   * once (two people switching their cameras on together, say).
   */
  const isPolite = useCallback(
    (targetUserId: string) => Boolean(user?.id) && user!.id.localeCompare(targetUserId) > 0,
    [user?.id],
  );

  const ensureSecurityKey = useCallback(() => {
    securityKeyPair.current ||= crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    return securityKeyPair.current;
  }, []);

  // The security code is a nicety on top of the call. Without WebCrypto (an
  // insecure http:// origin) it can't be computed — that must not stop the
  // offer that follows it from going out, which is what used to happen.
  const sendSecurityKey = useCallback(async (targetUserId: string) => {
    try {
      const pair = await ensureSecurityKey();
      const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
      getSocket().emit("meeting:key", { meetingId, targetUserId, publicKey });
    } catch {
      // No security code for this peer; the call itself is unaffected.
    }
  }, [ensureSecurityKey, meetingId]);

  const updateSecurityCode = useCallback(async (targetUserId: string, peer: RTCPeerConnection) => {
    const remoteJwk = remoteSecurityKeys.current.get(targetUserId);
    const fingerprints = dtlsFingerprints(peer);
    if (!remoteJwk || !fingerprints || !peer.localDescription || !peer.remoteDescription || !globalThis.crypto?.subtle) return;
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
    // Camera and microphone exist only in secure contexts (https:// or
    // localhost). Opened as http://<LAN IP> there is no mediaDevices at all,
    // and calling into it threw from inside this effect.
    if (!navigator.mediaDevices) {
      setPermissionError(t("meetingRoom.insecureContext"));
      return;
    }
    let cancelled = false;
    let settled = false;
    // Only while the browser is actually asking: "prompt" means the
    // permission dialog is up and nothing will happen until it's answered.
    void navigator.permissions?.query({ name: (camera ? "camera" : "microphone") as PermissionName })
      .then((status) => { if (!settled && !cancelled && status.state === "prompt") setPermissionPrompt(true); })
      .catch(() => undefined);
    navigator.mediaDevices.getUserMedia({
      video: camera ? { deviceId: cameraDevice ? { exact: cameraDevice } : undefined } : false,
      audio: microphone ? { deviceId: microphoneDevice ? { exact: microphoneDevice } : undefined } : false,
    }).then(async (stream) => {
      if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      setPermissionError("");
      setPreviewStream((current) => { current?.getTracks().forEach((track) => track.stop()); return stream; });
      setDevices(await navigator.mediaDevices.enumerateDevices());
    }).catch(() => setPermissionError(t("meetingRoom.permissionDenied")))
      .finally(() => { settled = true; setPermissionPrompt(false); });
    return () => { cancelled = true; setPermissionPrompt(false); };
  // Device selection intentionally restarts preview.
  }, [isFullMode, entered, camera, microphone, cameraDevice, microphoneDevice]);

  useEffect(() => {
    if (!meetingId) return;
    Promise.all([api.meetings.one(meetingId), group ? api.groups.members(group.id).catch(() => []) : Promise.resolve([])])
      .then(([nextMeeting, nextMembers]) => {
        setMeeting(nextMeeting);
        setMembers(nextMembers);
        // Old /meetings/<id> links settle on the shareable /meet/<code> form.
        if (!directMode && window.location.pathname.startsWith("/meetings/") && /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(nextMeeting.code)) {
          navigate(`/meet/${nextMeeting.code}`, { replace: true });
        }
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
  }, [meetingId, group?.id, show, t, directMode, navigate]);

  /**
   * Identities for everyone on screen.
   *
   * The meeting's own roster comes first: it covers guests, standalone
   * meetings with no group at all, and anyone who simply isn't in the
   * viewer's organisation — all of whom used to fall through to the generic
   * "Qatnashchi" label because this map was built purely from the group
   * member list. That list is still consulted as a fallback, since it carries
   * the richer profile for colleagues.
   */
  const users = useMemo(() => {
    const map = new Map<string, User>();
    for (const member of members) map.set(member.userId, member.user as User);
    for (const participant of meeting?.participants ?? []) {
      if (participant.user) map.set(participant.userId, participant.user as unknown as User);
    }
    for (const [userId, profile] of Object.entries(roster)) {
      if (profile) map.set(userId, profile as unknown as User);
    }
    return map;
  }, [members, meeting?.participants, roster]);

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
      group_only: t("meetings.visibilityWorkspace"),
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
      await api.meetings.invite(meetingId!, { emails });
      show(t("meetingRoom.inviteSentToast"));
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
    const url = `${window.location.origin}/meet/${meeting.code}`;
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

  const { receive: receiveMeetingChat, setTransport: setMeetingChatTransport } = meetingChat;
  /**
   * Connects to the meeting's LiveKit room once the socket join has been
   * accepted (the token endpoint only serves participants already in).
   */
  const startLiveKit = useCallback(async () => {
    if (!meetingId || liveKit.current || liveKitStarting.current) return;
    liveKitStarting.current = true;
    try {
      const session = await api.meetings.mediaSession(meetingId);
      if (session.provider !== "livekit") {
        mediaProvider.current = "p2p";
        return;
      }
      const session_ = new LiveKitMeeting({
        onRemote: (userId, stream, media) => {
          setRemoteStreams((current) => {
            const next = { ...current };
            if (stream) next[userId] = stream; else delete next[userId];
            return next;
          });
          setRemoteMedia((current) => ({ ...current, [userId]: media }));
          // The speaking indicator's analyser is bound to one audio track; let
          // it rebind to whatever this user publishes now.
          audioAnalysers.current.delete(userId);
          setMeetingChatTransport((payload) => session_.sendChat(payload), session_.remoteCount);
        },
        onState: (state) => {
          setPeerStates(state === "connected" ? { sfu: "connected" } : state === "disconnected" ? { sfu: "failed" } : { sfu: "connecting" });
          setMeetingChatTransport((payload) => session_.sendChat(payload), session_.remoteCount);
        },
        onData: receiveMeetingChat,
        onSpeakers: (ids) => { if (ids[0]) setActiveSpeakerId(ids[0]); },
      });
      liveKit.current = session_;
      await session_.connect(session.url, session.token, currentStream.current?.getTracks() ?? []);
      if (screenTrack.current) await session_.publish(screenTrack.current, true);
    } catch {
      show(t("meetingRoom.mediaFailed"), "error");
      setPeerStates({ sfu: "failed" });
    } finally {
      liveKitStarting.current = false;
    }
  }, [meetingId, receiveMeetingChat, setMeetingChatTransport, show, t]);

  const closePeer = useCallback((userId: string) => {
    const timer = disconnectTimers.current.get(userId);
    if (timer) window.clearTimeout(timer);
    disconnectTimers.current.delete(userId);
    peers.current.get(userId)?.close();
    peers.current.delete(userId);
    iceQueue.current.delete(userId);
    makingOffer.current.delete(userId);
    screenSenders.current.delete(userId);
    setPeerStates((current) => { const next = { ...current }; delete next[userId]; return next; });
    setRemoteStreams((current) => { const next = { ...current }; delete next[userId]; return next; });
    setRemoteMedia((current) => { const next = { ...current }; delete next[userId]; return next; });
    const node = audioAnalysers.current.get(userId);
    // The AudioContext is shared — only drop this person's analyser.
    if (node) audioAnalysers.current.delete(userId);
    speakerStableTicks.current.delete(userId);
    setActiveSpeakerId((current) => (current === userId ? null : current));
  }, []);

  const createPeer = useCallback((targetUserId: string) => {
    const existing = peers.current.get(targetUserId);
    if (existing) return existing;
    const socket = getSocket();
    const peer = new RTCPeerConnection(rtcConfig.current);
    if (!directMode) attachMeetingChat(peer, targetUserId);
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
          // A video track arriving *is* the proof that this peer has video.
          // Falling back to the remembered value kept the `false` recorded
          // when they joined audio-only, so a camera switched on mid-call
          // stayed hidden unless the meeting:toggled event also landed.
          video: event.track.kind === "video" ? true : current[targetUserId]?.video ?? stream.getVideoTracks().length > 0,
          screen: current[targetUserId]?.screen ?? false,
        },
      }));
    };
    // Every local media change (a track added, a screen share started or
    // stopped, an ICE restart requested) funnels through here, so no code path
    // can add media and then forget to renegotiate.
    peer.onnegotiationneeded = () => { void negotiateRef.current(targetUserId); };
    peer.onconnectionstatechange = () => {
      setPeerStates((current) => ({ ...current, [targetUserId]: peer.connectionState }));
      if (peer.connectionState === "connected") {
        reconnectAttempts.current.delete(targetUserId);
        const timer = disconnectTimers.current.get(targetUserId);
        if (timer) window.clearTimeout(timer);
        disconnectTimers.current.delete(targetUserId);
      }
      if (peer.connectionState === "disconnected" && !disconnectTimers.current.has(targetUserId)) {
        const timer = window.setTimeout(() => {
          disconnectTimers.current.delete(targetUserId);
          if (peer.connectionState === "disconnected") void negotiateRef.current(targetUserId, true);
        }, 4000);
        disconnectTimers.current.set(targetUserId, timer);
      }
      if (peer.connectionState === "failed") {
        const attempts = reconnectAttempts.current.get(targetUserId) || 0;
        if (attempts < 2) {
          reconnectAttempts.current.set(targetUserId, attempts + 1);
          void negotiateRef.current(targetUserId, true);
        } else closePeer(targetUserId);
      }
      if (peer.connectionState === "closed") closePeer(targetUserId);
    };
    peers.current.set(targetUserId, peer);
    return peer;
  }, [meetingId, closePeer, directMode, attachMeetingChat]);

  /**
   * The one place an offer is ever created. Called directly to open a
   * connection (a peer with no local tracks never raises negotiationneeded,
   * so the first offer has to be explicit) and to request an ICE restart;
   * called by onnegotiationneeded for everything else.
   *
   * Bailing out mid-exchange is safe now, which it was not before: the
   * negotiation-needed flag set by restartIce/addTrack survives, and
   * onnegotiationneeded re-enters here as soon as we are stable again. The
   * old early return simply dropped the renegotiation on the floor — that is
   * how a screen share could report itself as live while no offer describing
   * it had ever been sent.
   */
  const negotiate = useCallback(async (targetUserId: string, iceRestart = false) => {
    const peer = createPeer(targetUserId);
    if (iceRestart) peer.restartIce();
    if (makingOffer.current.has(targetUserId) || peer.signalingState !== "stable") return;
    try {
      makingOffer.current.add(targetUserId);
      await peer.setLocalDescription();
      if (peer.localDescription) getSocket().emit("meeting:offer", { meetingId, targetUserId, sdp: peer.localDescription });
    } catch {
      // Not fatal: connectionstatechange still retries, and the flag stays set.
    } finally {
      makingOffer.current.delete(targetUserId);
    }
  }, [createPeer, meetingId]);
  negotiateRef.current = negotiate;

  const flushIce = useCallback(async (userId: string, peer: RTCPeerConnection) => {
    const queued = iceQueue.current.get(userId) || [];
    for (const candidate of queued) await peer.addIceCandidate(candidate).catch(() => {});
    iceQueue.current.delete(userId);
  }, []);

  useEffect(() => {
    if (!entered) return;
    const socket = getSocket();
    const onConnect = () => {
      setConnectionState("connected");
      if (socket.id && joinedSocketId.current === socket.id) return;
      // A new connection after a drop. Rejoining tells everyone else to throw
      // away their connection to us and negotiate a new one; ours have to go
      // as well, or we answer their fresh offers on dead connections and the
      // call never recovers (both sides ended with no media at all).
      if (joinedSocketId.current) for (const id of [...peers.current.keys()]) closePeer(id);
      joinedSocketId.current = socket.id ?? null;
      socket.emit("meeting:join", { meetingId });
    };
    const onDisconnect = () => setConnectionState("offline");
    const onParticipants = async ({ userIds, participants }: { userIds: string[]; participants?: Array<{ userId: string; user: MeetingUser | null }> }) => {
      // The roster first, so everyone already here is on screen before a
      // single offer/answer round trip has happened.
      setRoster((current) => {
        const next = { ...current };
        for (const id of userIds) next[id] = next[id] ?? null;
        for (const entry of participants ?? []) next[entry.userId] = entry.user;
        return next;
      });
      if (mediaProvider.current === "livekit") {
        void startLiveKit();
        return;
      }
      for (const targetUserId of userIds) {
        await sendSecurityKey(targetUserId);
        if (user?.id && !isPolite(targetUserId)) await negotiate(targetUserId);
      }
    };
    const onUserJoined = ({ userId: joinedUserId, user: joinedUser }: { userId: string; user?: MeetingUser | null }) => {
      setRoster((current) => ({ ...current, [joinedUserId]: joinedUser ?? current[joinedUserId] ?? null }));
      if (mediaProvider.current === "livekit") return;
      // A `user-joined` event always means a brand-new socket/session for
      // this user — either a genuinely new participant, or someone who
      // refreshed/reconnected. Either way, any RTCPeerConnection we already
      // hold for them belongs to a session that's gone. Because a quick
      // refresh reconnects inside the server's grace window, `user-left`
      // never fires for it — so without this, createPeer's "if already
      // exists, reuse it" kept wiring a dead connection back up forever.
      // That was the actual cause of the permanent frozen-camera/stuck-on-
      // Connecting bug: neither side ever renegotiated because each thought
      // a (dead) peer connection already existed.
      if (peers.current.has(joinedUserId)) closePeer(joinedUserId);
      void sendSecurityKey(joinedUserId);
      window.setTimeout(() => {
        if (user?.id && !isPolite(joinedUserId)) void negotiate(joinedUserId);
      }, 300);
    };
    /**
     * Perfect negotiation, answerer half.
     *
     * Two peers renegotiating at the same instant (both switching a camera on,
     * say — far more likely in production than on a loopback connection) used
     * to leave this side throwing InvalidStateError out of an unhandled
     * promise: no answer went back, and the peer sat in have-local-offer for
     * the rest of the call with video permanently stuck. Now the impolite peer
     * discards the colliding offer and keeps its own, while the polite peer
     * lets setRemoteDescription roll its offer back and answers.
     */
    const onOffer = async ({ fromUserId, sdp }: { fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      if (mediaProvider.current === "livekit") return;
      const peer = createPeer(fromUserId);
      const collision = makingOffer.current.has(fromUserId) || peer.signalingState !== "stable";
      if (collision && !isPolite(fromUserId)) return;
      try {
        await peer.setRemoteDescription(sdp);
        await flushIce(fromUserId, peer);
        await peer.setLocalDescription();
        if (peer.localDescription) socket.emit("meeting:answer", { meetingId, targetUserId: fromUserId, sdp: peer.localDescription });
        await updateSecurityCode(fromUserId, peer);
      } catch {
        // The offerer's connectionstatechange retry is the backstop here.
      }
    };
    const onAnswer = async ({ fromUserId, sdp }: { fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      const peer = peers.current.get(fromUserId);
      // An answer to an offer we rolled back (or already superseded) would
      // throw; only the offer we are actually waiting on is applicable.
      if (!peer || peer.signalingState !== "have-local-offer") return;
      try {
        await peer.setRemoteDescription(sdp);
        await flushIce(fromUserId, peer);
        await updateSecurityCode(fromUserId, peer);
      } catch {
        // Same backstop as above.
      }
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
    const onLeft = ({ userId: leftUserId }: { userId: string }) => {
      setRoster((current) => {
        if (!(leftUserId in current)) return current;
        const next = { ...current };
        delete next[leftUserId];
        return next;
      });
      closePeer(leftUserId);
      setRaisedHands((current) => {
        if (!current.has(leftUserId)) return current;
        const next = new Set(current);
        next.delete(leftUserId);
        return next;
      });
    };
    const onHand = ({ userId, raised }: { userId: string; raised: boolean }) => setRaisedHands((current) => { const next = new Set(current); if (raised) next.add(userId); else next.delete(userId); return next; });
    // Reconnect/late-join snapshot: without this, refreshing mid-call would
    // silently drop every hand that was already raised before the socket
    // reconnected — the server still has them (Redis), the client just
    // hadn't been told yet.
    const onHandsSnapshot = ({ userIds }: { userIds: string[] }) =>
      setRaisedHands((current) => {
        const next = new Set(current);
        userIds.forEach((id) => next.add(id));
        return next;
      });
    const onReaction = (reaction: { id: string; userId: string; emoji: string }) => {
      setReactions((current) => [...current, reaction]);
      window.setTimeout(() => setReactions((current) => current.filter((item) => item.id !== reaction.id)), 3200);
    };
    // Host controls changed mid-call (see the enforcement effect below).
    const onPermissions = ({ permissions }: { permissions: MeetingPermissions }) =>
      setMeeting((current) => current ? { ...current, permissions } : current);
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
    // Only a failed *join* means there is no call to stay in. Everything else
    // (a screen share already claimed by someone else, a rejected moderation
    // action) is a message, not an eviction — this used to drop the user out
    // of a perfectly healthy meeting for pressing the share button.
    const onMeetingError = ({ message, fatal, code }: { message: string; fatal?: boolean; code?: string }) => {
      // One meeting at a time: offer to move over from the other tab/device.
      if (code === "MEETING_BUSY_ELSEWHERE") {
        show(t("meetingRoom.busyElsewhere"), "error");
        joinedSocketId.current = null;
        setEntered(false);
        return;
      }
      show(message || t("meetingRoom.joinFailed"), "error");
      if (fatal) setEntered(false);
    };
    // This person joined another meeting from elsewhere: this one is over here.
    const onMoved = (data: { meetingId?: string }) => {
      if (data?.meetingId !== meetingId) return;
      show(t("meetingRoom.movedElsewhere"));
      joinedSocketId.current = null;
      setEntered(false);
    };
    socket.on("meeting:moved", onMoved);
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
    socket.on("meeting:hands-snapshot", onHandsSnapshot);
    socket.on("meeting:reaction", onReaction);
    socket.on("meeting:toggled", onToggle);
    socket.on("meeting:permissions", onPermissions);
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
      socket.off("meeting:hands-snapshot", onHandsSnapshot);
      socket.off("meeting:reaction", onReaction);
      socket.off("meeting:toggled", onToggle);
      socket.off("meeting:permissions", onPermissions);
      socket.off("meeting:error", onMeetingError);
      socket.off("meeting:moved", onMoved);
    };
  }, [entered, meetingId, negotiate, isPolite, sendSecurityKey, updateSecurityCode, createPeer, flushIce, closePeer, startLiveKit, show, user?.id]);

  // Host-driven changes that arrive while in the call. Their own effect so a
  // re-render of `leave` never re-subscribes (and rejoins) the call above.
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  const meetingRef = useRef(meeting);
  meetingRef.current = meeting;
  useEffect(() => {
    if (!entered || !meetingId) return;
    const socket = getSocket();
    // "End call for everyone": without this the others stayed in a call that
    // no longer existed — frozen tiles until they hung up themselves.
    const onEnded = (data: { meetingId?: string }) => {
      if (data?.meetingId && data.meetingId !== meetingId) return;
      show(t("meet.endedByHost"));
      leaveRef.current();
    };
    // Co-host promotions/demotions: host controls appear or go away at once.
    const onRoleChanged = (data: { meetingId?: string; userId: string; role: MeetingParticipant["role"] }) => {
      if (data?.meetingId && data.meetingId !== meetingId) return;
      // Someone who joined after the page loaded has no entry in the
      // participant list to update; the server's copy has it.
      const known = meetingRef.current?.participants.some((participant) => participant.userId === data.userId);
      if (!known) {
        void api.meetings.one(meetingId).then(setMeeting).catch(() => undefined);
        return;
      }
      setMeeting((current) => current ? {
        ...current,
        participants: current.participants.map((participant) => participant.userId === data.userId ? { ...participant, role: data.role } : participant),
      } : current);
    };
    socket.on("meeting:ended", onEnded);
    socket.on("meeting:role-changed", onRoleChanged);
    return () => {
      socket.off("meeting:ended", onEnded);
      socket.off("meeting:role-changed", onRoleChanged);
    };
  }, [entered, meetingId, show, t]);

  // A reload mid-call re-enters an already-populated room: the socket only
  // reports who joins *after* this point, so the people already present come
  // from the participant list the REST fetch returned. Kept out of the effect
  // above — a refetched meeting must not re-subscribe (and so rejoin) the call.
  useEffect(() => {
    if (!entered) return;
    setRoster((current) => {
      const next = { ...current };
      for (const participant of meeting?.participants ?? []) {
        if (participant.leftAt || participant.userId === user?.id) continue;
        next[participant.userId] = next[participant.userId] ?? participant.user ?? null;
      }
      return next;
    });
  }, [entered, meeting?.participants, user?.id]);

  async function requestTrack(kind: "audio" | "video") {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: kind === "audio" ? { deviceId: microphoneDevice ? { exact: microphoneDevice } : undefined, ...VOICE_CAPTURE } : false,
      video: kind === "video" ? { deviceId: cameraDevice ? { exact: cameraDevice } : undefined } : false,
    });
    return stream.getTracks().find((track) => track.kind === kind);
  }

  async function enterMeeting() {
    // Still joinable without local devices (others are seen and heard), but say why ours are off.
    if (!navigator.mediaDevices) show(t("meetingRoom.insecureContext"), "error");
    setJoining(true);
    previewStream?.getTracks().forEach((track) => track.stop());
    setPreviewStream(undefined);
    try {
      rtcConfig.current = { iceServers: await api.meetings.iceServers() };
    } catch {
      rtcConfig.current = RTC_CONFIG;
    }
    mediaProvider.current = await api.meetings.mediaConfig().then((config) => config.provider, () => "p2p" as const);
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
      let track: MediaStreamTrack | undefined;
      try {
        track = await requestTrack(kind);
        if (!track) throw new Error("Media track unavailable");
      } catch {
        show(t("meetingRoom.cameraOrMicFailed", { device: kind === "video" ? t("meetingRoom.cameraWord") : t("meetingRoom.microphoneWord") }), "error");
        return;
      }
      currentStream.current ??= new MediaStream();
      currentStream.current.addTrack(track);
      setLocalStream(new MediaStream(currentStream.current.getTracks()));
      // Per peer, and never aborting the loop: one peer that cannot take the
      // track (a connection already failed, say) used to stop every remaining
      // participant from being offered it at all. Renegotiation itself is left
      // to onnegotiationneeded, which addTrack has just armed.
      for (const peer of peers.current.values()) {
        try {
          peer.addTrack(track, currentStream.current);
        } catch {
          // Keep going — the others still get the new track.
        }
      }
      void liveKit.current?.publish(track);
    } else if (kind === "video" && !enabled && existing) {
      // Camera off means the camera is released — a disabled track keeps the
      // device (and its light) on. Turning it back on goes through the branch
      // above and asks for a fresh track.
      currentStream.current?.removeTrack(existing);
      for (const peer of peers.current.values()) {
        const sender = peer.getSenders().find((item) => item.track === existing);
        if (sender) try { peer.removeTrack(sender); } catch { /* connection already gone */ }
      }
      void liveKit.current?.unpublish(existing);
      existing.stop();
      setLocalStream(new MediaStream(currentStream.current?.getTracks() ?? []));
    } else {
      existing && (existing.enabled = enabled);
      // Muting through LiveKit also stops the bytes and tells everyone else.
      void liveKit.current?.setEnabled(kind, enabled);
    }
    if (kind === "audio") setMicrophone(enabled); else setCamera(enabled);
    getSocket().emit("meeting:toggle", { meetingId, kind, enabled });
  }

  async function stopScreenShare() {
    const sharedTrack = screenTrack.current;
    if (!sharedTrack && !screenSharing) return;
    if (sharedTrack) sharedTrack.onended = null;
    const cameraTrack = currentStream.current?.getVideoTracks()[0] ?? null;
    // Undo exactly what toggleScreen did, per peer. The old code searched for
    // "any video sender" and handed it replaceTrack(null) whenever the camera
    // was off, which left the sender alive but empty — the far side kept the
    // last shared frame frozen on screen indefinitely.
    for (const [targetUserId, entry] of screenSenders.current) {
      const peer = peers.current.get(targetUserId);
      if (!peer) continue;
      try {
        if (entry.borrowed && cameraTrack) await entry.sender.replaceTrack(cameraTrack);
        else peer.removeTrack(entry.sender);
      } catch {
        // A peer that is already gone needs no unwinding.
      }
    }
    screenSenders.current.clear();
    if (liveKit.current && sharedTrack) await liveKit.current.unpublish(sharedTrack);
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
    let display: MediaStream;
    let track: MediaStreamTrack | undefined;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      track = display.getVideoTracks()[0];
      if (!track) throw new Error("Screen track unavailable");
    } catch (error) {
      // Closing the browser's picker rejects with NotAllowedError — the user
      // changed their mind, nothing to report.
      if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError")) return;
      show(t("meetingRoom.screenShareFailed"), "error");
      return;
    }
    screenTrack.current = track;
    setScreenStream(display);
    const cameraTrack = currentStream.current?.getVideoTracks()[0] ?? null;
    for (const [targetUserId, peer] of peers.current) {
      try {
        const cameraSender = cameraTrack ? peer.getSenders().find((entry) => entry.track === cameraTrack) : undefined;
        if (cameraSender) {
          await cameraSender.replaceTrack(track);
          screenSenders.current.set(targetUserId, { sender: cameraSender, borrowed: true });
          continue;
        }
        // Announced under the stream we already publish, NOT under the fresh
        // getDisplayMedia stream: the receiver keys its tile off
        // event.streams[0], so a new stream id replaced the entry holding this
        // peer's audio and the far side stopped hearing us mid-share.
        currentStream.current ??= new MediaStream();
        screenSenders.current.set(targetUserId, { sender: peer.addTrack(track, currentStream.current), borrowed: false });
      } catch {
        // Keep sharing with everyone else.
      }
    }
    if (liveKit.current) await liveKit.current.publish(track, true).catch(() => undefined);
    setScreenSharing(true);
    getSocket().emit("meeting:toggle", { meetingId, kind: "screen", enabled: true });
    track.onended = () => void stopScreenShare();
  }

  const cleanup = useCallback(() => {
    getSocket().emit("meeting:leave", { meetingId });
    joinedSocketId.current = null;
    void liveKit.current?.disconnect();
    liveKit.current = null;
    setMeetingChatTransport(null);
    peers.current.forEach((peer) => peer.close());
    peers.current.clear();
    makingOffer.current.clear();
    screenSenders.current.clear();
    iceQueue.current.clear();
    setPeerStates({});
    setRoster({});
    setRemoteStreams({});
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
  }, [meetingId, setMeetingChatTransport]);

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

  // Host-only "End meeting for everyone" — the backend endpoint
  // (POST /meetings/:id/end) already existed and broadcasts meeting:ended
  // to every socket, but nothing in this UI ever called it.
  async function endMeetingForAll() {
    if (!meetingId || !window.confirm(t("meetingRoom.endMeetingConfirm"))) return;
    setMoreMenuOpen(false);
    try {
      await api.meetings.end(meetingId);
    } catch (error) {
      show(error instanceof Error ? error.message : t("meetingRoom.endMeetingFailed"));
    }
  }

  function toggleHand() {
    const raised = !handRaised;
    setHandRaised(raised);
    setRaisedHands((current) => { const next = new Set(current); if (user?.id) { if (raised) next.add(user.id); else next.delete(user.id); } return next; });
    getSocket().emit("meeting:hand", { meetingId, raised });
  }

  /** Swap the live microphone/camera for another device without leaving the call. */
  async function switchDevice(kind: "audio" | "video", deviceId: string) {
    if (kind === "audio") setMicrophoneDevice(deviceId); else setCameraDevice(deviceId);
    setDeviceMenu(null);
    const old = currentStream.current?.getTracks().find((track) => track.kind === kind);
    if (!old || !navigator.mediaDevices || !currentStream.current) return;
    try {
      const constraint = { deviceId: deviceId ? { exact: deviceId } : undefined };
      const fresh = await navigator.mediaDevices.getUserMedia(kind === "audio" ? { audio: { ...constraint, ...VOICE_CAPTURE } } : { video: constraint });
      const track = fresh.getTracks()[0];
      track.enabled = old.enabled;
      for (const peer of peers.current.values()) {
        const sender = peer.getSenders().find((entry) => entry.track === old);
        await sender?.replaceTrack(track).catch(() => undefined);
      }
      currentStream.current.removeTrack(old);
      currentStream.current.addTrack(track);
      old.stop();
      setLocalStream(new MediaStream(currentStream.current.getTracks()));
      await liveKit.current?.publish(track);
    } catch {
      show(t("meetingRoom.cameraOrMicFailed", { device: kind === "video" ? t("meetingRoom.cameraWord") : t("meetingRoom.microphoneWord") }), "error");
    }
  }

  function togglePanel(panel: NonNullable<typeof sidePanel> | "chat") {
    if (panel === "chat") {
      setMeetingChatOpen((open) => !open);
      setSidePanel(null);
      return;
    }
    setMeetingChatOpen(false);
    setSidePanel((current) => current === panel ? null : panel);
  }

  function sendReaction(emoji: string) {
    setReactionOpen(false);
    getSocket().emit("meeting:reaction", { meetingId, emoji });
  }

  // Pinning always means "show me this person" — if grid view was forced
  // (footer grid button), a pin should win over it rather than being
  // silently ignored because focusedUserId still resolves to null.
  function togglePin(id: string | null | undefined) {
    if (!id) return;
    setPinnedUserId((current) => {
      const next = current === id ? null : id;
      if (next) setGridViewForced(false);
      return next;
    });
  }

  useEffect(() => () => { if (entered) cleanup(); }, [entered, cleanup]);
  // Tell the rest of the app which meeting this tab is in (Join buttons elsewhere grey out).
  useEffect(() => {
    if (!entered || !meetingId) return;
    setActiveMeeting({ id: meetingId, code: meeting?.code ?? null, title: meeting?.title ?? null });
    return () => { if (getActiveMeeting()?.id === meetingId) setActiveMeeting(null); };
  }, [entered, meetingId, meeting?.code, meeting?.title]);

  // Closing the tab (Ctrl+W) or navigating the page away: say goodbye right
  // now — the socket "meeting:leave" makes everyone drop the tile at once and
  // the LiveKit disconnect sends its leave signal. Without this the server
  // only noticed after the reconnect grace window (~30s). Backgrounding or
  // minimizing the tab doesn't fire pagehide, so that keeps the call going.
  const leaveOnPageHide = useRef<(() => void) | null>(null);
  leaveOnPageHide.current = entered ? () => {
    currentSocket()?.emit("meeting:leave", { meetingId });
    void liveKit.current?.disconnect();
  } : null;
  useEffect(() => {
    const onPageHide = () => leaveOnPageHide.current?.();
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

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

  /**
   * Lazily creates (or reuses) a Web Audio analyser for one participant's
   * audio track — peer-to-peer calls only (LiveKit reports speakers itself).
   * All analysers share one AudioContext: each context is its own audio
   * thread, and one per person competed with playback and crackled.
   */
  const sharedAudioContext = useRef<AudioContext | null>(null);
  const ensureAudioAnalyser = useCallback((id: string, stream: MediaStream) => {
    const existing = audioAnalysers.current.get(id);
    if (existing) return existing;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return null;
    try {
      const ctx = (sharedAudioContext.current ??= new AudioContext());
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
    if (!entered || mediaProvider.current === "livekit") return;
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
    audioAnalysers.current.clear();
    void sharedAudioContext.current?.close().catch(() => {});
    sharedAudioContext.current = null;
  }, []);

  // One entry per person in the room; `stream` stays undefined until (or
  // unless) their media arrives, which is exactly how a camera-off
  // participant should render — an avatar tile, not an absence.
  const remoteEntries = useMemo(
    () => Object.keys(roster).map((id) => [id, remoteStreams[id]] as const),
    [roster, remoteStreams],
  );
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

  // Main stage: a screen share, else whoever is pinned, else the person who
  // spoke last. Your own voice never pulls you there (Google Meet does the
  // same). The speaker is "sticky" — silence keeps the last one on stage —
  // and a new speaker only takes over after the current one has had the
  // stage for 1.5s, so short interjections don't make the layout jump.
  const [stageSpeakerId, setStageSpeakerId] = useState<string | null>(null);
  const stageSince = useRef(0);
  useEffect(() => {
    if (!activeSpeakerId || activeSpeakerId === selfId || activeSpeakerId === stageSpeakerId) return;
    const wait = Math.max(0, stageSince.current + 1500 - Date.now());
    const timer = window.setTimeout(() => { stageSince.current = Date.now(); setStageSpeakerId(activeSpeakerId); }, wait);
    return () => window.clearTimeout(timer);
  }, [activeSpeakerId, selfId, stageSpeakerId]);
  const remoteIds = remoteEntries.map(([id]) => id);
  const speakerFocusId = remoteIds.length
    ? (stageSpeakerId && remoteIds.includes(stageSpeakerId) ? stageSpeakerId : remoteIds[0])
    : null;
  const focusedUserId = gridViewForced ? null : (screenSharingUserId || pinnedUserId || speakerFocusId || null);

  /**
   * What the header actually reports. The socket being up only means
   * signalling works; if every peer connection is `failed` (no route across
   * the NATs, typically a missing or unreachable TURN relay) there is no
   * media at all, and saying "connection stable" left the user with a blank
   * grid and no explanation. Media trouble outranks a healthy socket here.
   */
  const callState = useMemo<"connecting" | "connected" | "offline" | "failed">(() => {
    if (connectionState === "offline") return "offline";
    const states = Object.values(peerStates);
    if (!states.length) return connectionState;
    if (states.some((state) => state === "failed")) return "failed";
    if (states.every((state) => state === "connected")) return "connected";
    return "connecting";
  }, [connectionState, peerStates]);

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

  // Receive each camera at the size it is shown: the main stage in full, the
  // filmstrip as thumbnails, the grid by how many tiles share the screen.
  const remoteTileIds = allTiles.filter((tile) => !tile.isSelf).map((tile) => tile.id).join(",");
  const focusedId = focusedTile?.id ?? null;
  useEffect(() => {
    const session = liveKit.current;
    if (!session || !remoteTileIds) return;
    const ids = remoteTileIds.split(",");
    for (const id of ids) {
      const quality = focusedId
        ? (id === focusedId ? "high" : "low")
        : ids.length <= 1 ? "high" : ids.length <= 3 ? "medium" : "low";
      session.setRemoteVideoQuality(id, quality);
    }
  }, [remoteTileIds, focusedId, callState]);

  // ── Standalone persistent instance: full page vs. floating widget vs. idle ──
  // directMode is unaffected (always "full", exactly as before). The
  // standalone instance (mounted once at the app root) is "full" while on
  // its own /meetings/:id route, becomes a floating widget when the user
  // navigates elsewhere while still in the call, and renders nothing when
  // there's no active call and no matching route. (isFullMode is computed up
  // top, next to routeMatch, because the lobby preview effect needs it too.)
  const isWidgetMode = !isFullMode && entered;

  // ── Meet chrome state (toolbar menus, panels, cards) ──────────────────────
  const moreRef = useRef<HTMLButtonElement>(null);
  const reactRef = useRef<HTMLButtonElement>(null);
  const micMenuRef = useRef<HTMLButtonElement>(null);
  const camMenuRef = useRef<HTMLButtonElement>(null);
  const [deviceMenu, setDeviceMenu] = useState<"audio" | "video" | null>(null);
  const [chatUnread, setChatUnread] = useState(0);
  const readyKey = `optima:meet-ready:${meetingId}`;
  const [readyDismissed, setReadyDismissed] = useState(() => {
    try { return sessionStorage.getItem(readyKey) === "1"; } catch { return false; }
  });
  const dismissReady = useCallback(() => {
    setReadyDismissed(true);
    try { sessionStorage.setItem(readyKey, "1"); } catch { /* storage disabled */ }
  }, [readyKey]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!entered) return;
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, [entered]);
  // Escape closes the side panel — unless a menu inside it already used
  // that Escape (MeetPopover marks it with preventDefault).
  useEffect(() => {
    if (!sidePanel && !meetingChatOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setSidePanel(null);
      setMeetingChatOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidePanel, meetingChatOpen]);
  useEffect(() => {
    if (deviceMenu) void navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => undefined);
  }, [deviceMenu]);

  // ── Host controls ─────────────────────────────────────────────────────────
  const permissions = meeting?.permissions ?? ALL_ALLOWED;
  const isModerator = canManageWaitingRoom;
  const allowed = (key: keyof MeetingPermissions) => isModerator || permissions[key] !== false;
  // When the host turns something off, it goes off here too (LiveKit also
  // unpublishes it server-side; on the mesh this is the only enforcement).
  useEffect(() => {
    if (!entered || isModerator) return;
    if (!permissions.microphone && microphone) void toggleTrack("audio");
    if (!permissions.video && camera) void toggleTrack("video");
    if (!permissions.screenShare && screenSharing) void stopScreenShare();
    if (!permissions.reactions) setReactionOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered, isModerator, permissions.microphone, permissions.video, permissions.screenShare, permissions.reactions]);

  async function setPermission(key: keyof MeetingPermissions, value: boolean) {
    if (!meeting) return;
    const field = ({ screenShare: "allowScreenShare", reactions: "allowReactions", microphone: "allowMicrophone", video: "allowVideo", chat: "allowChat" } as const)[key];
    const previous = meeting.permissions;
    setMeeting((current) => current ? { ...current, permissions: { ...(current.permissions ?? ALL_ALLOWED), [key]: value } } : current);
    try {
      await api.meetings.update(meeting.id, { [field]: value });
    } catch (error) {
      setMeeting((current) => current ? { ...current, permissions: previous } : current);
      show(error instanceof Error ? error.message : t("meetingRoom.settingsSaveFailed"), "error");
    }
  }

  // /meet/<code> while the code is being looked up (or wasn't found).
  if (isFullMode && !meetingId && !directMode) {
    return codeNotFound
      ? <div className="meeting-room-loading meeting-standalone-overlay"><p><strong>{t("meetingRoom.meetingNotFound")}</strong></p><Button onClick={() => navigate("/meetings")}>{t("meetingRoom.back")}</Button></div>
      : <div className="meeting-room-loading meeting-standalone-overlay"><LoaderCircle className="spin" size={26} /><p>{t("meetingRoom.preparing")}</p></div>;
  }
  if (!meetingId && !isWidgetMode) return null;

  if (isWidgetMode) {
    return (
      <FloatingMeetingWidget
        tile={focusedTile
          ?? allTiles.find((tile) => !tile.isSelf && tile.id === stageSpeakerId)
          ?? allTiles.find((tile) => !tile.isSelf && tile.video && tile.stream)
          ?? allTiles.find((tile) => !tile.isSelf)
          ?? allTiles[0]
          ?? null}
        remotes={allTiles.filter((tile) => !tile.isSelf)}
        title={meeting?.title || ""}
        microphone={microphone}
        camera={camera}
        onToggleMic={() => void toggleTrack("audio")}
        onToggleCamera={() => void toggleTrack("video")}
        onExpand={() => navigate(meeting?.code ? `/meet/${meeting.code}` : `/meetings/${meetingId}`)}
        onLeave={leave}
      />
    );
  }

  if (!isFullMode) return null;

  const overlayClass = directMode ? "" : "meeting-standalone-overlay";
  if (directMode) {
    const peer = allTiles.find((tile) => !tile.isSelf);
    const profile = peer?.avatar || directPeer;
    const name = profile ? `${profile.firstName} ${profile.lastName || ""}`.trim() : t("chat.userFallback");
    const hasVideo = directKind === "video" || camera || screenSharing || Boolean(peer?.video && peer?.stream?.getVideoTracks().length);
    const status = accessDenied || (!loading && !meeting ? t("meetingRoom.callNotFound") : callState === "failed" ? t("meetingRoom.mediaFailed") : callState === "offline" ? t("meetingRoom.reconnecting") : entered && peer ? t("meetingRoom.connectionStable") : t("chat.connectingText"));
    return <DirectCallSurface name={name} peer={profile} remoteVideo={Boolean(peer?.video && peer?.stream?.getVideoTracks().length)} video={hasVideo} status={status} ready={entered && !loading && !accessDenied} microphone={microphone} camera={camera} screenSharing={screenSharing} securityCode={securityCode}
      remote={<>{peer?.stream && <RemoteAudio stream={peer.stream} />}<VideoTile stream={peer?.stream} muted label={name} avatar={profile} microphoneOn={peer?.mic ?? true} videoOn={peer?.video ?? false} pipEnabled /></>}
      local={camera || screenSharing ? <VideoTile stream={screenStream || localStream} muted mirrored={!screenSharing} label={t("meetingRoom.you")} avatar={user || undefined} microphoneOn={microphone} videoOn={camera || screenSharing} /> : null}
      onMic={() => void toggleTrack("audio")} onCamera={() => void toggleTrack("video")} onScreen={() => void toggleScreen()} onLeave={leave} />;
  }
  if (loading) return <div className={`meeting-room-loading ${overlayClass}`}><LoaderCircle className="spin" size={26} /><p>{t("meetingRoom.preparing")}</p></div>;
  if (accessDenied) return <div className={`meeting-room-loading ${overlayClass}`}><ShieldX size={26} /><p><strong>{t("meetingRoom.accessDeniedTitle")}</strong></p><p>{accessDenied}</p><Button onClick={() => directMode ? onDirectClose?.() : navigate("/meetings")}>{t("meetingRoom.back")}</Button></div>;
  if (!meeting) return <div className={`meeting-room-loading ${overlayClass}`}><p>{directMode ? t("meetingRoom.callNotFound") : t("meetingRoom.meetingNotFound")}</p><Button onClick={() => directMode ? onDirectClose?.() : navigate("/meetings")}>{t("meetingRoom.back")}</Button></div>;

  const tag = localeTag[locale] || "uz-UZ";
  const personName = (person?: Pick<User, "firstName" | "lastName"> | null) =>
    person ? `${person.firstName || ""} ${person.lastName || ""}`.trim() || t("meetingRoom.participantFallback") : t("meetingRoom.participantFallback");
  const backToMeetings = () => directMode ? onDirectClose?.() : navigate("/meetings");
  const audioInputs = devices.filter((device) => device.kind === "audioinput");
  // Who is in the call besides us (the host's own participant row exists from creation).
  const othersInCall = meeting?.participants
    ? meeting.participants.filter((participant) => !participant.leftAt && participant.userId !== user?.id).length
    : meeting?.participantCount ?? 0;
  const videoInputs = devices.filter((device) => device.kind === "videoinput");

  if (!entered) return (
    <div className={`gm-lobby ${overlayClass}`}>
      <header className="gm-lobby-bar">
        <button type="button" className="gm-icon-btn gm-icon-btn-light" onClick={backToMeetings} aria-label={t("meetingRoom.back")}><ArrowLeft size={22} /></button>
        <span className="gm-lobby-brand"><span className="meet-logo" aria-hidden="true"><Video size={18} /></span>{t("meet.brand")}</span>
      </header>
      <main className="gm-lobby-main">
        <section className="gm-lobby-preview-col">
          <div className="gm-lobby-preview">
            <VideoTile stream={previewStream} muted mirrored label={personName(user)} avatar={user || undefined} microphoneOn={microphone} videoOn={camera} />
            {!camera && <span className="gm-preview-off">{t("meet.noCamera")}</span>}
            <div className="gm-preview-controls">
              <button type="button" className={`gm-round ${microphone ? "" : "off"}`} onClick={() => setMicrophone((value) => !value)} aria-pressed={!microphone} aria-label={microphone ? t("meetingRoom.turnOffMicAria") : t("meetingRoom.turnOnMicAria")} title={microphone ? t("meetingRoom.turnOffMicAria") : t("meetingRoom.turnOnMicAria")}>{microphone ? <Mic size={22} /> : <MicOff size={22} />}</button>
              <button type="button" className={`gm-round ${camera ? "" : "off"}`} onClick={() => setCamera((value) => !value)} aria-pressed={!camera} aria-label={camera ? t("meetingRoom.turnOffCameraAria") : t("meetingRoom.turnOnCameraAria")} title={camera ? t("meetingRoom.turnOffCameraAria") : t("meetingRoom.turnOnCameraAria")}>{camera ? <Video size={22} /> : <CameraOff size={22} />}</button>
            </div>
          </div>
          {permissionError && <div className="gm-notice" role="alert"><CameraOff size={18} /><span>{permissionError}</span></div>}
          <div className="gm-device-row">
            <label><Mic size={18} aria-hidden="true" /><span className="sr-only">{t("meetingRoom.microphoneLabel")}</span>
              <select value={microphoneDevice} onChange={(event) => setMicrophoneDevice(event.target.value)} aria-label={t("meetingRoom.microphoneLabel")}>
                <option value="">{t("meetingRoom.defaultMicrophone")}</option>
                {audioInputs.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || t("meetingRoom.microphoneFallback")}</option>)}
              </select>
            </label>
            <label><Camera size={18} aria-hidden="true" /><span className="sr-only">{t("meetingRoom.cameraLabel")}</span>
              <select value={cameraDevice} onChange={(event) => setCameraDevice(event.target.value)} aria-label={t("meetingRoom.cameraLabel")}>
                <option value="">{t("meetingRoom.defaultCamera")}</option>
                {videoInputs.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || t("meetingRoom.cameraFallback")}</option>)}
              </select>
            </label>
          </div>
        </section>
        <section className="gm-lobby-join">
          <h1>{t("meet.readyTitle")}</h1>
          <p className="gm-lobby-title">{meeting.title}</p>
          <p>{othersInCall > 0 ? t("meet.othersHere", { count: othersInCall }) : t("meet.nobodyHere")}</p>
          {requestState === "pending" ? (
            <div className="gm-request-state"><Hourglass size={18} className="spin-slow" /><div><strong>{t("meetingRoom.requestPendingTitle")}</strong><small>{t("meetingRoom.requestPendingDesc")}</small></div><button type="button" className="gm-text-btn" onClick={() => void cancelJoinRequest()}>{t("meetingRoom.cancelRequestButton")}</button></div>
          ) : requestState === "rejected" ? (
            <div className="gm-request-state rejected"><ShieldX size={18} /><div><strong>{t("meetingRoom.requestRejectedTitle")}</strong><small>{t("meetingRoom.requestRejectedDesc")}</small></div></div>
          ) : meeting.access && !meeting.access.canJoin && meeting.access.canRequest ? (
            <button type="button" className="gm-join-btn" disabled={requestState === "requesting"} onClick={() => void sendJoinRequest()}>{requestState === "requesting" && <LoaderCircle className="spin" size={18} />}{t("meet.askToJoin")}</button>
          ) : (
            <button type="button" className="gm-join-btn" disabled={joining} onClick={() => void enterMeeting()}>{joining && <LoaderCircle className="spin" size={18} />}{t("meet.joinNow")}</button>
          )}
          <button type="button" className="gm-text-btn" onClick={() => void shareMeetingLink()}><Link2 size={18} /> {t("meetingRoom.shareLinkButton")}</button>
        </section>
      </main>
      {permissionPrompt && (
        <div className="gm-allow-overlay" role="dialog" aria-modal="true" aria-labelledby="gm-allow-title">
          <div className="gm-allow-card"><AllowDevicesIllustration /><h2 id="gm-allow-title">{t("meet.allowTitle")}</h2><p>{t("meet.allowDesc")}</p></div>
        </div>
      )}
    </div>
  );

  const isHost = meeting.hostId === user?.id;
  const timeLabel = clock(now, locale);
  const showReady = isHost && remoteEntries.length === 0 && !readyDismissed;
  const firstRequest = canManageWaitingRoom && sidePanel !== "participants" ? waitingRequests[0] : undefined;
  const participantCount = remoteEntries.length + 1;
  const panelOpen = Boolean(sidePanel) || meetingChatOpen;
  const presenterName = screenSharingUserId && screenSharingUserId !== selfId ? personName(users.get(screenSharingUserId)) : null;
  const link = `${window.location.origin}/meet/${meeting.code}`;
  const copyLink = () => { void navigator.clipboard.writeText(link).then(() => show(t("meet.copied")), () => show(t("meetings.shareFailed"), "error")); };

  const moreItems: MeetMenuItem[] = [
    { key: "present", mobileOnly: true, disabled: !screenSharing && !allowed("screenShare"), label: screenSharing ? t("meet.stopPresenting") : t("meet.present"), icon: <MonitorUp size={20} />, onSelect: () => void toggleScreen() },
    { key: "react", mobileOnly: true, disabled: !allowed("reactions"), label: t("meet.reactions"), icon: <Smile size={20} />, onSelect: () => setReactionOpen(true) },
    { key: "hand", mobileOnly: true, label: handRaised ? t("meetingRoom.lowerHandAria") : t("meetingRoom.raiseHandAria"), icon: <Hand size={20} />, onSelect: toggleHand },
    { key: "people", mobileOnly: true, label: `${t("meet.people")} (${participantCount})`, icon: <UsersRound size={20} />, onSelect: () => togglePanel("participants") },
    { key: "chat", mobileOnly: true, label: chatUnread ? `${t("meet.chat")} (${chatUnread})` : t("meet.chat"), icon: <MessageSquareText size={20} />, onSelect: () => togglePanel("chat") },
    ...(isHost ? [{ key: "host", mobileOnly: true, label: t("meet.hostControls"), icon: <ShieldCheck size={20} />, onSelect: () => togglePanel("settings") }] : []),
    { key: "details", label: t("meet.details"), icon: <Info size={20} />, onSelect: () => togglePanel("info") },
    { key: "layout", label: gridViewForced ? t("meet.layoutAuto") : t("meet.layoutGrid"), icon: <LayoutGrid size={20} />, onSelect: () => setGridViewForced((value) => !value) },
    { key: "link", label: t("meet.copyLink"), icon: <Link2 size={20} />, onSelect: copyLink },
    { key: "minimize", label: t("meet.minimize"), icon: <Minus size={20} />, onSelect: () => navigate("/chat") },
    ...(isHost ? [{ key: "end", label: t("meet.endForAll"), icon: <PhoneOff size={20} />, danger: true, onSelect: () => void endMeetingForAll() }] : []),
  ];

  const tileFor = (tile: MeetingTile, extra: { speaking?: boolean } = {}) => (
    <VideoTile key={tile.id} stream={tile.stream} muted mirrored={tile.isSelf && !screenSharing} label={tile.isSelf ? (screenSharing ? t("meetingRoom.youSharingScreen") : t("meet.you")) : tile.label} avatar={tile.avatar} microphoneOn={tile.mic} videoOn={tile.video} pinned={pinnedUserId === tile.id} speaking={extra.speaking ?? tile.id === activeSpeakerId} handRaised={raisedHands.has(tile.id)} pipEnabled={!tile.isSelf} onPin={() => togglePin(tile.id)} />
  );

  const panelTitle = sidePanel === "participants" ? t("meet.people") : sidePanel === "settings" ? t("meet.hostControls") : sidePanel === "waiting" ? t("meet.waitingSection") : t("meet.details");

  return (
    <div className={`gm-room ${overlayClass} ${panelOpen ? "gm-panel-open" : ""} ${gridViewForced ? "grid-forced" : ""}`}>
      {/* Everyone's audio, in elements that never move: a tile changing place
          (speaker to the stage, pin, screen share) re-creates its <video>,
          and when that element carried the sound the audio dropped each time. */}
      <div className="gm-audio" hidden>{allTiles.filter((tile) => !tile.isSelf && tile.stream).map((tile) => <RemoteAudio key={tile.id} stream={tile.stream!} />)}</div>
      <header className="gm-top">
        <span className="gm-clock">{timeLabel}</span>
        <span className="gm-sep" aria-hidden="true" />
        <button type="button" className="gm-title" onClick={() => togglePanel("info")} aria-expanded={sidePanel === "info"} title={t("meet.details")}><span>{meeting.title}</span><Info size={18} /></button>
        {meeting.locked && <span className="gm-chip"><Lock size={14} /> {t("meetingRoom.lockedBadge")}</span>}
        {(callState === "offline" || callState === "failed") && <span className="gm-chip gm-chip-warn" role="status">{callState === "offline" ? t("meetingRoom.reconnecting") : t("meetingRoom.mediaFailed")}</span>}
        {callState === "connecting" && remoteEntries.length > 0 && <span className="gm-chip" role="status"><LoaderCircle className="spin" size={14} /> {t("meetingRoom.connecting")}</span>}
      </header>

      {(screenSharing || presenterName) && <div className="gm-presenting" role="status"><MonitorUp size={18} /> {screenSharing ? t("meet.youPresenting") : t("meet.presenting", { name: presenterName ?? "" })}{screenSharing && <button type="button" onClick={() => void stopScreenShare()}>{t("meet.stopPresenting")}</button>}</div>}

      <div className="gm-body">
        {focusedTile ? (
          <main className={`gm-stage gm-stage-focus ${allTiles.length > 1 ? "" : "gm-stage-solo"}`}>
            <div className="gm-stage-main">{tileFor(focusedTile, { speaking: false })}</div>
            {allTiles.length > 1 && <div className="gm-filmstrip">{allTiles.filter((tile) => tile.id !== focusedTile.id).map((tile) => tileFor(tile))}</div>}
          </main>
        ) : (
          <main className={`gm-stage gm-grid gm-grid-${Math.min(allTiles.length, 9)}`}>{allTiles.map((tile) => tileFor(tile))}</main>
        )}

        {sidePanel && (
          <aside className="gm-panel" aria-label={panelTitle}>
            <header><h2>{panelTitle}</h2><button type="button" className="gm-icon-btn gm-icon-btn-light" onClick={() => setSidePanel(null)} aria-label={t("meetingRoom.closePanelAria")}><X size={22} /></button></header>
            <div className="gm-panel-body">
              {sidePanel === "participants" ? <>
                {isHost && <button type="button" className="gm-pill-btn" onClick={() => togglePanel("settings")}><UserPlus size={18} /> {t("meet.addOthers")}</button>}
                {canManageWaitingRoom && waitingRequests.length > 0 && <section className="gm-people-section">
                  <h3>{t("meet.waitingSection")} <span>{waitingRequests.length}</span></h3>
                  {waitingRequests.length > 1 && <div className="gm-row-actions"><button type="button" className="gm-text-btn" onClick={() => void reviewAllRequests("reject")}>{t("meetingRoom.rejectAll")}</button><button type="button" className="gm-text-btn strong" onClick={() => void reviewAllRequests("approve")}>{t("meetingRoom.acceptAll")}</button></div>}
                  {waitingRequests.map((request) => (
                    <div className="gm-person" key={request.id}>
                      <Avatar firstName={request.firstName} lastName={request.lastName} url={request.avatarUrl} size="sm" />
                      <span className="gm-person-name"><strong>{`${request.firstName || ""} ${request.lastName || ""}`.trim() || t("meetingRoom.participantFallback")}</strong></span>
                      <button type="button" className="gm-text-btn" disabled={waitingBusy === request.id} onClick={() => void reviewRequest(request, "reject")}>{t("meet.deny")}</button>
                      <button type="button" className="gm-text-btn strong" disabled={waitingBusy === request.id} onClick={() => void reviewRequest(request, "approve")}>{waitingBusy === request.id ? <LoaderCircle className="spin" size={16} /> : t("meet.admit")}</button>
                    </div>
                  ))}
                </section>}
                <section className="gm-people-section">
                  <h3>{t("meet.inCall")} <span>{participantCount}</span></h3>
                  <div className="gm-person"><Avatar firstName={user?.firstName} lastName={user?.lastName} url={user?.avatarUrl} size="sm" /><span className="gm-person-name"><strong>{personName(user)} ({t("meet.you")})</strong><small>{isHost ? t("meetingRoom.hostLabel") : t("meetingRoom.participantLabel")}</small></span>{handRaised && <Hand size={18} />}{microphone ? <Mic size={18} /> : <MicOff size={18} className="gm-muted-icon" />}</div>
                  {remoteEntries.map(([id]) => { const remote = users.get(id); const media = remoteMedia[id]; return (
                    <div className="gm-person" key={id}><Avatar firstName={remote?.firstName} lastName={remote?.lastName} url={remote?.avatarUrl} size="sm" /><span className="gm-person-name"><strong>{personName(remote)}</strong><small>{id === meeting.hostId ? t("meetingRoom.hostLabel") : media?.screen ? t("meetingRoom.sharingScreenLabel") : t("meetingRoom.participantLabel")}</small></span>{raisedHands.has(id) && <Hand size={18} />}{media?.audio === false ? <MicOff size={18} className="gm-muted-icon" /> : <Mic size={18} />}</div>
                  ); })}
                </section>
              </> : sidePanel === "settings" ? <>
                <p className="gm-panel-intro">{t("meet.hostIntro")}</p>
                <section className="gm-host-section">
                  <h3>{t("meet.moderationTitle")}</h3>
                  <HostSwitch label={t("meet.lockTitle")} hint={t("meet.lockHint")} checked={Boolean(meeting.locked)} disabled={lockBusy} onChange={() => void toggleLock()} />
                  <h4>{t("meet.letParticipants")}</h4>
                  <HostSwitch label={t("meet.allowScreenShare")} checked={permissions.screenShare} onChange={(value) => void setPermission("screenShare", value)} />
                  <HostSwitch label={t("meet.allowReactions")} checked={permissions.reactions} onChange={(value) => void setPermission("reactions", value)} />
                  <HostSwitch label={t("meet.allowMicrophone")} hint={t("meet.allowMicrophoneHint")} checked={permissions.microphone} onChange={(value) => void setPermission("microphone", value)} />
                  <HostSwitch label={t("meet.allowVideo")} hint={t("meet.allowVideoHint")} checked={permissions.video} onChange={(value) => void setPermission("video", value)} />
                </section>
                <section className="gm-host-section">
                  <h3>{t("meet.chatModeration")}</h3>
                  <HostSwitch label={t("meet.allowChat")} hint={t("meet.allowChatHint")} checked={permissions.chat} onChange={(value) => void setPermission("chat", value)} />
                </section>
                <section className="gm-host-section">
                  <h3>{t("meet.accessTitle")}</h3>
                  <label className="gm-field">{t("meetings.visibilityLabel")}
                    <select value={settingsVisibility} onChange={(event) => setSettingsVisibility(event.target.value as MeetingVisibility)}>
                      {([...(meeting?.scope === "group_only" ? ["group_only"] : []), "public", "private", "invite_only"] as MeetingVisibility[]).map((option) => <option key={option} value={option}>{visibilityLabel(option)}</option>)}
                    </select>
                  </label>
                  {settingsVisibility !== "invite_only" && settingsVisibility !== "private" && (
                    <label className="gm-field">{t("meetings.joinPolicyLabel")}
                      <select value={settingsJoinPolicy} onChange={(event) => setSettingsJoinPolicy(event.target.value as MeetingJoinPolicyValue)}>
                        <option value="auto">{t("meetings.joinPolicyAuto")}</option>
                        <option value="request_approval">{t("meetings.joinPolicyApproval")}</option>
                      </select>
                    </label>
                  )}
                  <button type="button" className="gm-pill-btn gm-pill-blue" disabled={settingsSaving} onClick={() => void saveMeetingSettings()}>{settingsSaving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} {t("meetingRoom.settingsSaveButton")}</button>
                </section>
                <section className="gm-host-section">
                  <h3>{t("meet.addOthers")}</h3>
                  <div className="gm-link-field"><span>{link.replace(/^https?:\/\//, "")}</span><button type="button" className="gm-icon-btn gm-icon-btn-light" onClick={copyLink} aria-label={t("meet.copyLink")} title={t("meet.copyLink")}><Copy size={18} /></button></div>
                  <label className="gm-field">{t("meetingRoom.inviteSectionTitle")}
                    <textarea rows={3} value={inviteEmailsInput} onChange={(event) => setInviteEmailsInput(event.target.value)} placeholder={t("meetingRoom.inviteEmailPlaceholder")} />
                  </label>
                  <p className="field-hint">{t("meetingRoom.inviteEmailHint")}</p>
                  <button type="button" className="gm-pill-btn gm-pill-blue" disabled={inviting} onClick={() => void sendInvite()}>{inviting ? <LoaderCircle className="spin" size={16} /> : <UserPlus size={16} />} {t("meetingRoom.inviteButton")}</button>
                </section>
              </> : <div className="gm-info">
                <h3>{meeting.title}</h3>
                {meeting.description && <p>{meeting.description}</p>}
                <div className="gm-link-field"><span>{link.replace(/^https?:\/\//, "")}</span><button type="button" className="gm-icon-btn gm-icon-btn-light" onClick={copyLink} aria-label={t("meet.copyLink")} title={t("meet.copyLink")}><Copy size={18} /></button></div>
                <p className="gm-info-row"><span>{t("meetingRoom.meetingCodeLabel")}</span><code>{meeting.code}</code></p>
                {securityCode && <p className="gm-info-row"><span><ShieldCheck size={16} /> {t("meetingRoom.compareKeyHint")}</span><b>{securityCode.join(" ")}</b></p>}
              </div>}
            </div>
          </aside>
        )}

        <MeetingChat messages={meetingChat.messages} connected={meetingChat.connected} selfId={user?.id || ""} nameFor={(id) => personName(id === user?.id ? user : users.get(id))} open={meetingChatOpen} onOpen={(open) => togglePanel(open ? "chat" : "chat")} onSend={meetingChat.send} showToggle={false} onUnreadChange={setChatUnread} disabledReason={allowed("chat") ? undefined : t("meet.chatDisabled")} />
      </div>

      {showReady && (
        <section className="gm-ready-card" aria-labelledby="gm-ready-title">
          <header><h2 id="gm-ready-title">{t("meet.readyCardTitle")}</h2><button type="button" className="gm-icon-btn gm-icon-btn-light" onClick={dismissReady} aria-label={t("common.close")}><X size={20} /></button></header>
          <button type="button" className="gm-pill-btn gm-pill-blue" onClick={() => { dismissReady(); togglePanel("settings"); }}><UserPlus size={18} /> {t("meet.addOthers")}</button>
          <p>{t("meet.shareHint")}</p>
          <div className="gm-link-field"><span>{link.replace(/^https?:\/\//, "")}</span><button type="button" className="gm-icon-btn gm-icon-btn-light" onClick={copyLink} aria-label={t("meet.copyLink")} title={t("meet.copyLink")}><Copy size={18} /></button></div>
          <p className="gm-ready-note"><ShieldCheck size={18} /> {meeting.joinPolicy === "request_approval" || meeting.scope === "private" || meeting.scope === "invite_only" ? t("meet.approvalNote") : t("meet.openNote")}</p>
          <small>{t("meet.joinedAs", { name: user?.email || personName(user) })}</small>
        </section>
      )}

      {firstRequest && (
        <section className="gm-request-toast" role="alert">
          <Avatar firstName={firstRequest.firstName} lastName={firstRequest.lastName} url={firstRequest.avatarUrl} size="sm" />
          <div><strong>{t("meet.wantsToJoin", { name: `${firstRequest.firstName || ""} ${firstRequest.lastName || ""}`.trim() || t("meetingRoom.participantFallback") })}</strong>{waitingRequests.length > 1 && <small>{t("meet.othersWaiting", { count: waitingRequests.length - 1 })}</small>}</div>
          <div className="gm-row-actions">
            {waitingRequests.length > 1 ? <button type="button" className="gm-text-btn" onClick={() => togglePanel("participants")}>{t("meet.viewAll")}</button> : <button type="button" className="gm-text-btn" disabled={waitingBusy === firstRequest.id} onClick={() => void reviewRequest(firstRequest, "reject")}>{t("meet.deny")}</button>}
            <button type="button" className="gm-text-btn strong" disabled={waitingBusy === firstRequest.id} onClick={() => void reviewRequest(firstRequest, "approve")}>{t("meet.admit")}</button>
          </div>
        </section>
      )}

      <div className="meeting-reaction-layer" aria-live="polite">{reactions.map((reaction) => <span key={reaction.id}>{reaction.emoji}</span>)}</div>

      <footer className="gm-bar">
        <div className="gm-bar-left" />
        <div className="gm-bar-center">
          <div className={`gm-split ${microphone ? "" : "off"}`}>
            <button ref={micMenuRef} type="button" className="gm-split-more gm-desktop-only" aria-haspopup="dialog" aria-expanded={deviceMenu === "audio"} aria-label={t("meet.micOptions")} title={t("meet.micOptions")} onClick={() => setDeviceMenu((open) => open === "audio" ? null : "audio")}><ChevronUp size={18} /></button>
            <button type="button" className="gm-ctl" disabled={!microphone && !allowed("microphone")} onClick={() => void toggleTrack("audio")} aria-pressed={!microphone} aria-label={microphone ? t("meetingRoom.turnOffMicAria") : t("meetingRoom.turnOnMicAria")} title={microphone ? t("meetingRoom.turnOffMicAria") : t("meetingRoom.turnOnMicAria")}>{microphone ? <Mic size={22} /> : <MicOff size={22} />}</button>
            <MeetPopover open={deviceMenu === "audio"} onClose={() => setDeviceMenu(null)} triggerRef={micMenuRef} label={t("meet.micOptions")} align="start" className="gm-device-popover">
              {(audioInputs.length ? audioInputs : [{ deviceId: "", label: t("meet.defaultDevice") } as MediaDeviceInfo]).map((device) => <button type="button" key={device.deviceId || "default"} aria-pressed={(microphoneDevice || "") === device.deviceId} onClick={() => void switchDevice("audio", device.deviceId)}>{(microphoneDevice || "") === device.deviceId && <Check size={18} />}<span>{device.label || t("meetingRoom.microphoneFallback")}</span></button>)}
            </MeetPopover>
          </div>
          <div className={`gm-split ${camera ? "" : "off"}`}>
            <button ref={camMenuRef} type="button" className="gm-split-more gm-desktop-only" aria-haspopup="dialog" aria-expanded={deviceMenu === "video"} aria-label={t("meet.cameraOptions")} title={t("meet.cameraOptions")} onClick={() => setDeviceMenu((open) => open === "video" ? null : "video")}><ChevronUp size={18} /></button>
            <button type="button" className="gm-ctl" disabled={!camera && !allowed("video")} onClick={() => void toggleTrack("video")} aria-pressed={!camera} aria-label={camera ? t("meetingRoom.turnOffCameraAria") : t("meetingRoom.turnOnCameraAria")} title={camera ? t("meetingRoom.turnOffCameraAria") : t("meetingRoom.turnOnCameraAria")}>{camera ? <Video size={22} /> : <CameraOff size={22} />}</button>
            <MeetPopover open={deviceMenu === "video"} onClose={() => setDeviceMenu(null)} triggerRef={camMenuRef} label={t("meet.cameraOptions")} align="start" className="gm-device-popover">
              {(videoInputs.length ? videoInputs : [{ deviceId: "", label: t("meet.defaultDevice") } as MediaDeviceInfo]).map((device) => <button type="button" key={device.deviceId || "default"} aria-pressed={(cameraDevice || "") === device.deviceId} onClick={() => void switchDevice("video", device.deviceId)}>{(cameraDevice || "") === device.deviceId && <Check size={18} />}<span>{device.label || t("meetingRoom.cameraFallback")}</span></button>)}
            </MeetPopover>
          </div>
          <button type="button" className={`gm-ctl gm-desktop-only ${screenSharing ? "active" : ""}`} disabled={!screenSharing && !allowed("screenShare")} onClick={() => void toggleScreen()} aria-pressed={screenSharing} aria-label={screenSharing ? t("meet.stopPresenting") : t("meet.present")} title={screenSharing ? t("meet.stopPresenting") : t("meet.present")}><MonitorUp size={22} /></button>
          <button ref={reactRef} type="button" className={`gm-ctl gm-desktop-only ${reactionOpen ? "active" : ""}`} disabled={!allowed("reactions")} aria-haspopup="dialog" aria-expanded={reactionOpen} onClick={() => setReactionOpen((value) => !value)} aria-label={t("meet.reactions")} title={t("meet.reactions")}><Smile size={22} /></button>
          <button type="button" className={`gm-ctl gm-desktop-only ${handRaised ? "active" : ""}`} onClick={toggleHand} aria-pressed={handRaised} aria-label={handRaised ? t("meetingRoom.lowerHandAria") : t("meetingRoom.raiseHandAria")} title={handRaised ? t("meetingRoom.lowerHandAria") : t("meetingRoom.raiseHandAria")}><Hand size={22} /></button>
          <span className="meet-anchor">
            <button ref={moreRef} type="button" data-shot="more" className={`gm-ctl gm-ctl-narrow ${moreMenuOpen ? "active" : ""}`} aria-haspopup="menu" aria-expanded={moreMenuOpen} onClick={() => setMoreMenuOpen((value) => !value)} aria-label={t("meet.moreOptions")} title={t("meet.moreOptions")}><MoreVertical size={22} />{chatUnread > 0 && <b className="gm-dot gm-mobile-only" aria-label={t("meet.unreadCount", { count: chatUnread })} />}</button>
            <MeetMenu open={moreMenuOpen} onClose={() => setMoreMenuOpen(false)} triggerRef={moreRef} items={moreItems} placement="top" align="center" label={t("meet.moreOptions")} className="gm-menu-dark" />
          </span>
          <button type="button" className="gm-ctl gm-hangup" onClick={leave} aria-label={t("meet.leave")} title={t("meet.leave")}><PhoneOff size={24} /></button>
          <MeetPopover open={reactionOpen} onClose={() => setReactionOpen(false)} triggerRef={reactRef} label={t("meet.reactions")} className="gm-reaction-bar">
            {MEETING_REACTIONS.map((emoji) => <button type="button" key={emoji} onClick={() => sendReaction(emoji)} aria-label={emoji}>{emoji}</button>)}
          </MeetPopover>
        </div>
        <div className="gm-bar-right gm-desktop-only">
          <button type="button" className={`gm-icon-btn ${sidePanel === "participants" ? "active" : ""}`} onClick={() => togglePanel("participants")} aria-expanded={sidePanel === "participants"} aria-label={t("meet.people")} title={t("meet.people")}><UsersRound size={22} /><span className="gm-count">{participantCount}</span>{canManageWaitingRoom && waitingRequests.length > 0 && <b className="gm-dot" />}<span className="gm-btn-label">{t("meet.people")}</span></button>
          <button type="button" data-shot="chat" className={`gm-icon-btn ${meetingChatOpen ? "active" : ""}`} onClick={() => togglePanel("chat")} aria-expanded={meetingChatOpen} aria-label={chatUnread ? `${t("meet.chat")} — ${t("meet.unreadCount", { count: chatUnread })}` : t("meet.chat")} title={t("meet.chat")}><MessageSquareText size={22} />{chatUnread > 0 && <b className="gm-dot" />}<span className="gm-btn-label">{t("meetingRoom.chatTitle")}</span></button>
          {isHost && <button type="button" className={`gm-icon-btn ${sidePanel === "settings" ? "active" : ""}`} onClick={() => togglePanel("settings")} aria-expanded={sidePanel === "settings"} aria-label={t("meet.hostControls")} title={t("meet.hostControls")}>{meeting.locked ? <Lock size={22} /> : <ShieldCheck size={22} />}<span className="gm-btn-label">{t("meet.hostControls")}</span></button>}
        </div>
      </footer>
    </div>
  );
}

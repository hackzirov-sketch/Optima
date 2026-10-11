import { Mic, MicOff, MonitorUp, PhoneOff, ShieldCheck, Video, VideoOff } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "../lib/i18n/i18n";
import { Avatar } from "./ui";

type Peer = { firstName?: string | null; lastName?: string | null; avatarUrl?: string | null };

/**
 * A 1:1 call, laid out like Telegram's call window: the other person large in
 * the middle (their video when they send it, otherwise a big avatar), name and
 * state under it, and a short row of labelled round buttons at the bottom —
 * screen, video, end, microphone.
 */
export function DirectCallSurface({ name, peer, video, status, ready, microphone, camera, screenSharing, securityCode, remote, local, remoteVideo = video, onMic, onCamera, onScreen, onLeave }: {
  name: string; peer?: Peer; video: boolean; status: string; ready: boolean;
  microphone: boolean; camera: boolean; screenSharing: boolean; securityCode: string[] | null;
  remote: ReactNode; local: ReactNode;
  /** The other side is sending video right now — show it instead of the avatar. */
  remoteVideo?: boolean;
  onMic: () => void; onCamera: () => void; onScreen: () => void; onLeave: () => void;
}) {
  const { t } = useI18n();
  const micLabel = t(microphone ? "meetingRoom.turnOffMicAria" : "meetingRoom.turnOnMicAria");
  const cameraLabel = t(camera ? "meetingRoom.turnOffCameraAria" : "meetingRoom.turnOnCameraAria");
  return <section className={`direct-call-surface tg-call ${video ? "is-video" : "is-audio"} ${remoteVideo ? "has-remote-video" : ""}`} aria-label={t(video ? "chat.videoCallAria" : "chat.audioCallAria")}>
    {securityCode && <header className="direct-surface-header"><span className="direct-surface-key" title={t("meetingRoom.compareKeyHint")}><ShieldCheck size={15} />{securityCode.map((emoji, index) => <b key={index}>{emoji}</b>)}</span></header>}
    {/* Kept mounted in audio calls too: it carries the other side's audio. */}
    <div className="direct-surface-stage"><div className="direct-surface-remote">{remote}</div>{video && local && <div className="direct-surface-self">{local}</div>}</div>
    <div className="direct-surface-identity">
      {!remoteVideo && <span className="tg-call-avatar"><Avatar firstName={peer?.firstName || name} lastName={peer?.lastName} url={peer?.avatarUrl} size="xl" /></span>}
      <h2>{name}</h2><p role="status">{status}</p>
    </div>
    <footer className="direct-surface-controls">
      <button type="button" disabled={!ready} className={screenSharing ? "is-on" : ""} onClick={onScreen} aria-pressed={screenSharing} aria-label={t("meetingRoom.shareScreenAria")} title={t("meetingRoom.shareScreenAria")}><span className="tg-call-ic"><MonitorUp size={21} /></span><small>{t("chat.callScreen")}</small></button>
      <button type="button" disabled={!ready} className={camera ? "is-on" : "is-off"} onClick={onCamera} aria-pressed={camera} aria-label={cameraLabel} title={cameraLabel}><span className="tg-call-ic">{camera ? <Video size={21} /> : <VideoOff size={21} />}</span><small>{t(camera ? "chat.callStopVideo" : "chat.callStartVideo")}</small></button>
      <button type="button" className="direct-surface-end" onClick={onLeave} aria-label={t("chat.cancelCallLabel")} title={t("chat.cancelCallLabel")}><span className="tg-call-ic"><PhoneOff size={22} /></span><small>{t("chat.callEnd")}</small></button>
      <button type="button" disabled={!ready} className={microphone ? "" : "is-off"} onClick={onMic} aria-pressed={microphone} aria-label={micLabel} title={micLabel}><span className="tg-call-ic">{microphone ? <Mic size={21} /> : <MicOff size={21} />}</span><small>{t(microphone ? "chat.callMute" : "chat.callUnmute")}</small></button>
    </footer>
  </section>;
}

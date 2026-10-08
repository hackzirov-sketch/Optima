import { Camera, CameraOff, Mic, MicOff, MonitorUp, Phone, PhoneOff, ShieldCheck, Video } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "../lib/i18n/i18n";

export function DirectCallSurface({ name, video, status, ready, microphone, camera, screenSharing, securityCode, remote, local, onMic, onCamera, onScreen, onLeave }: {
  name: string; video: boolean; status: string; ready: boolean;
  microphone: boolean; camera: boolean; screenSharing: boolean; securityCode: string[] | null;
  remote: ReactNode; local: ReactNode;
  onMic: () => void; onCamera: () => void; onScreen: () => void; onLeave: () => void;
}) {
  const { t } = useI18n();
  const micLabel = t(microphone ? "meetingRoom.turnOffMicAria" : "meetingRoom.turnOnMicAria");
  const cameraLabel = t(camera ? "meetingRoom.turnOffCameraAria" : "meetingRoom.turnOnCameraAria");
  return <section className={`direct-call-surface ${video ? "is-video" : "is-audio"}`} aria-label={t(video ? "chat.videoCallAria" : "chat.audioCallAria")}>
    <header className="direct-surface-header"><span>{video ? <Video size={18} /> : <Phone size={18} />}{t(video ? "chat.videoCallAria" : "chat.audioCallAria")}</span>
      {securityCode && <span className="direct-surface-key" title={t("meetingRoom.compareKeyHint")}><ShieldCheck size={16} />{securityCode.map((emoji, index) => <b key={index}>{emoji}</b>)}</span>}
    </header>
    <div className="direct-surface-stage"><div className="direct-surface-remote">{remote}</div>{video && local && <div className="direct-surface-self">{local}</div>}</div>
    <div className="direct-surface-identity"><h2>{name}</h2><p role="status">{status}</p></div>
    <footer className="direct-surface-controls">
      <button type="button" disabled={!ready} className={microphone ? "" : "is-off"} onClick={onMic} aria-pressed={microphone} aria-label={micLabel} title={micLabel}>{microphone ? <Mic size={23} /> : <MicOff size={23} />}</button>
      <button type="button" disabled={!ready} className={camera ? "" : "is-off"} onClick={onCamera} aria-pressed={camera} aria-label={cameraLabel} title={cameraLabel}>{camera ? <Camera size={23} /> : <CameraOff size={23} />}</button>
      <button type="button" disabled={!ready} className={screenSharing ? "is-on" : ""} onClick={onScreen} aria-pressed={screenSharing} aria-label={t("meetingRoom.shareScreenAria")} title={t("meetingRoom.shareScreenAria")}><MonitorUp size={23} /></button>
      <button type="button" className="direct-surface-end" onClick={onLeave} aria-label={t("chat.cancelCallLabel")} title={t("chat.cancelCallLabel")}><PhoneOff size={25} /></button>
    </footer>
  </section>;
}

import { Download, Mic2, Music2, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

function clock(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

export function AudioMessage({ src, fileName, voice = false }: { src: string; fileName: string; voice?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => () => audio.current?.pause(), []);

  async function toggle() {
    if (!audio.current) return;
    if (audio.current.paused) await audio.current.play();
    else audio.current.pause();
  }

  function cycleSpeed() {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    if (audio.current) audio.current.playbackRate = next;
    setSpeed(next);
  }

  return (
    <div className={`audio-message ${voice ? "voice-player" : "music-player"}`}>
      <audio ref={audio} src={src} preload="metadata" onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setCurrent(0); }} />
      <button className="audio-play" onClick={() => void toggle()} aria-label={playing ? "Pauza" : "Ijro etish"}>{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
      <span className="audio-kind">{voice ? <Mic2 size={17} /> : <Music2 size={17} />}</span>
      <span className="audio-main"><strong>{voice ? "Ovozli xabar" : fileName.replace(/\.[^.]+$/, "")}</strong><input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(current, duration || 1)} onChange={(event) => { if (audio.current) audio.current.currentTime = Number(event.target.value); }} aria-label="Audio pozitsiyasi" /><small>{clock(current)} / {clock(duration)}</small></span>
      {voice ? <button className="audio-speed" onClick={cycleSpeed} aria-label="Ijro tezligi">{speed}x</button> : <a className="audio-download" href={src} download={fileName} aria-label="Audioni yuklab olish"><Download size={17} /></a>}
    </div>
  );
}

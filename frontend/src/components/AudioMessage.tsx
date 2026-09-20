import { Download, Music2, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type KeyboardEvent } from "react";
import { useI18n } from "../lib/i18n/i18n";

const BAR_COUNT = 42;

function clock(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

async function extractPeaks(src: string, signal: AbortSignal): Promise<number[]> {
  const response = await fetch(src, { signal });
  if (!response.ok) throw new Error("Audio unavailable");
  const buffer = await response.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(buffer);
    const data = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(data.length / BAR_COUNT));
    const peaks: number[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      const start = i * blockSize;
      let max = 0;
      for (let j = 0; j < blockSize; j++) {
        const sample = Math.abs(data[start + j] || 0);
        if (sample > max) max = sample;
      }
      peaks.push(max);
    }
    const peakMax = Math.max(...peaks, 0.01);
    return peaks.map((value) => Math.max(0.12, value / peakMax));
  } finally {
    void ctx.close();
  }
}

export function AudioMessage({ src, fileName, voice = false }: { src: string; fileName: string; voice?: boolean }) {
  const { t } = useI18n();
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const player = audio.current;
    const pauseOther = (event: Event) => { if (event.target !== player) player?.pause(); };
    document.addEventListener("play", pauseOther, true);
    return () => { player?.pause(); document.removeEventListener("play", pauseOther, true); };
  }, []);

  useEffect(() => {
    if (!voice) return;
    let cancelled = false;
    const controller = new AbortController();
    setPeaks(null);
    extractPeaks(src, controller.signal)
      .then((result) => { if (!cancelled) setPeaks(result); })
      .catch(() => { if (!cancelled) setPeaks(Array.from({ length: BAR_COUNT }, () => 0.3)); });
    return () => { cancelled = true; controller.abort(); };
  }, [src, voice]);

  async function toggle() {
    if (!audio.current) return;
    try {
      if (failed) audio.current.load();
      setFailed(false);
      if (audio.current.paused) await audio.current.play();
      else audio.current.pause();
    } catch { setFailed(true); setPlaying(false); }
  }

  function cycleSpeed() {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    if (audio.current) audio.current.playbackRate = next;
    setSpeed(next);
  }

  function onWaveClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!audio.current || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.current.currentTime = ratio * duration;
  }

  function onWaveKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!audio.current || !duration) return;
    const next = event.key === "Home" ? 0 : event.key === "End" ? duration
      : event.key === "ArrowRight" || event.key === "ArrowUp" ? current + 5
      : event.key === "ArrowLeft" || event.key === "ArrowDown" ? current - 5 : null;
    if (next === null) return;
    event.preventDefault();
    audio.current.currentTime = Math.max(0, Math.min(duration, next));
  }

  const progress = duration ? current / duration : 0;
  const displayPeaks = peaks ?? Array.from({ length: BAR_COUNT }, () => 0.25);

  return (
    <div className={`audio-message ${voice ? "voice-player" : "music-player"}`}>
      <audio ref={audio} src={src} preload="metadata" onError={() => setFailed(true)} onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setCurrent(0); }} />
      <button type="button" className="audio-play" onClick={() => void toggle()} title={failed ? t("common.retry") : undefined} aria-label={failed ? t("common.retry") : playing ? t("chat.audio.pause") : t("chat.audio.play")}>{failed ? <RotateCcw size={18} /> : playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
      {voice ? (
        <>
          <div className="voice-wave" onClick={onWaveClick} onKeyDown={onWaveKey} role="slider" tabIndex={0} aria-label={t("chat.audio.positionAria")} aria-valuetext={`${clock(current)} / ${clock(duration)}`} aria-valuemin={0} aria-valuemax={Math.round(duration || 0)} aria-valuenow={Math.round(current)}>
            {displayPeaks.map((value, index) => (
              <span key={index} className={index / BAR_COUNT <= progress ? "played" : ""} style={{ height: `${Math.round(value * 100)}%` }} />
            ))}
          </div>
          <small className="voice-time">{clock(current)} / {clock(duration)}</small>
          <button type="button" className="audio-speed" onClick={cycleSpeed} aria-label={`${t("chat.audio.speedAria")}: ${speed}x`}>{speed}x</button>
        </>
      ) : (
        <>
          <span className="audio-kind"><Music2 size={17} /></span>
          <span className="audio-main"><strong>{fileName.replace(/\.[^.]+$/, "")}</strong><input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(current, duration || 1)} onChange={(event) => { if (audio.current) audio.current.currentTime = Number(event.target.value); }} aria-label={t("chat.audio.positionAria")} /><small>{clock(current)} / {clock(duration)}</small></span>
          <a className="audio-download" href={src} download={fileName} aria-label={t("chat.audio.downloadAria")}><Download size={17} /></a>
        </>
      )}
    </div>
  );
}

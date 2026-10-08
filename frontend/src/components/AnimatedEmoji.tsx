import { ImageOff } from "lucide-react";
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import type { DotLottie } from "@lottiefiles/dotlottie-react";
import wasmUrl from "@lottiefiles/dotlottie-web/dotlottie-player.wasm?url";
import { CUSTOM_EMOJI_ID_PATTERN, emojiAssetUrl, emojiImageSources, localEmojiAssetUrl } from "../lib/emojiAssets";

const DotLottieReact = lazy(async () => {
  const module = await import("@lottiefiles/dotlottie-react");
  module.setWasmUrl(wasmUrl);
  return { default: module.DotLottieReact };
});

class AnimationBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

function EmojiVisual({ id, className = "", label, animate }: {
  id: string; className?: string; label: string; animate: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [player, setPlayer] = useState<DotLottie | null>(null);
  const [animationSource, setAnimationSource] = useState(0);
  const [ready, setReady] = useState(false);
  const sources = emojiImageSources(id);
  const shouldAnimate = animate && visible && !reducedMotion && id.startsWith("a") && animationSource < 2;

  useEffect(() => { if (!shouldAnimate) setReady(false); }, [shouldAnimate]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!player) return;
    const rendered = () => setReady(true);
    const failed = () => { setReady(false); setAnimationSource(value => value + 1); };
    player.addEventListener("render", rendered);
    player.addEventListener("loadError", failed);
    player.addEventListener("renderError", failed);
    return () => {
      player.removeEventListener("render", rendered);
      player.removeEventListener("loadError", failed);
      player.removeEventListener("renderError", failed);
    };
  }, [player]);

  const playing = shouldAnimate && ready;
  return <span ref={ref} className={`emoji-visual ${className}`} role="img"
    aria-label={sourceIndex >= sources.length && !playing ? "Emoji yuklanmadi" : label || "Emoji"}>
    {sourceIndex < sources.length ? <img className="emoji-visual-preview" src={sources[sourceIndex]} alt=""
      loading="lazy" decoding="async" style={{ opacity: playing ? 0 : 1 }}
      onError={() => setSourceIndex(value => value + 1)} /> : !playing &&
      <span className="emoji-unavailable" title="Emoji yuklanmadi"><ImageOff aria-hidden="true" /></span>}
    {shouldAnimate && <span className="emoji-visual-animation" style={{ opacity: ready ? 1 : 0 }} aria-hidden="true">
      <AnimationBoundary><Suspense fallback={null}><DotLottieReact key={animationSource}
        src={animationSource === 0 ? emojiAssetUrl(id) : localEmojiAssetUrl(id)}
        dotLottieRefCallback={setPlayer} autoplay loop renderConfig={{ freezeOnOffscreen: true }} />
      </Suspense></AnimationBoundary>
    </span>}
  </span>;
}

export function AnimatedEmoji({ id, className, label = "Emoji", animate = true }: {
  id: string; className?: string; label?: string; animate?: boolean;
}) {
  if (!CUSTOM_EMOJI_ID_PATTERN.test(id)) return null;
  return <EmojiVisual key={id} id={id} className={className} label={label} animate={animate} />;
}

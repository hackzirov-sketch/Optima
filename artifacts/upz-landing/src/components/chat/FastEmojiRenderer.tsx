import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, CSSProperties, RefObject } from "react";
import { loadGeneratedEmojiById, type GeneratedEmoji } from "@/data/emojiData";

type EmojiVisualSize = "inline" | "message" | "reaction" | "picker" | number;
type EmojiMode = "static" | "animated" | "auto";
type LottieComponent = ComponentType<{
  animationData: unknown;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
  style?: CSSProperties;
  rendererSettings?: {
    preserveAspectRatio?: string;
    progressiveLoad?: boolean;
    hideOnTransparent?: boolean;
    clearCanvas?: boolean;
  };
  speed?: number;
  onComplete?: () => void;
}>;

const JSON_ANIMATION_PATTERN = /\.json$/i;
const ANIMATED_IMAGE_PATTERN = /\.(gif|webp|apng)$/i;
const activeAnimations = new Set<string>();

function resolveSize(size: EmojiVisualSize) {
  if (typeof size === "number") return size;
  if (size === "inline") return 22;
  if (size === "reaction") return 24;
  if (size === "picker") return 32;
  return 58;
}

function maxActiveAnimations() {
  if (typeof window === "undefined") return 6;
  return window.innerWidth < 768 ? 6 : 12;
}

function canStartAnimation(key: string) {
  activeAnimations.delete(key);
  if (activeAnimations.size >= maxActiveAnimations()) return false;
  activeAnimations.add(key);
  return true;
}

function stopAnimation(key: string) {
  activeAnimations.delete(key);
}

export async function getGeneratedEmoji(id?: string) {
  if (!id) return undefined;
  return loadGeneratedEmojiById(id);
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function useVisibilityObserver<T extends Element>(ref: RefObject<T | null>, rootMargin = "96px") {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { rootMargin });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, rootMargin]);
  return visible;
}

export function usePremiumEmojiAccess(isPremiumUser = false) {
  return isPremiumUser;
}

function useEmojiPlayback({
  emoji,
  canAnimate,
  visible,
  playOnMount,
}: {
  emoji?: GeneratedEmoji;
  canAnimate: boolean;
  visible: boolean;
  playOnMount: boolean;
}) {
  const keyRef = useRef(`${emoji?.id ?? "emoji"}-${Math.random().toString(36).slice(2)}`);
  const [playing, setPlaying] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const [animationData, setAnimationData] = useState<unknown>(null);
  const [Lottie, setLottie] = useState<LottieComponent | null>(null);
  const reducedMotion = useReducedMotion();

  const stop = () => {
    stopAnimation(keyRef.current);
    setPlaying(false);
    setAnimationData(null);
  };
  const stopRef = useRef(stop);
  stopRef.current = stop;

  const play = () => {
    if (!emoji?.animationSrc || !canAnimate || !visible || reducedMotion || document.visibilityState === "hidden") return;
    if (!canStartAnimation(keyRef.current)) return;
    setAnimationData(null);
    setPlayKey((current) => current + 1);
    setPlaying(true);
  };
  const playRef = useRef(play);
  playRef.current = play;

  useEffect(() => {
    if (!playing || !emoji?.animationSrc || !JSON_ANIMATION_PATTERN.test(emoji.animationSrc)) return;
    let cancelled = false;
    void Promise.all([
      import("lottie-react").then((module) => module.default as LottieComponent),
      fetch(emoji.animationSrc).then((response) => (response.ok ? response.json() : Promise.reject(new Error("emoji animation failed")))),
    ])
      .then(([component, data]) => {
        if (cancelled) return;
        setLottie(() => component);
        setAnimationData(data);
      })
      .catch(stop);
    return () => {
      cancelled = true;
    };
  }, [emoji?.animationSrc, playing]);

  useEffect(() => {
    if (!playing || !emoji?.animationSrc) return;
    const timeout = window.setTimeout(stop, 1260);
    return () => window.clearTimeout(timeout);
  }, [emoji?.animationSrc, playing]);

  useEffect(() => {
    if (playOnMount) playRef.current();
    return () => stopRef.current();
  }, [emoji?.id, playOnMount, visible]);

  useEffect(() => {
    if (!visible || document.visibilityState !== "visible") stop();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") stop();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [visible]);

  return { playing, playKey, animationData, Lottie, play, stop, reducedMotion };
}

export const FastEmojiRenderer = memo(function FastEmojiRenderer({
  emoji,
  emojiId,
  size = "inline",
  mode = "auto",
  isPremiumUser = false,
  playOnMount = false,
  playOnClick = true,
  loop = false,
  className = "",
  decorative = false,
}: {
  emoji?: GeneratedEmoji;
  emojiId?: string;
  size?: EmojiVisualSize;
  mode?: EmojiMode;
  isPremiumUser?: boolean;
  playOnMount?: boolean;
  playOnClick?: boolean;
  loop?: boolean;
  className?: string;
  decorative?: boolean;
}) {
  const [loadedEmoji, setLoadedEmoji] = useState<GeneratedEmoji | undefined>(emoji);
  useEffect(() => {
    if (emoji) {
      setLoadedEmoji(emoji);
      return;
    }
    if (!emojiId) return;
    let cancelled = false;
    void loadGeneratedEmojiById(emojiId).then((item) => {
      if (!cancelled) setLoadedEmoji(item);
    });
    return () => {
      cancelled = true;
    };
  }, [emoji, emojiId]);
  const resolved = emoji ?? loadedEmoji;
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useVisibilityObserver(ref);
  const pixelSize = resolveSize(size);
  const canUsePremium = usePremiumEmojiAccess(isPremiumUser);
  const canAnimate = Boolean(
    resolved?.animationSrc &&
      visible &&
      mode !== "static" &&
      (mode === "animated" || canUsePremium) &&
      (JSON_ANIMATION_PATTERN.test(resolved.animationSrc) || ANIMATED_IMAGE_PATTERN.test(resolved.animationSrc)),
  );
  const playback = useEmojiPlayback({ emoji: resolved, canAnimate, visible, playOnMount });
  const imageSrc = useMemo(() => {
    if (!resolved) return "";
    if (playback.playing && canAnimate && resolved.animationSrc && ANIMATED_IMAGE_PATTERN.test(resolved.animationSrc)) return resolved.animationSrc;
    return resolved.previewSrc;
  }, [canAnimate, playback.playing, resolved]);

  if (!resolved) return null;

  const showLottie = Boolean(playback.playing && playback.Lottie && playback.animationData && JSON_ANIMATION_PATTERN.test(resolved.animationSrc ?? ""));
  const Lottie = playback.Lottie;

  return (
    <span
      ref={ref}
      className={className || "relative inline-grid place-items-center overflow-hidden align-middle"}
      style={{ width: pixelSize, height: pixelSize, contain: "paint", isolation: "isolate" }}
      onClick={() => {
        if (playOnClick) playback.play();
      }}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : resolved.name}
      aria-hidden={decorative ? "true" : undefined}
    >
      <img
        src={imageSrc}
        alt=""
        width={pixelSize}
        height={pixelSize}
        loading="lazy"
        decoding="async"
        draggable={false}
        className={playback.playing && showLottie ? "h-full w-full object-contain opacity-0" : "h-full w-full object-contain"}
      />
      {showLottie && Lottie && (
        <span key={playback.playKey} className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
          <Lottie
            animationData={playback.animationData}
            loop={loop}
            autoplay
            speed={0.95}
            rendererSettings={{
              preserveAspectRatio: "xMidYMid meet",
              progressiveLoad: false,
              hideOnTransparent: true,
              clearCanvas: true,
            }}
            onComplete={playback.stop}
            className="h-full w-full"
            style={{ width: pixelSize, height: pixelSize }}
          />
        </span>
      )}
    </span>
  );
});

export const InlineEmoji = memo(function InlineEmoji(props: Omit<Parameters<typeof FastEmojiRenderer>[0], "size">) {
  return <FastEmojiRenderer {...props} size="inline" playOnMount />;
});

export const StandaloneEmojiMessage = memo(function StandaloneEmojiMessage(props: Omit<Parameters<typeof FastEmojiRenderer>[0], "size">) {
  return <FastEmojiRenderer {...props} size="message" playOnMount />;
});

export const ReactionEmoji = memo(function ReactionEmoji(props: Omit<Parameters<typeof FastEmojiRenderer>[0], "size">) {
  return <FastEmojiRenderer {...props} size="reaction" />;
});

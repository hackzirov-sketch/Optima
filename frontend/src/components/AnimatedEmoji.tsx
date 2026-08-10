import { lazy, Suspense, useEffect, useState } from "react";
import { CUSTOM_EMOJI_ID_PATTERN, emojiAssetUrl, emojiPreviewUrl } from "../lib/emojiAssets";

const DotLottieReact = lazy(async () => {
  const module = await import("@lottiefiles/dotlottie-react");
  return { default: module.DotLottieReact };
});

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

export function AnimatedEmoji({ id, className, label = "emoji" }: {
  id: string;
  className?: string;
  label?: string;
}) {
  const reducedMotion = useReducedMotion();
  if (!CUSTOM_EMOJI_ID_PATTERN.test(id)) return null;

  if (!id.startsWith("a") || reducedMotion) {
    return <img className={className} src={reducedMotion ? emojiPreviewUrl(id) : emojiAssetUrl(id)} alt={label}
                loading="lazy" decoding="async" />;
  }

  const fallback = <img className={className} src={emojiPreviewUrl(id)} alt={label} loading="lazy" decoding="async" />;
  return (
    <Suspense fallback={fallback}>
      <span className={className} role="img" aria-label={label}>
        <DotLottieReact src={emojiAssetUrl(id)} autoplay loop renderConfig={{ freezeOnOffscreen: true }} />
      </span>
    </Suspense>
  );
}

import { useEffect, useRef, useState } from "react";

type Star = { x: number; y: number; radius: number; baseAlpha: number; twinkleSpeed: number; twinklePhase: number; parallax: number };

export function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === "dark");

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.dataset.theme === "dark"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!dark) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let pointer = { x: 0, y: 0 };
    let frame = 0;
    let raf = 0;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.max(1, Math.round(width * dpr));
      canvas!.height = Math.max(1, Math.round(height * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(420, Math.round((width * height) / 2800));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.3 + 0.4,
        baseAlpha: Math.random() * 0.55 + 0.35,
        twinkleSpeed: Math.random() * 0.015 + 0.004,
        twinklePhase: Math.random() * Math.PI * 2,
        parallax: Math.random() * 10 + 2,
      }));
    }

    function onPointerMove(event: PointerEvent) {
      pointer.x = (event.clientX / width) * 2 - 1;
      pointer.y = (event.clientY / height) * 2 - 1;
    }

    function paint() {
      ctx!.clearRect(0, 0, width, height);
      for (const star of stars) {
        const twinkle = reduceMotion ? 1 : Math.sin(frame * star.twinkleSpeed + star.twinklePhase) * 0.5 + 0.5;
        const alpha = star.baseAlpha * (0.4 + twinkle * 0.6);
        const dx = pointer.x * star.parallax;
        const dy = pointer.y * star.parallax;
        ctx!.beginPath();
        ctx!.arc(star.x + dx, star.y + dy, star.radius, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(226,232,240,${alpha.toFixed(3)})`;
        ctx!.fill();
      }
    }

    function loop() {
      frame += 1;
      paint();
      raf = requestAnimationFrame(loop);
    }

    resize();
    window.addEventListener("resize", resize);
    if (!reduceMotion) {
      window.addEventListener("pointermove", onPointerMove);
      raf = requestAnimationFrame(loop);
    } else {
      paint();
    }

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [dark]);

  if (!dark) return null;
  return <canvas ref={canvasRef} className="starfield-canvas" aria-hidden="true" />;
}

import type { LiquidGlassConfig, LiquidGlassEngine } from "quick-liquid/core";

export type GlassKind = "navigation" | "chrome" | "panel" | "control";

const groups: Array<[GlassKind, string]> = [
  ["navigation", ".reference-dock"],
  ["panel", ".modal, .auth-card, .language-menu, .notification-panel, .group-menu, .status-menu, .message-menu-floating, .header-more-menu, .room-context-menu, .tg-new-menu, .telegram-emoji-picker, .meet-popover, .gm-menu-dark, .gm-panel, .meeting-chat-panel, .meeting-chat-notice, .lib2-detail"],
  ["chrome", ".topbar, .conversation-header, .composer:not(.ai-composer), .standalone-ai > header, .standalone-ai > form, .search-field, .youtube-search, .meet-join-field, .meet-home-bar, .gm-top, .gm-bar, .gm-preview-controls, .book-reader > header, .dashboard-page .metric-card, .dashboard-page .education-donut-card, .dashboard-page .education-bars-card, .dashboard-page .dashboard-grid > .panel, .dashboard-page .welcome-facts > span"],
  ["control", ".button, .icon-button, .send-button, .group-button, .reference-dock .dock-icon, .main-nav > a, .chat-catalog button, .meet-new, .meet-row-join, .meet-icon-button, .meet-day, .gm-icon-btn, .gm-round, .gm-ctl, .gm-join-btn, .gm-split, .direct-surface-controls .tg-call-ic, .statistics-periods button, .library-categories button, .lib2-langs button, .lib2-shelves button, .book-card > div > div > button, .detail-actions > button, .yt-topics button, .yt-pill, .tgp-savebar button, .tgp-nav button, .standalone-ai > form > button"],
];
export const GLASS_SELECTOR = groups.map(([, selector]) => selector).join(", ");
export const glassBudget = (width: number) => width <= 820 ? 12 : 22;
export const glassKind = (element: Element): GlassKind => groups.find(([, selector]) => element.matches(selector))?.[0] ?? "control";
export const LIQUID_PRESS = { scale: .93, squish: .035 } as const;

export function glassConfig(kind: GlassKind, dark: boolean, radius: number, mobile: boolean, shortEdge = Infinity): Partial<LiquidGlassConfig> {
  const panel = kind === "panel";
  const control = kind === "control";
  const navigation = kind === "navigation";
  const plane = kind === "chrome" && radius < 1;
  return {
    material: panel ? "thick" : kind === "chrome" ? "thin" : "clear",
    appearance: dark ? "dark" : "light",
    respectPreferences: true,
    borderRadius: radius,
    blur: panel ? 24 : navigation ? 30 : control ? 2.5 : 10,
    saturation: 1.12,
    tint: dark ? "24, 28, 32" : "255, 255, 255",
    tintOpacity: panel ? .12 : dark ? .055 : .04,
    // Keep samples inside small lenses; oversized displacement produces blank bands.
    refractionStrength: Math.min(panel ? 10 : navigation ? 72 : control ? 42 : plane ? 12 : 56, shortEdge * .42),
    bezelWidth: Math.min(plane ? 8 : control ? 20 : 36, shortEdge * .28, radius > 0 ? radius * .6 : Infinity),
    thickness: Math.min(control ? 22 : 32, shortEdge * .45),
    ior: panel ? 1.5 : 1.65,
    chromaticAberration: panel ? .04 : .1,
    edgeHighlight: dark ? .2 : plane ? .2 : panel ? .45 : .88,
    specularStrength: dark ? .08 : plane ? .12 : panel ? .16 : .52,
    fresnelPower: panel ? 2.2 : 1.6,
    elevation: 0,
    noiseOpacity: 0,
    quality: mobile && (panel || control) ? "low" : "medium",
    dynamicLighting: true,
    cursorTracking: !mobile,
    hoverLighting: !mobile,
    parallax: false,
    inertia: false,
    refractionMode: "auto",
  };
}

type Entry = {
  kind: GlassKind;
  visible: boolean;
  signature: string;
  failed?: boolean;
  layer?: HTMLDivElement;
  engine?: LiquidGlassEngine;
  release?: () => void;
};

/** Effects live in an owned, empty background. React's content never gets wrapped or moved. */
export function mountLiquidGlass(root: HTMLElement = document.body) {
  if (typeof IntersectionObserver === "undefined" || typeof ResizeObserver === "undefined") return () => {};
  let disposed = false;
  let frame = 0;
  let Engine: typeof LiquidGlassEngine | undefined;
  const entries = new Map<HTMLElement, Entry>();
  const transparency = matchMedia("(prefers-reduced-transparency: reduce)");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const pointer = matchMedia("(pointer: coarse)");
  const forcedColors = matchMedia("(forced-colors: active)");
  const intersections = new IntersectionObserver(items => {
    for (const item of items) {
      const entry = entries.get(item.target as HTMLElement);
      if (entry) entry.visible = item.isIntersecting;
    }
    schedule();
  });

  function release(element: HTMLElement, entry: Entry) {
    entry.release?.();
    entry.engine?.destroy();
    entry.layer?.remove();
    entry.release = undefined;
    entry.engine = undefined;
    entry.layer = undefined;
    element.classList.remove("liquid-surface");
    delete element.dataset.liquidStack;
    element.style.removeProperty("--liquid-base");
  }

  function appearance(element: HTMLElement) {
    return !!element.closest(".gm-lobby-preview, .direct-surface-controls") || document.documentElement.dataset.theme === "dark";
  }

  function attach(element: HTMLElement, entry: Entry) {
    if (!Engine) return;
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const radius = Math.min(parseFloat(style.borderTopLeftRadius) || 0, box.width / 2, box.height / 2);
    const layer = document.createElement("div");
    layer.className = "liquid-material";
    layer.setAttribute("aria-hidden", "true");
    layer.appendChild(Object.assign(document.createElement("div"), { className: "ql-content" }));
    const originalPosition = element.style.position;
    const originalBackground = ["background-color", "background-image"].map(property => [property, element.style.getPropertyValue(property), element.style.getPropertyPriority(property)]);
    const positionOwned = style.position === "static";
    if (positionOwned) element.style.position = "relative";
    if (style.zIndex === "auto") element.dataset.liquidStack = "";
    const base = entry.kind === "chrome" || entry.kind === "panel" || entry.kind === "navigation"
      ? element.closest(".gm-room, .gm-lobby-preview") ? "var(--gm-surface, var(--surface))" : "var(--surface)"
      : style.backgroundColor;
    element.style.setProperty("--liquid-base", base);
    element.style.setProperty("background-color", "transparent", "important");
    element.style.setProperty("background-image", "none", "important");
    element.classList.add("liquid-surface");
    element.appendChild(layer);
    entry.layer = layer;
    const mobile = pointer.matches || window.innerWidth <= 820;
    const interactive = entry.kind === "control";
    const forward = (event: PointerEvent) => {
      if ((element as HTMLButtonElement).disabled) return;
      layer.dispatchEvent(new PointerEvent(event.type, { clientX: event.clientX, clientY: event.clientY, button: event.button, pointerType: event.pointerType }));
    };
    const eventTarget = element.matches(".reference-dock .dock-icon") ? element.parentElement! : element;
    const events = interactive ? ["pointermove", "pointerenter", "pointerleave", "pointerdown", "pointerup", "pointercancel"] : ["pointermove", "pointerenter", "pointerleave"];
    events.forEach(name => eventTarget.addEventListener(name, forward as EventListener, { passive: true }));
    entry.release = () => {
      events.forEach(name => eventTarget.removeEventListener(name, forward as EventListener));
      if (positionOwned && element.style.position === "relative") element.style.position = originalPosition;
      for (const [property, value, priority] of originalBackground) {
        if (value) element.style.setProperty(property, value, priority);
        else element.style.removeProperty(property);
      }
    };
    try {
      const engine = new Engine(layer, glassConfig(entry.kind, appearance(element), radius, mobile, Math.min(box.width, box.height)));
      entry.engine = engine;
      if (interactive) engine.enableLiquidPress(LIQUID_PRESS);
    } catch {
      release(element, entry);
      entry.failed = true;
    }
  }

  function reconcile() {
    frame = 0;
    if (disposed) return;
    for (const element of root.querySelectorAll<HTMLElement>(GLASS_SELECTOR)) {
      if (entries.has(element) || element.closest(".liquid-material")) continue;
      const kind = glassKind(element);
      entries.set(element, { kind, visible: false, signature: "" });
      element.dataset.liquidKind = kind;
      if (kind === "control") element.classList.add("liquid-control");
      intersections.observe(element);
    }
    const candidates: Array<[HTMLElement, Entry, number]> = [];
    const dialogs = root.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
    const foreground = dialogs.item(dialogs.length - 1) || root.querySelector<HTMLElement>(".sidebar.sidebar-open, .meeting-standalone-overlay");
    const dark = document.documentElement.dataset.theme === "dark";
    const mobile = window.innerWidth <= 820 || pointer.matches;
    for (const [element, entry] of entries) {
      if (!element.isConnected || !element.matches(GLASS_SELECTOR)) {
        release(element, entry);
        element.classList.remove("liquid-control");
        delete element.dataset.liquidKind;
        intersections.unobserve(element);
        entries.delete(element);
        continue;
      }
      const classes = element.className.replace(/\bliquid-(?:surface|control)\b/g, "").trim().replace(/\s+/g, " ");
      const parentClasses = element.matches(".tg-call-ic, .reference-dock .dock-icon") ? element.parentElement?.className : "";
      const signature = `${dark}:${mobile}:${classes}:${parentClasses}:${element.getAttribute("aria-pressed")}:${element.getAttribute("disabled")}`;
      if (signature !== entry.signature) {
        release(element, entry);
        entry.signature = signature;
      }
      const rect = element.getBoundingClientRect();
      const quietTab = element.matches(".chat-catalog button:not(.active), .main-nav > a:not(.active), .reference-dock > a:not(.active):not(.dock-ai) > .dock-icon, .tgp-nav button:not(.active)");
      const uncovered = !foreground || foreground === element || foreground.contains(element);
      const eligible = entry.visible && uncovered && !entry.failed && !quietTab && !document.hidden && !transparency.matches && !motion.matches && !forcedColors.matches && !element.closest(":disabled, [aria-disabled=true]") && rect.width > 8 && rect.height > 8 && rect.width * rect.height < 650000;
      if (eligible) {
        const active = element.matches(".active, .selected, [aria-pressed=true]") || !!element.closest(".reference-dock > a.active") || element.contains(document.activeElement) || element.matches(".reference-dock .dock-icon") && element.parentElement === document.activeElement;
        const action = element.matches(".button-primary, .send-button, .meet-new, .gm-join-btn, .book-card > div > div > button:first-child");
        const priority = entry.kind === "panel" ? 100 : entry.kind === "navigation" ? 90 : entry.kind === "chrome" ? 80 : active ? 70 : action ? 60 : 40;
        candidates.push([element, entry, priority]);
      }
    }
    const selected = new Set(candidates.sort((a, b) => b[2] - a[2]).slice(0, glassBudget(window.innerWidth)).map(([element]) => element));
    for (const [element, entry] of entries) {
      if (entry.engine && (!selected.has(element) || entry.layer?.parentElement !== element)) release(element, entry);
      if (selected.has(element) && !entry.engine) attach(element, entry);
    }
  }

  function schedule() {
    if (!disposed && !frame) frame = requestAnimationFrame(reconcile);
  }
  const mutations = new MutationObserver(records => {
    if (records.some(record => !(record.target instanceof Element && record.target.closest(".liquid-material")))) schedule();
  });
  mutations.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "disabled", "aria-disabled", "aria-pressed"] });
  const theme = new MutationObserver(schedule);
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("resize", schedule, { passive: true });
  root.addEventListener("focusin", schedule);
  document.addEventListener("visibilitychange", schedule);
  [transparency, motion, pointer, forcedColors].forEach(query => query.addEventListener("change", schedule));
  schedule();
  void import("quick-liquid/core").then(module => {
    if (disposed) return;
    Engine = module.LiquidGlassEngine;
    schedule();
  }).catch(() => { /* The CSS material remains usable if the optional effect cannot load. */ });
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    mutations.disconnect();
    theme.disconnect();
    intersections.disconnect();
    window.removeEventListener("resize", schedule);
    root.removeEventListener("focusin", schedule);
    document.removeEventListener("visibilitychange", schedule);
    [transparency, motion, pointer, forcedColors].forEach(query => query.removeEventListener("change", schedule));
    for (const [element, entry] of entries) {
      release(element, entry);
      element.classList.remove("liquid-control");
      delete element.dataset.liquidKind;
    }
    entries.clear();
  };
}

import { useI18n } from "../lib/i18n/i18n";
import { useAuth } from "../lib/auth";
import { useEffect, useRef } from "react";

export function EducationWorkspace() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const frame = useRef<HTMLIFrameElement>(null);
  const syncTheme = () => {
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    const keys = ["canvas", "surface", "surface-muted", "text", "text-soft", "muted", "line", "line-strong", "accent", "accent-hover", "accent-soft", "action-bg", "action-text", "font-body"];
    const tokens = Object.fromEntries(keys.map(key => [key, styles.getPropertyValue(`--${key}`).trim()]));
    frame.current?.contentWindow?.postMessage({ type: "optima-education-theme", theme: root.dataset.theme, tokens }, window.location.origin);
  };
  useEffect(() => {
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    syncTheme();
    return () => observer.disconnect();
  }, []);
  if (!user) return null;
  const query = new URLSearchParams({
    learner: user.id,
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
    lang: locale,
  });
  const initialPage = new URLSearchParams(window.location.search).get("section") === "dictionary" ? "#/lugatlar" : "";
  return <section className="education-workspace">
    <iframe ref={frame} onLoad={syncTheme} key={user.id} src={`/education-app/index.html?${query}${initialPage}`} title={t("education.catalog")}
      allow="microphone; autoplay" />
  </section>;
}

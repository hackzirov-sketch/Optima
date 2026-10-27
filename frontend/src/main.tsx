import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthProvider } from "./lib/auth";
import { installSocketAuth } from "./lib/socketAuth";
import { installKeyboardClass } from "./lib/keyboard";
import { I18nProvider } from "./lib/i18n/i18n";
import { ToastProvider } from "./components/Toast";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { isLocalPreview } from "./lib/localPreview";
import { initializeDemo, isDemoMode } from "./lib/demo";
import { session } from "./lib/session";
import "./styles.css";
import "./premium.css";
// Order matters: each layer refines the ones above it. A merge once dropped
// the last three and left the home page and dock unstyled.
import "./motion.css";
import "./feedback-polish.css";
import "./navigation-ai.css";
import "./chat-telegram.css";
import "./profile-telegram.css";
import "./library-v2.css";
import "./voice-chat.css";
import "./auth.css";
import "./meet-polish.css";
import "./call-telegram.css";
import "./youtube-watch.css";
import "./book-reader.css";
import "./mobile-shell.css";
import "./focus.css";
import "./bubble-ui.css";
import "./chat-flow.css";
import "./responsive-controls.css";
import "./solid-ui.css";
import "./education-workspace.css";
import "./landing.css";

initializeDemo();
if (import.meta.env.DEV && isLocalPreview() && !isDemoMode()) session.markActive();
// Entry-level updates can recreate auth contexts; reload instead of retaining stale providers.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());

installSocketAuth();
installKeyboardClass();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <App />
            {isDemoMode() && <details className="demo-notice" aria-label="Demo rejimi"><summary>Demo rejimi</summary><div className="demo-notice-content"><span>Namuna ma’lumotlari · faqat ko‘rish</span><a href="/login?demo=0">Kirish</a><a href="/welcome?demo=0" aria-label="Demodan chiqish">Chiqish</a></div></details>}
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  </StrictMode>,
);

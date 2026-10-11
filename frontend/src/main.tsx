import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthProvider } from "./lib/auth";
import { installSocketAuth } from "./lib/socketAuth";
import { installKeyboardClass } from "./lib/keyboard";
import { I18nProvider } from "./lib/i18n/i18n";
import { ToastProvider } from "./components/Toast";
import { ConfirmProvider } from "./components/ConfirmDialog";
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

installSocketAuth();
installKeyboardClass();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  </StrictMode>,
);

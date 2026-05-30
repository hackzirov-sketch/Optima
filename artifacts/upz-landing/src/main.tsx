import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import App from "./App";
import "./index.css";
import "./i18n";
import { initializeTheme } from "./utils/theme";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in the document.");
}

initializeTheme();
createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

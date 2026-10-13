import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { applyAppearance, loadSettings } from "./state/settings";

applyAppearance(loadSettings()); // apply the saved theme before first paint to avoid a flash

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./theme.css";
import App from "./App.jsx";
import Panel from "./Panel.jsx";

const esPanel = window.location.pathname.replace(/\/+$/, "") === "/panel";

createRoot(document.getElementById("root")).render(
  <StrictMode>{esPanel ? <Panel /> : <App />}</StrictMode>
);

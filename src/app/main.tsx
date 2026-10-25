import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./offline.css";
import "./tasks.css";
import "./appearance.css";
import { applyAppearance, readAppearance } from "../lib/appearance";

applyAppearance(readAppearance());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

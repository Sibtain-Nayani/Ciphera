import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./styles/tailwind.css";
import { AnonymizeProvider } from "./store/AnonymizeContext";

const root = createRoot(document.getElementById("root"));
root.render(
  <AnonymizeProvider>
    <App />
  </AnonymizeProvider>
);

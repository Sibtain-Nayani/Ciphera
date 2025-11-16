import React from "react";
import "./topbar.css";

export default function Topbar() {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="app-title">Ciphera</h1>
      </div>
      <div className="topbar-right">
        <button className="primary">Run Anonymization</button>
      </div>
    </header>
  );
}


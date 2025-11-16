import React from "react";

export default function Design09() {
  return (
    <div style={{ padding: "24px" }}>
      <h1>Design 09 — Batch Processing</h1>
      <div style={{ background: "#fff", padding: "20px", borderRadius: "10px" }}>
        <p>Upload multiple files for batch anonymization</p>
        <input type="file" multiple accept=".txt,.pdf" />
      </div>
    </div>
  );
}
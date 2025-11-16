import React from "react";

export default function Design06() {
  return (
    <div style={{ padding: "24px" }}>
      <h1>Design 06 — Side-by-Side Diff View</h1>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <div style={{ background: "#fff", padding: "20px", borderRadius: "10px" }}>
          <h3>Original</h3>
          <pre>Sample text here</pre>
        </div>
        <div style={{ background: "#fff", padding: "20px", borderRadius: "10px" }}>
          <h3>Anonymized</h3>
          <pre>Xxxxx xxxx xxxx</pre>
        </div>
      </div>
    </div>
  );
}
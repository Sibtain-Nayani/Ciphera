import React from "react";

export default function Design10() {
  return (
    <div style={{ padding: "24px" }}>
      <h1>Design 10 — Export Results</h1>
      <div style={{ background: "#fff", padding: "20px", borderRadius: "10px" }}>
        <button style={{ padding: "10px 16px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}>
          Export as CSV
        </button>
        <button style={{ padding: "10px 16px", background: "#10b981", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", marginLeft: "8px" }}>
          Download PDF
        </button>
      </div>
    </div>
  );
}
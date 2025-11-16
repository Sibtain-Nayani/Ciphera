import React from "react";

export default function Design08() {
  return (
    <div style={{ padding: "24px", maxWidth: "600px" }}>
      <h1>Design 08 — Settings</h1>
      <div style={{ background: "#fff", padding: "20px", borderRadius: "10px" }}>
        <label style={{ display: "block", marginBottom: "12px" }}>
          <input type="checkbox" defaultChecked /> Enable detailed logging
        </label>
        <label style={{ display: "block", marginBottom: "12px" }}>
          <input type="checkbox" /> Auto-save results
        </label>
      </div>
    </div>
  );
}
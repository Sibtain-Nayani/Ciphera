import React from "react";

export default function Design07() {
  return (
    <div style={{ padding: "24px" }}>
      <h1>Design 07 — Audit Log</h1>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f3f4f6" }}>
            <th style={{ padding: "10px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>Timestamp</th>
            <th style={{ padding: "10px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>Action</th>
            <th style={{ padding: "10px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: "10px", borderBottom: "1px solid #e5e7eb" }}>2025-11-15 10:00</td>
            <td style={{ padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Anonymize text</td>
            <td style={{ padding: "10px", borderBottom: "1px solid #e5e7eb", color: "#10b981" }}>Success</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
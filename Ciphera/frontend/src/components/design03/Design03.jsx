import React, { useState } from "react";
import { anonymize } from "../../services/api";
import "./design03.css";

/*
  Template used for all 12 designs. Copy this file to design02..design12 directories
  and update the UI to match each Figma screen (I already copied 02..12 as placeholders).
*/
export default function Design01() {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [technique, setTechnique] = useState("mask");

  const techniques = [
    { id: "mask", label: "Masking", desc: "Replace with X characters" },
    { id: "replace", label: "Replacement", desc: "Replace with placeholder" },
    { id: "hash", label: "Hashing", desc: "Replace with hash value" },
    { id: "encrypt", label: "Encryption", desc: "Encrypt sensitive data" },
  ];

  async function run() {
    setLoading(true);
    try {
      const res = await anonymize({ text, file, technique });
      setResult(res);
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="design-page">
      <h2>Design 01 — Upload & Anonymize</h2>

      <div className="card">
        <label>Upload file (txt or pdf) or paste text</label>
        <input type="file" accept=".txt,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste text here" rows={8} />
        <div>
          <button onClick={run} disabled={loading}>{loading ? "Running…" : "Run"}</button>
        </div>
      </div>

      <div className="card">
        <h3>Result</h3>
        <pre style={{ whiteSpace: "pre-wrap" }}>{result ? JSON.stringify(result, null, 2) : "No result yet."}</pre>
      </div>

      <div className="design03-page">
        <div className="design03-header">
          <h1>Choose Anonymization Technique</h1>
          <p>Select how you want to anonymize the text</p>
        </div>
        <div className="design03-grid">
          {techniques.map((t) => (
            <label key={t.id} className="design03-radio-card">
              <input type="radio" name="technique" value={t.id} checked={technique === t.id} onChange={(e) => setTechnique(e.target.value)} />
              <div className="design03-radio-content">
                <span className="design03-radio-label">{t.label}</span>
                <span className="design03-radio-desc">{t.desc}</span>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
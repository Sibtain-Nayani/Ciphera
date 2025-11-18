import React, { useState, useRef } from "react";
import { anonymize } from "../../services/api";
import "./design01.css";

export default function Design01() {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [technique, setTechnique] = useState("mask");
  const fileInputRef = useRef(null);

  function onChooseFileClick() {
    fileInputRef.current?.click();
  }

  function handleFile(e) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    // clear text when file chosen (keeps behavior simple)
    if (f) setText("");
  }

  async function handleRun() {
    setError("");
    setLoading(true);
    setResult(null);
    try {
      const res = await anonymize({ text, file, technique });
      setResult(res);
    } catch (e) {
      setError(e.message || "Failed to anonymize");
    } finally {
      setLoading(false);
    }
  }

  function formatEntity(e) {
    return `${e.type}: ${e.text} (confidence: ${(e.score * 100).toFixed(0)}%)`;
  }

  return (
    <div className="design01-page">
      <div className="design01-hero">
        <h1 className="design01-title">Anonymize Text</h1>
        <p className="design01-sub">Upload a file or paste text to detect and anonymize PII</p>
      </div>

      <div className="design01-grid">
        <section className="design01-col">
          <div className="card input-card">
            <h2 className="card-title">Input</h2>

            <div
              className="upload-area"
              onClick={onChooseFileClick}
              role="button"
              tabIndex={0}
              onKeyDown={() => onChooseFileClick()}
            >
              <div className="upload-icon">📎</div>
              <div className="upload-text">Upload .txt or .pdf</div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.pdf"
                onChange={handleFile}
                className="hidden-file"
              />
              {file && <div className="upload-filename">✓ <span className="file-link">{file.name}</span></div>}
            </div>

            <div className="or-sep">or</div>

            <textarea
              className="input-textarea"
              placeholder="Paste text here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
            />

            <div className="controls-row">
              <div className="tech-group">
                <label className="tech-label">Anonymization Technique</label>
                <select className="tech-select" value={technique} onChange={(e) => setTechnique(e.target.value)}>
                  <option value="mask">Mask (XXXX)</option>
                  <option value="replace">Replace ([REDACTED])</option>
                  <option value="hash">Hash</option>
                </select>
              </div>

              <button className="run-btn" onClick={handleRun} disabled={loading}>
                {loading ? "Processing…" : "Run Anonymization"}
              </button>
            </div>

            {error && <div className="card-error">{error}</div>}
          </div>
        </section>

        <section className="design01-col">
          <div className="card result-card">
            <h2 className="card-title">Result</h2>

            {!result && <div className="result-placeholder">Results will appear here</div>}

            {result && result.status === "error" && (
              <div className="card-error">{result.error || "An error occurred"}</div>
            )}

            {result && result.status === "success" && (
              <>
                <div className="entities">
                  <div className="entities-header">Detected Entities <span className="entities-count">({result.entity_count})</span></div>
                  {result.detected_entities && result.detected_entities.length ? (
                    <ul className="entities-list">
                      {result.detected_entities.map((e, i) => (
                        <li key={i} className="entity-item">{formatEntity(e)}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="no-entities">No entities detected</div>
                  )}
                </div>

                <div className="text-blocks">
                  <div className="text-block">
                    <div className="text-block-title">Original</div>
                    <pre className="text-pre">{result.original}</pre>
                  </div>

                  <div className="text-block">
                    <div className="text-block-title">Anonymized</div>
                    <pre className="text-pre anonymized">{result.anonymized}</pre>
                  </div>
                </div>

                <div className="meta-row">
                  <div>Technique: <strong>{result.technique}</strong></div>
                  <div>Entities: <strong>{result.entity_count}</strong></div>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
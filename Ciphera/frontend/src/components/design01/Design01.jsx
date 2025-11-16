import React, { useState } from "react";
import { anonymize } from "../../services/api";
import "./design01.css";

export default function Design01() {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [technique, setTechnique] = useState("mask");

  async function handleRun() {
    setError("");
    setLoading(true);
    try {
      const res = await anonymize({ text, file, technique });
      setResult(res);
    } catch (e) {
      setError(e.message || "Failed to anonymize");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="design01-page">
      <div className="design01-header">
        <h1>Anonymize Text</h1>
        <p>Upload a file or paste text to detect and anonymize PII</p>
      </div>

      <div className="design01-container">
        <div className="design01-input-section">
          <div className="design01-card">
            <h2>Input</h2>
            <div className="design01-file-upload">
              <label htmlFor="file-input" className="design01-file-label">
                <span className="design01-icon">📎</span>
                <span>Upload .txt or .pdf</span>
              </label>
              <input
                id="file-input"
                type="file"
                accept=".txt,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="design01-file-input"
              />
              {file && <p className="design01-file-name">✓ {file.name}</p>}
            </div>
            <div className="design01-divider">or</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste text here..."
              className="design01-textarea"
              rows={10}
            />
            
            <div className="design01-technique">
              <label>Anonymization Technique</label>
              <select value={technique} onChange={(e) => setTechnique(e.target.value)}>
                <option value="mask">Mask (X characters)</option>
                <option value="replace">Replace ([PLACEHOLDER])</option>
                <option value="hash">Hash</option>
              </select>
            </div>

            {error && <p className="design01-error">{error}</p>}
            <button onClick={handleRun} disabled={loading} className="design01-btn-primary">
              {loading ? "Processing..." : "Run Anonymization"}
            </button>
          </div>
        </div>

        <div className="design01-result-section">
          <div className="design01-card">
            <h2>Result</h2>
            {result ? (
              <div className="design01-result">
                {result.status === "error" ? (
                  <p className="design01-error">{result.error}</p>
                ) : (
                  <>
                    <div className="design01-result-item">
                      <label>Detected Entities ({result.entity_count})</label>
                      {result.detected_entities && result.detected_entities.length > 0 ? (
                        <div className="design01-entities-list">
                          {result.detected_entities.map((entity, idx) => (
                            <div key={idx} className="design01-entity-badge">
                              <strong>{entity.type}</strong>: {entity.text} (confidence: {(entity.score * 100).toFixed(0)}%)
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="design01-placeholder">No entities detected</p>
                      )}
                    </div>

                    <div className="design01-result-item">
                      <label>Original Text</label>
                      <pre className="design01-text-box">{result.original}</pre>
                    </div>

                    <div className="design01-result-item">
                      <label>Anonymized Text</label>
                      <pre className="design01-text-box design01-anonymized">{result.anonymized}</pre>
                    </div>

                    <div className="design01-result-meta">
                      <span>Technique: {result.technique}</span>
                      <span>Entities Found: {result.entity_count}</span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="design01-placeholder">Results will appear here</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
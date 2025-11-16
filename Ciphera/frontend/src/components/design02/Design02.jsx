import React, { useState, useEffect } from "react";
import { anonymize, getSupportedEntities } from "../../services/api";
import "./design02.css";

export default function Design02() {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [supportedEntities, setSupportedEntities] = useState([]);
  const [selectedEntities, setSelectedEntities] = useState({});

  useEffect(() => {
    async function fetchEntities() {
      try {
        const res = await getSupportedEntities();
        setSupportedEntities(res.entities);
        // Initialize selected entities to true
        const initialSelected = {};
        for (const entity of res.entities) {
          initialSelected[entity] = true;
        }
        setSelectedEntities(initialSelected);
      } catch (e) {
        setError("Could not load supported entities");
      }
    }
    fetchEntities();
  }, []);

  async function handleRun() {
    setError("");
    setLoading(true);
    try {
      const entities = Object.keys(selectedEntities).filter(
        (key) => selectedEntities[key]
      );
      const res = await anonymize({ text, file, entities });
      setResult(res);
    } catch (e) {
      setError(e.message || "Failed to anonymize");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="design02-page">
      <div className="design02-header">
        <h1>Anonymize with Entity Selection</h1>
        <p>Choose which PII types to detect and anonymize</p>
      </div>

      <div className="design02-container">
        <div className="design02-input-section">
          <div className="design02-card">
            <h2>Input</h2>
            <div className="design02-file-upload">
              <label htmlFor="file-input" className="design02-file-label">
                <span className="design02-icon">📎</span>
                <span>Upload .txt or .pdf</span>
              </label>
              <input
                id="file-input"
                type="file"
                accept=".txt,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="design02-file-input"
              />
              {file && <p className="design02-file-name">✓ {file.name}</p>}
            </div>
            <div className="design02-divider">or</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste text here..."
              className="design02-textarea"
              rows={10}
            />
          </div>
        </div>

        <div className="design02-entity-section">
          <div className="design02-card">
            <h2>Entities to Detect</h2>
            <div className="design02-grid">
              {supportedEntities.map((entity) => (
                <label key={entity} className="design02-checkbox-card">
                  <input
                    type="checkbox"
                    checked={selectedEntities[entity] || false}
                    onChange={(e) =>
                      setSelectedEntities({
                        ...selectedEntities,
                        [entity]: e.target.checked,
                      })
                    }
                  />
                  <span className="design02-checkbox-label">
                    {entity.replace(/_/g, " ")}
                  </span>
                </label>
              ))}
            </div>
            {error && <p className="design02-error">{error}</p>}
            <button onClick={handleRun} disabled={loading} className="design02-btn-primary">
              {loading ? "Processing..." : "Run Anonymization"}
            </button>
          </div>
        </div>

        <div className="design02-result-section">
          <div className="design02-card">
            <h2>Result</h2>
            {result ? (
              <div className="design02-result">
                {result.status === "error" ? (
                  <p className="design02-error">{result.error}</p>
                ) : (
                  <>
                    <div className="design02-result-item">
                      <label>Detected Entities ({result.entity_count})</label>
                      {result.detected_entities &&
                      result.detected_entities.length > 0 ? (
                        <div className="design02-entities-list">
                          {result.detected_entities.map((entity, idx) => (
                            <div key={idx} className="design02-entity-badge">
                              <strong>{entity.type}</strong>: {entity.text} (confidence: {(entity.score * 100).toFixed(0)}%)
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="design02-placeholder">
                          No entities detected
                        </p>
                      )}
                    </div>

                    <div className="design02-result-item">
                      <label>Original Text</label>
                      <pre className="design02-text-box">{result.original}</pre>
                    </div>

                    <div className="design02-result-item">
                      <label>Anonymized Text</label>
                      <pre className="design02-text-box design02-anonymized">
                        {result.anonymized}
                      </pre>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="design02-placeholder">Results will appear here</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
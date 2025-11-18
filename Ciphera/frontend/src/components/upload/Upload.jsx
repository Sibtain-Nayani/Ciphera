import { useRef, useState } from "react";
import { anonymize } from "../../services/api";
import Button from "../ui/Button";
import Input from "../ui/Input";
import "../../styles/design-system.css";

export default function Upload() {
  const fileRef = useRef();
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [technique, setTechnique] = useState("mask");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function onRun() {
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const res = await anonymize({ text, file, technique });
      setResult(res);
    } catch (err) {
      setError(err?.error || err?.message || JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  }

  function onFile(e) {
    const f = e.target.files?.[0];
    setFile(f || null);
    if (f) setText("");
  }

  return (
    <div className="container" style={{ paddingTop: 32 }}>
      <h2>Upload Document</h2>

      <div className="card" style={{ maxWidth: 560 }}>
        <label className="small-muted">Paste text</label>
        <textarea
          className="input"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste text here (or choose a file)"
        />

        <div style={{ height: 12 }} />

        <label className="small-muted">Or upload file</label>
        <input ref={fileRef} type="file" onChange={onFile} />

        <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center" }}>
          <select value={technique} onChange={(e) => setTechnique(e.target.value)} className="input" style={{ maxWidth: 160 }}>
            <option value="mask">Mask</option>
            <option value="replace">Replace</option>
            <option value="hash">Hash</option>
          </select>

          <Button onClick={onRun} disabled={loading || (!text && !file)}>
            {loading ? "Processing..." : "Run"}
          </Button>

          <Button variant="secondary" onClick={() => { setText(""); setFile(null); setResult(null); setError(""); }}>
            Reset
          </Button>
        </div>

        {error && <div style={{ marginTop: 12, color: "#ff6b6b" }}>{error}</div>}

        {result && (
          <div style={{ marginTop: 16 }}>
            <h4>Result</h4>
            <div className="small-muted">Entities detected: {result.entity_count ?? result.detected_entities?.length ?? "—"}</div>
            <pre style={{ whiteSpace: "pre-wrap", background: "#0f0f0f", padding: 12, borderRadius: 8 }}>
              {result.anonymized ?? JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
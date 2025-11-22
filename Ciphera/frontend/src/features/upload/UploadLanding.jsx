import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { extractText } from "../../lib/api/presidio";
import ProcessingCard from "../anonymization/ProcessingCard";
import { useFile } from "../../store/FileContext";
import ShieldIcon from "../../components/ShieldIcon";

const ACCEPT = [".pdf", ".doc", ".docx", ".txt"];
const STEPS = [
  "Upload your document containing sensitive information",
  "AI detects and identifies sensitive data fields",
  "Choose which data to mask and download securely",
];
const TABS = [
  { label: "My Files", active: false },
  { label: "Projects", active: true },
  { label: "Share", active: false },
  { label: "Profile", active: false },
];

export default function UploadLanding() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const { setFileText, setFileName } = useFile();
  const navigate = useNavigate();

  const handleFiles = (files) => {
    if (files?.length) {
      setFile(files[0]);
      setError(null);
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  const onUpload = async () => {
    if (!file) {
      setError("Select a file first");
      return;
    }
    setIsUploading(true);
    setError(null);
    try {
      const response = await extractText({ file });
      setFileText(response.text);
      setFileName(response.filename);
      navigate("/anonymize");
    } catch (err) {
      setError(err?.detail || err?.error || String(err));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 text-white">
      <section className="rounded-[28px] border border-white/10 bg-gradient-to-b from-base-700/80 to-base-800/80 px-8 pb-10 pt-12 text-center shadow-card">
        <div className="mx-auto flex size-20 items-center justify-center rounded-full border border-accent/30 bg-base-700/60 text-accent">
          <ShieldIcon className="w-10 h-10" />
        </div>
        <h1 className="mt-5 font-display text-4xl font-semibold tracking-wide">Ciphera</h1>
        <p className="mt-1 text-base text-muted">Secure Document Processing</p>
      </section>

      <section
        className={`rounded-[28px] border border-white/15 bg-base-800/80 px-6 py-8 text-center shadow-card transition ${isDragging ? "border-accent bg-base-700" : ""
          }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-white/15 bg-base-700/70 text-2xl text-muted">
          <i className="lni lni-upload"></i>
        </div>
        <h2 className="mt-6 font-display text-2xl font-semibold">Upload Your Document</h2>
        <p className="mt-2 text-sm text-muted">Drop your file here or click to browse</p>
        <button
          className="mt-6 rounded-[14px] bg-accent px-6 py-3 text-base font-semibold text-base-900 shadow-lg shadow-accent/30"
          onClick={() => inputRef.current?.click()}
        >
          Choose File
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPT.join(",")}
          onChange={(event) => handleFiles(event.target.files)}
        />
        <div className="mt-6 flex items-center justify-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-2">
            <span role="img" aria-label="file">
              <i className="lni lni-empty-file"></i>
            </span>
            PDF, DOC, TXT
          </span>
          <span className="size-1 rounded-full bg-muted" />
          <span>Max 10MB</span>
        </div>
        {file && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-base-700/60 p-4 text-left text-sm">
            <p className="font-semibold">{file.name}</p>
            <p className="text-muted">{(file.size / 1024).toFixed(1)} KB selected</p>
          </div>
        )}
        <div className="mt-6 flex flex-col gap-3">
          <button
            className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-60"
            onClick={onUpload}
            disabled={isUploading}
          >
            {isUploading ? "Uploading…" : "Send to Ciphera"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </section>

      {isUploading && (
        <ProcessingCard
          status="Processing..."
          detail="Extracting text from document"
        />
      )}

      <section className="rounded-[28px] border border-white/10 bg-base-800/70 p-6 shadow-card">
        <h3 className="text-center font-display text-xl">How it works</h3>
        <ol className="mt-6 space-y-4">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-4 text-sm text-muted">
              <span className="flex size-8 items-center justify-center rounded-full bg-accent text-base font-bold text-base-900">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-base-800/60 p-4 shadow-card">
        <p className="text-xs uppercase tracking-[0.3em] text-center text-muted">Projects navigation</p>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
          {TABS.map((tab) => (
            <button
              key={tab.label}
              className={`rounded-full px-3 py-2 font-semibold ${tab.active ? "bg-accent text-base-900" : "bg-base-700/40 text-muted"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

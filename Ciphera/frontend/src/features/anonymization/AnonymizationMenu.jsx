import { useMemo, useState, useEffect } from "react";
import toast from "react-hot-toast";
import { usePresidioEntities } from "../../hooks/usePresidioEntities";
import { anonymizeText } from "../../lib/api/presidio";
import { useAnonymizeLog } from "../../store/AnonymizeContext";
import { useFile } from "../../store/FileContext";
import PageTransition from "../../components/PageTransition";

const SAMPLE_TEXT = `Jane Doe, jane.doe@example.com, 555-123-4567, 123 Main St.`;
const TECHNIQUES = [
  { id: "mask", label: "Mask" },
  { id: "replace", label: "Replace" },
  { id: "hash", label: "Hash" },
];

export default function AnonymizationMenu() {
  const { data: entities, isLoading, error } = usePresidioEntities();
  const [selectedEntities, setSelectedEntities] = useState(() => new Set(["PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER"]));
  const [technique, setTechnique] = useState("mask");
  const { fileText, fileName } = useFile();
  const [text, setText] = useState(fileText || SAMPLE_TEXT);
  const [preview, setPreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const { addJob } = useAnonymizeLog();

  useEffect(() => {
    if (fileText) {
      setText(fileText);
    }
  }, [fileText]);

  const orderedEntities = useMemo(() => {
    return [...entities].sort((a, b) => a.localeCompare(b));
  }, [entities]);

  const toggleEntity = (entity) => {
    setSelectedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(entity)) next.delete(entity);
      else next.add(entity);
      return next;
    });
  };

  const runPreview = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await anonymizeText({
        text,
        technique,
        entities: selectedEntities.size > 0 ? Array.from(selectedEntities) : null,
      });
      setPreview(result);
      addJob({
        source: fileName || "Free text",
        technique: result.technique,
        entityCount: result.entity_count,
        status: result.status,
        type: "text",
      });
    } catch (err) {
      setSubmitError(err?.detail || err?.error || String(err));
    } finally {
      setIsSubmitting(false);
    }
  };



  return (
    <PageTransition>
      <div className="space-y-8">
        <header className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Configure</p>
          <h1 className="font-display text-3xl font-semibold">Anonymization Menu</h1>
          <p className="text-sm text-muted">
            Choose which techniques and entity types to apply before downloading your sanitized file.
          </p>
          {fileName && <p className="text-sm text-accent">Processing file: {fileName}</p>}
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-border/30 bg-base-700/40 p-6">
            <h2 className="font-display text-xl">Techniques</h2>
            <div className="mt-4 flex flex-col gap-3">
              {TECHNIQUES.map((item) => (
                <button
                  key={item.id}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 border ${technique === item.id
                    ? "bg-accent text-base-900 border-accent shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)] scale-[1.02]"
                    : "bg-base-800/40 text-muted border-white/5 hover:bg-base-800/80 hover:border-white/10 hover:text-white"
                    }`}
                  onClick={() => setTechnique(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted">
              “Mask” keeps structure, “Replace” swaps values, and “Hash” produces irreversible digests.
            </p>
          </article>

          <article className="rounded-2xl border border-border/30 bg-base-700/40 p-6 flex flex-col max-h-[400px]">
            <div className="flex items-center justify-between shrink-0 mb-4">
              <h2 className="font-display text-xl">Entities</h2>
              <span className="text-xs text-muted">{isLoading ? "Loading…" : `${entities.length} types`}</span>
            </div>
            {error && <p className="mb-3 text-sm text-red-400">{String(error)}</p>}
            <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-2 custom-scrollbar">
              {orderedEntities.map((entity) => {
                const active = selectedEntities.has(entity);
                return (
                  <button
                    key={entity}
                    type="button"
                    title={entity}
                    className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all duration-200 truncate ${active
                      ? "border-accent bg-accent/10 text-white shadow-[inset_0_0_10px_rgba(var(--accent-rgb),0.1)]"
                      : "border-white/5 bg-base-800/40 text-muted hover:bg-base-800/60 hover:text-white/80"
                      }`}
                    onClick={() => toggleEntity(entity)}
                  >
                    {entity}
                  </button>
                );
              })}
            </div>
          </article>
        </section>

        <section className="rounded-2xl border border-border/30 bg-base-700/40 p-6">
          <h2 className="font-display text-xl">Preview</h2>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mt-4 w-full rounded-2xl border border-white/10 bg-base-900/60 p-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent custom-scrollbar"
            rows={4}
          />
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-base-900 disabled:opacity-50 hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20"
              onClick={runPreview}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Processing…" : "Run preview"}
            </button>
            {submitError && <span className="text-sm text-red-400">{submitError}</span>}
          </div>
          {preview && (
            <div className="mt-6 space-y-3 text-sm">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">Anonymized result</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const blob = new Blob([preview.anonymized], { type: "text/plain" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `anonymized_${fileName || "text"}.txt`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white hover:bg-white/10"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(preview.anonymized);
                        toast.success("Copied to clipboard!");
                      }}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white hover:bg-white/10"
                    >
                      Share
                    </button>
                  </div>
                </div>
                <div className="mt-2 rounded-2xl border border-white/10 bg-base-900/60 p-4 text-white max-h-[300px] overflow-y-auto custom-scrollbar whitespace-pre-wrap break-words">
                  {preview.anonymized}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-base-900/40 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-white/40">Detected entities</p>
                <p className="mt-2 text-white break-words">
                  {preview.detected_entities?.map((entity) => entity.type).join(", ") || "None"}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </PageTransition>
  );
}

import { useMemo, useState } from "react";
import { usePresidioEntities } from "../../hooks/usePresidioEntities";
import { anonymizeText } from "../../lib/api/presidio";
import { useAnonymizeLog } from "../../store/AnonymizeContext";

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
  const [text, setText] = useState(SAMPLE_TEXT);
  const [preview, setPreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const { addJob } = useAnonymizeLog();

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
        entities: Array.from(selectedEntities),
      });
      setPreview(result);
      addJob({
        source: "Free text",
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
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.3em] text-white/50">Configure</p>
        <h1 className="font-display text-3xl font-semibold">Anonymization Menu</h1>
        <p className="text-sm text-muted">
          Choose which techniques and entity types to apply before downloading your sanitized file.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-border/30 bg-base-700/40 p-6">
          <h2 className="font-display text-xl">Techniques</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {TECHNIQUES.map((item) => (
              <button
                key={item.id}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  technique === item.id ? "bg-accent text-base-900" : "bg-base-800/80 text-muted"
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

        <article className="rounded-2xl border border-border/30 bg-base-700/40 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Entities</h2>
            <span className="text-xs text-muted">{isLoading ? "Loading…" : `${entities.length} types`}</span>
          </div>
          {error && <p className="mt-3 text-sm text-red-400">{String(error)}</p>}
          <div className="mt-4 grid max-h-48 grid-cols-2 gap-2 overflow-y-auto pr-1">
            {orderedEntities.map((entity) => {
              const active = selectedEntities.has(entity);
              return (
                <button
                  key={entity}
                  type="button"
                  className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                    active
                      ? "border-accent bg-accent/10 text-white"
                      : "border-white/10 bg-base-800/60 text-muted"
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
          className="mt-4 w-full rounded-2xl border border-white/10 bg-base-900/60 p-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent"
          rows={4}
        />
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-base-900 disabled:opacity-50"
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
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">Anonymized result</p>
              <p className="mt-2 rounded-2xl border border-white/10 bg-base-900/60 p-4 text-white">
                {preview.anonymized}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-base-900/40 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">Detected entities</p>
              <p className="mt-2 text-white">
                {preview.detected_entities?.map((entity) => entity.type).join(", ") || "None"}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

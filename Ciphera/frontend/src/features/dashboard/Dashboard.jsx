import { useEffect, useMemo, useState } from "react";
import { getHealth } from "../../lib/api/presidio";
import { useAnonymizeLog } from "../../store/AnonymizeContext";

export default function Dashboard() {
  const [health, setHealth] = useState("checking...");
  const { jobs } = useAnonymizeLog();

  useEffect(() => {
    getHealth()
      .then((res) => setHealth(res.status ?? "ok"))
      .catch(() => setHealth("offline"));
  }, []);

  const stats = useMemo(() => {
    const totalEntities = jobs.reduce((sum, job) => sum + (job.entityCount ?? 0), 0);
    const avgEntities = jobs.length ? Math.round(totalEntities / jobs.length) : 0;
    return [
      { label: "Jobs processed", value: jobs.length, hint: "+live" },
      { label: "PII fields masked", value: totalEntities, hint: "Σ" },
      { label: "Avg entities/job", value: avgEntities, hint: "mean" },
    ];
  }, [jobs]);

  const recent = jobs.slice(0, 5);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.3em] text-white/50">Overview</p>
        <h1 className="font-display text-3xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted">Monitor anonymization activity and service health at a glance.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-2xl border border-border/40 bg-base-700/40 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{stat.value}</p>
            <p className="text-sm text-accent">{stat.hint}</p>
          </article>
        ))}
        <article className="rounded-2xl border border-border/40 bg-base-700/40 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">FastAPI status</p>
          <p className="mt-2 text-2xl font-semibold text-white">{health}</p>
          <p className="text-sm text-muted">Live from /health endpoint</p>
        </article>
      </section>

      <section className="rounded-2xl border border-border/40 bg-base-700/40 p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Recent anonymizations</h2>
          <span className="text-xs text-muted">{recent.length || "No jobs yet"}</span>
        </div>
        <div className="mt-4 divide-y divide-white/10 text-sm">
          {recent.length === 0 && <p className="py-6 text-center text-muted">Run an upload to see activity.</p>}
          {recent.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-4 py-3">
              <div className="flex-1">
                <p className="font-semibold text-white">{item.source}</p>
                <p className="text-xs text-muted">
                  {item.entityCount ?? 0} entities • {new Date(item.createdAt).toLocaleTimeString()}
                </p>
              </div>
              <span className="rounded-full bg-base-900/60 px-3 py-1 text-xs uppercase tracking-wide text-white/80">
                {item.technique}
              </span>
              <span className={`text-xs font-semibold ${item.status === "success" ? "text-accent" : "text-info"}`}>
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function ProcessingCard({
  status = "Preparing Download...",
  detail = "Applying masks and securing document",
}) {
  return (
    <div className="rounded-[28px] border border-white/12 bg-gradient-to-b from-base-700/70 to-base-800/80 px-8 py-10 text-center shadow-card">
      <div className="mx-auto h-20 w-20 rounded-full border border-white/15 p-2">
        <div className="h-full w-full rounded-full border-t-2 border-white/70 opacity-80" />
      </div>
      <p className="mt-6 font-display text-2xl font-semibold text-white">{status}</p>
      <p className="mt-2 text-sm text-muted">{detail}</p>
    </div>
  );
}

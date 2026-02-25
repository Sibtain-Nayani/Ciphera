export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <main className="flex w-full max-w-3xl flex-col items-center gap-8 text-center sm:items-start sm:text-left">

        <div className="flex flex-col gap-2">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            Ciphera <span className="text-primary font-mono text-sm uppercase px-2 py-1 bg-primary/20 rounded-full align-middle">v2.0</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-lg">
            Enterprise-grade local data anonymization workspace. Advanced redaction for text, images, and documents.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
          <div className="p-6 rounded-2xl border border-border bg-card shadow-sm flex flex-col gap-4">
            <h2 className="font-semibold text-xl">Core Aesthetics</h2>
            <div className="font-mono text-sm text-secondary-foreground space-y-1">
              <p>Background: <span className="text-muted-foreground">#212121</span></p>
              <p>Accent: <span className="text-primary">#FFA500</span></p>
              <p>Font: <span className="font-sans">Inter</span> & JetBrains Mono</p>
            </div>
          </div>

          <div className="p-6 rounded-2xl border border-border bg-muted flex flex-col justify-center items-center sm:items-start gap-4">
            <p className="text-muted-foreground">Get started by navigating to the dashboard or uploading a document.</p>
            <button className="h-12 px-6 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
              Open Workspace
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}

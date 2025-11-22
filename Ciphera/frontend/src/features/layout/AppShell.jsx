import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

const statusGlyphs = ["􀛨", "􀙇", "􀋧"];
const navLinks = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/upload", label: "Upload" },
  { to: "/anonymize", label: "Anonymize" },
  { to: "/audit", label: "Audit Log" },
  { to: "/settings", label: "Settings" },
];

export default function AppShell() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#2d2d2d,_#121212)] text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-4 lg:hidden">
        <div>
          <p className="font-semibold tracking-[0.25em] uppercase text-xs text-white/70">Ciphera</p>
          <p className="text-sm text-muted">Data Anonymization Drive</p>
        </div>
        <button
          type="button"
          className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold"
          onClick={() => setIsSidebarOpen(true)}
        >
          Menu
        </button>
      </header>

      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      <div className="mx-auto flex w-full max-w-6xl gap-6 px-4 py-6 lg:py-10">
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col gap-8 border border-border/30 bg-base-700/70 px-6 py-8 shadow-card backdrop-blur-2xl transition-transform duration-300 ease-out lg:static lg:translate-x-0 lg:w-80 lg:rounded-3xl ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
        >
          <div>
            <div className="flex items-center justify-between text-sm text-white/70">
              <span className="font-semibold tracking-[0.25em] uppercase">Ciphera</span>
              <span className="text-xs text-white/60">9:41</span>
            </div>
            <div className="mt-3 flex items-center justify-end gap-3 text-white/70">
              {statusGlyphs.map((glyph) => (
                <span key={glyph}>{glyph}</span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-base-800/80 p-4 text-center shadow-card">
            <p className="font-display text-2xl font-semibold">Ciphera</p>
            <p className="mt-1 text-sm text-muted">Data Anonymization Drive</p>
          </div>

          <nav className="space-y-2 text-sm font-medium text-white/70">
            {navLinks.map(({ to, label, disabled }) => (
              <NavLink
                key={label}
                to={disabled ? "#" : to}
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `block w-full rounded-xl px-4 py-3 transition ${isActive ? "bg-accent text-base-900" : "hover:bg-white/5"
                  } ${disabled ? "pointer-events-none opacity-50" : ""}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>



          <button
            type="button"
            className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold lg:hidden"
            onClick={closeSidebar}
          >
            Close
          </button>
        </aside>

        <main className="flex-1">
          <div className="mx-auto w-full max-w-[420px] rounded-[32px] border border-white/10 bg-base-800/80 p-4 shadow-card backdrop-blur-2xl sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

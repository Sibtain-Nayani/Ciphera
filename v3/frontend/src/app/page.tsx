import { ShieldCheck, FileText, Lock, ArrowRight, Zap, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/layout/Logo";

export default function Home() {
    return (
        <div className="flex flex-col min-h-screen bg-[#141414] overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#FFA500] opacity-[0.03] blur-[150px] rounded-full pointer-events-none" />

            {/* Header/Nav */}
            <header className="fixed top-0 inset-x-0 h-16 border-b border-[#3B3B3B] bg-[#141414]/80 backdrop-blur-md z-50 flex items-center justify-between px-6 md:px-12">
                <div className="flex items-center gap-3">
                    <Logo className="w-8 h-8" />
                    <span className="font-semibold text-xl text-white tracking-tight">Ciphera</span>
                </div>
                <div className="flex items-center gap-4">
                    <a href="https://github.com" target="_blank" rel="noreferrer" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Documentation</a>
                    <Link href="/dashboard" className="px-5 py-2 bg-[#1E1E1E] text-white hover:bg-[#2A2A2A] border border-[#3B3B3B] transition-colors rounded-lg text-sm font-medium">
                        Open App
                    </Link>
                </div>
            </header>

            <main className="flex-1 flex flex-col items-center justify-center px-6 pt-32 pb-24 text-center z-10">
                {/* Version Badge */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FFA500]/10 border border-[#FFA500]/20 mb-8">
                    <span className="flex h-2 w-2 rounded-full bg-[#FFA500] animate-pulse"></span>
                    <span className="text-xs font-mono text-[#FFA500] font-medium tracking-wide border-r border-[#FFA500]/20 pr-3">V3.0 QUANTUM ELITE</span>
                    <span className="text-xs font-medium text-gray-300 pl-1">Neural Sanitization Matrix</span>
                </div>

                {/* Hero Title */}
                <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white max-w-4xl leading-tight mb-8">
                    Absolute Data Privacy.<br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FFA500] to-[#FF6B00]">
                        Locally Enforced.
                    </span>
                </h1>

                {/* Subtitle */}
                <p className="text-lg md:text-xl text-gray-400 max-w-2xl mb-12 leading-relaxed">
                    CipheraV3 is an autonomous, fail-secure anonymization engine. Redact PII from documents, PDFs, and images with precision-grade NLP and hardware-accelerated targeting.
                </p>

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row items-center gap-4 mb-24">
                    <Link href="/dashboard" className="flex items-center gap-2 px-8 py-4 bg-[#FFA500] text-black hover:bg-[#FFB833] transition-colors rounded-xl font-bold text-lg shadow-[0_0_20px_rgba(255,165,0,0.3)] hover:shadow-[0_0_30px_rgba(255,165,0,0.4)]">
                        Launch Workspace <ArrowRight className="w-5 h-5" />
                    </Link>
                    <Link href="/dashboard" className="flex items-center justify-center gap-2 px-8 py-4 bg-[#1E1E1E] text-white hover:bg-[#2A2A2A] border border-[#3B3B3B] transition-colors rounded-xl font-bold text-lg sm:w-auto w-full">
                        View Audit Ledger
                    </Link>
                </div>

                {/* Feature Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl w-full text-left">
                    <div className="p-8 rounded-2xl bg-[#1E1E1E] border border-[#3B3B3B] hover:border-[#FFA500]/30 transition-colors">
                        <div className="w-12 h-12 rounded-xl bg-[#FFA500]/10 flex items-center justify-center mb-6">
                            <Lock className="w-6 h-6 text-[#FFA500]" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-3">Autonomous Data Sovereignty</h3>
                        <p className="text-gray-400 leading-relaxed text-sm">
                            Full-stack local inference engine. No data egress, no external dependencies. Pure, uncompromised privacy for sensitive workflows.
                        </p>
                    </div>

                    <div className="p-8 rounded-2xl bg-[#1E1E1E] border border-[#3B3B3B] hover:border-emerald-500/30 transition-colors">
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-6">
                            <ShieldCheck className="w-6 h-6 text-emerald-500" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-3">Compliance Ready</h3>
                        <p className="text-gray-400 leading-relaxed text-sm">
                            Built-in HIL (Human-in-the-Loop) gates, JSON audit trails, and deterministic placeholders ensure SOC2 and GDPR readiness.
                        </p>
                    </div>

                    <div className="p-8 rounded-2xl bg-[#1E1E1E] border border-[#3B3B3B] hover:border-blue-500/30 transition-colors">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-6">
                            <FileText className="w-6 h-6 text-blue-500" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-3">Multi-Modal Parsing</h3>
                        <p className="text-gray-400 leading-relaxed text-sm">
                            Real stream-level byte destruction for PDFs via PyMuPDF. OCR for raster images. AST parsing for structured JSON/CSV data.
                        </p>
                    </div>
                </div>

                {/* Tech Stack Banner */}
                <div className="mt-24 pt-12 border-t border-[#3B3B3B]/50 w-full max-w-4xl flex flex-col items-center">
                    <p className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-6">Powered By Enterprise Hardware</p>
                    <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-6 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                        <span className="text-xl font-bold flex items-center gap-1"><Zap className="w-5 h-5 text-gray-300"/> FastAPI</span>
                        <span className="text-xl font-bold">Next.js 14</span>
                        <span className="text-xl font-bold flex items-center gap-1"><Code2Icon className="w-5 h-5 text-gray-300"/> PyMuPDF</span>
                        <span className="text-xl font-bold font-mono">Presidio</span>
                        <span className="text-xl font-bold">Konva</span>
                    </div>
                </div>

            </main>
        </div>
    );
}

function Code2Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

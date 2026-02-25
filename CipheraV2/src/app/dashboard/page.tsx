"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, CheckCircle2, Clock, ShieldCheck, FileText, Activity, Lock } from 'lucide-react';
import { useDocumentStore } from '@/store/documentStore';
import { useCanvasStore } from '@/store/canvasStore';
import { extractTextFromFile } from '@/lib/fileFormat';
import { convertPdfToImages } from '@/lib/pdfRenderer';

export default function DashboardPage() {
    const [isDragging, setIsDragging] = useState(false);
    const router = useRouter();
    const { rules, setRawText } = useDocumentStore();

    // Mock Data for the Audit Ledger
    const recentFiles = [
        { id: 'DOC-9482', name: 'Q3_Financial_Statements_RAW.pdf', date: '2026-02-25 08:14', status: 'Completed', size: '2.4 MB' },
        { id: 'DOC-9483', name: 'Employee_Census_Data_v2.csv', date: '2026-02-25 09:30', status: 'Processing', size: '14.1 MB' },
        { id: 'DOC-9484', name: 'Legal_Discovery_Batch_A.zip', date: '2026-02-24 16:45', status: 'Completed', size: '1.2 GB' },
        { id: 'DOC-9485', name: 'Client_Onboarding_Draft.docx', date: '2026-02-24 11:12', status: 'Completed', size: '845 KB' },
    ];
    const activeRulesCount = Object.values(rules).filter(r => r.isActive).length;

    // --- Global File Upload & Routing ---
    const handleFileUploadGlobal = async (file: File) => {
        if (!file) return;

        const ext = file.name.split('.').pop()?.toLowerCase() || '';

        // Handle images -> Canvas Store
        if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
            useDocumentStore.getState().setFileMetadata(file.name, 'image');
            const reader = new FileReader();
            reader.onload = (e) => {
                if (e.target?.result) {
                    useCanvasStore.getState().setImageSrc(e.target.result as string);
                    router.push('/redact');
                }
            };
            reader.readAsDataURL(file);
            return;
        }

        // Handle PDFs -> Canvas Store
        if (ext === 'pdf') {
            useDocumentStore.getState().setFileMetadata(file.name, 'pdf');
            try {
                const images = await convertPdfToImages(file);
                if (images.length > 0) {
                    useCanvasStore.getState().setImageSrc(images[0]);
                    router.push('/redact');
                }
            } catch (error) {
                console.error("PDF Parsing Error:", error);
                alert("Failed to render PDF. Ensure it is a valid document.");
            }
            return;
        }

        // Handle texts -> Document Store
        try {
            const { text, type, name } = await extractTextFromFile(file);
            setRawText(text);
            useDocumentStore.getState().setFileMetadata(name, type);
            // Redirect user to the workspace immediately after loading into the buffer
            router.push('/redact');
        } catch (error) {
            console.error("Error parsing document:", error);
            alert("This format is currently unsupported by the Ciphera engine.");
        }
    };

    return (
        <div className="w-full p-6 md:p-12 font-sans selection:bg-[#FFA500] selection:text-black">
            <main className="max-w-6xl mx-auto space-y-8">

                {/* Header (Contextual, no nav) */}
                <header className="flex items-center justify-between pb-4 border-b border-[#3B3B3B]">
                    <div>
                        <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-3">
                            <Lock className="w-6 h-6 text-[#FFA500]" />
                            Ciphera Workspace
                        </h1>
                        <p className="text-sm text-gray-400 mt-1">Local Data Anonymization Engine</p>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1E1E1E] border border-[#3B3B3B] rounded-full">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-xs font-mono text-gray-300">SYSTEM.ONLINE</span>
                    </div>
                </header>

                {/* 1. The Telemetry Row (System Overview) */}
                <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-[#1E1E1E] border border-[#3B3B3B] rounded-2xl p-6 transition-all duration-300 hover:border-[#FFA500]/50 hover:-translate-y-1">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-medium text-gray-400">Files Processed</h3>
                            <FileText className="w-5 h-5 text-gray-500" />
                        </div>
                        <p className="text-3xl font-mono text-white">1,042</p>
                        <p className="text-xs text-emerald-400 mt-2 font-mono flex items-center gap-1">
                            <Activity className="w-3 h-3" /> +12% this week
                        </p>
                    </div>

                    <div className="bg-[#1E1E1E] border border-[#3B3B3B] rounded-2xl p-6 transition-all duration-300 hover:border-[#FFA500]/50 hover:-translate-y-1">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-medium text-gray-400">Rules Active</h3>
                            <ShieldCheck className="w-5 h-5 text-[#FFA500]" />
                        </div>
                        <p className="text-3xl font-mono text-white">{activeRulesCount}</p>
                        <p className="text-xs text-gray-500 mt-2 font-mono">Custom RegEx + NLP loaded</p>
                    </div>

                    <div className="bg-[#1E1E1E] border border-[#3B3B3B] rounded-2xl p-6 transition-all duration-300 hover:border-[#FFA500]/50 hover:-translate-y-1">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-medium text-gray-400">Engine Status</h3>
                            <Activity className="w-5 h-5 text-emerald-500" />
                        </div>
                        <p className="text-3xl font-mono text-white">Secure</p>
                        <p className="text-xs text-gray-500 mt-2 font-mono">Zero external connections</p>
                    </div>
                </section>

                {/* 2. The Spatial Dropzone */}
                <section className={`relative group bg-[#1E1E1E] border-2 border-dashed rounded-3xl p-16 flex flex-col
            items-center justify-center text-center transition-all duration-500 ease-out cursor-pointer ${isDragging
                        ? 'border-[#FFA500] bg-[#FFA500]/5' : 'border-[#3B3B3B] hover:border-[#FFA500]/70 hover:bg-[#252525]'}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                            handleFileUploadGlobal(e.dataTransfer.files[0]);
                        }
                    }}
                >
                    <input
                        type="file"
                        accept=".txt,.csv,.json,.md,.docx,.pdf,.png,.jpg,.jpeg,.webp"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        onChange={(e) => {
                            if (e.target.files?.length) handleFileUploadGlobal(e.target.files[0]);
                        }}
                    />
                    <div className="absolute inset-0 bg-[#FFA500] opacity-0 group-hover:opacity-5 blur-[100px] transition-opacity duration-700 pointer-events-none rounded-3xl"></div>

                    <div className={`p-5 rounded-full mb-6 transition-all duration-300 ${isDragging
                        ? 'bg-[#FFA500] text-black scale-110' : 'bg-[#2A2A2A] text-[#FFA500] group-hover:scale-105'}`}>
                        <UploadCloud className="w-10 h-10" />
                    </div>

                    <h2 className="text-xl font-medium text-white mb-2">Initialize Anonymization Protocol</h2>
                    <p className="text-gray-400 max-w-md mb-6">
                        Drag & drop raw documents here, or <span className="text-[#FFA500] group-hover:underline">browse local files</span>. Processing occurs entirely offline.
                    </p>

                    <div className="flex gap-3 text-xs font-mono text-gray-500">
                        <span className="bg-[#2A2A2A] px-2 py-1 rounded">.PDF</span>
                        <span className="bg-[#2A2A2A] px-2 py-1 rounded">.CSV</span>
                        <span className="bg-[#2A2A2A] px-2 py-1 rounded">.DOCX</span>
                        <span className="bg-[#2A2A2A] px-2 py-1 rounded">.JSON</span>
                    </div>
                </section>

                {/* 3. The Audit Ledger (Recent Documents) */}
                <section className="bg-[#1E1E1E] border border-[#3B3B3B] rounded-2xl overflow-hidden">
                    <div className="p-6 border-b border-[#3B3B3B] flex justify-between items-center">
                        <h3 className="text-lg font-medium text-white">Audit Ledger</h3>
                        <button className="text-sm text-[#FFA500] hover:text-white transition-colors duration-200">View All →</button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[#3B3B3B] bg-[#212121]/50 text-xs font-medium text-gray-400 uppercase tracking-wider">
                                    <th className="p-4 pl-6 font-mono">Ref ID</th>
                                    <th className="p-4 font-sans">Document Name</th>
                                    <th className="p-4 font-mono">Size</th>
                                    <th className="p-4 font-mono">Timestamp</th>
                                    <th className="p-4 pr-6 text-right font-sans">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#3B3B3B]/50">
                                {recentFiles.map((file) => (
                                    <tr key={file.id} className="hover:bg-[#252525] transition-colors duration-200 group cursor-pointer">
                                        <td className="p-4 pl-6 text-sm font-mono text-gray-500 group-hover:text-gray-300 transition-colors">{file.id}</td>
                                        <td className="p-4 text-sm font-medium text-gray-200 flex items-center gap-3">
                                            <FileText className="w-4 h-4 text-gray-500" />
                                            {file.name}
                                        </td>
                                        <td className="p-4 text-sm font-mono text-gray-400">{file.size}</td>
                                        <td className="p-4 text-sm font-mono text-gray-400">{file.date}</td>
                                        <td className="p-4 pr-6 text-right">
                                            {file.status === 'Completed' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    COMPLETED
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-[#FFA500]/10 text-[#FFA500] border border-[#FFA500]/20">
                                                    <Clock className="w-3.5 h-3.5 animate-pulse" />
                                                    PROCESSING
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

            </main>
        </div>
    );
}

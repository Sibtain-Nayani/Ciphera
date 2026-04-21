"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
    Download, FileText, Settings2, Eye, EyeOff, Shield,
    ChevronLeft, UploadCloud, ChevronUp, ChevronDown, X,
    AlertTriangle, Trash2, CheckCircle2, ChevronRight,
    ScanFace, Layers,
} from 'lucide-react';
import { useDocumentStore, RuleType, DocumentState } from '@/store/documentStore';
import { useCanvasStore } from '@/store/canvasStore';
import { useUiStore } from '@/store/uiStore';
import { redactionEngine, Token, sessionMapper } from '@/lib/redactionEngine';
import { useSessionStore } from '@/store/sessionStore';
import { AnimatedToken, PlainTextToken } from '@/components/redact/AnimatedToken';
import { extractTextFromFile, exportRedactedText, exportVisualCanvas } from '@/lib/fileFormat';
import { convertPdfToImages, PdfPageData } from '@/lib/pdfRenderer';
import { extractOcrData, mapOcrToShapes } from '@/lib/ocrEngine';
import dynamic from 'next/dynamic';

const CanvasEngine = dynamic(
    () => import('@/components/canvas/CanvasEngine').then(m => m.CanvasEngine),
    { ssr: false }
);

type LoaderStage = 'idle' | 'rendering' | 'ocr' | 'analyzing' | 'mapping' | 'face';

const LOADER_MESSAGES: Record<LoaderStage, { title: string; sub: string }> = {
    idle:      { title: '',                        sub: ''                                    },
    rendering: { title: 'Rendering PDF Pages…',    sub: 'Converting pages to high-res images' },
    ocr:       { title: 'Running OCR Pipeline…',   sub: 'Extracting text with Tesseract WASM'  },
    analyzing: { title: 'Analyzing Document…',     sub: 'V3 multi-layer detection pipeline'    },
    mapping:   { title: 'Mapping Redactions…',     sub: 'Placing redaction overlays on canvas' },
    face:      { title: 'Detecting Faces…',        sub: 'Running local OpenCV face detection'  },
};

export default function WorkspacePage() {
    const {
        rawText, setRawText, previewMode, rules, setPreviewMode,
        toggleRule, fileType, fileName, customRules, clearWorkspace,
    } = useDocumentStore();

    const [tokens,          setTokens]          = useState<Token[]>([]);
    const [isDragging,      setIsDragging]       = useState(false);
    const [isDrawerOpen,    setIsDrawerOpen]     = useState(false);
    const [loaderStage,     setLoaderStage]      = useState<LoaderStage>('idle');
    const [redactionFailed, setRedactionFailed]  = useState(false);
    const [hasReviewed,     setHasReviewed]      = useState(false);
    const [pdfPages,        setPdfPages]         = useState<PdfPageData[]>([]);
    const [currentPage,     setCurrentPage]      = useState(1);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const { ocrResult } = useCanvasStore();
    const { addAuditLog, incrementMetrics } = useSessionStore();

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'w') {
                e.preventDefault(); handleClearWorkspace();
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'l') {
                e.preventDefault();
                setPreviewMode(useDocumentStore.getState().previewMode === 'original' ? 'redacted' : 'original');
            }
            if (fileType === 'pdf' && pdfPages.length > 1) {
                if (e.key === 'ArrowRight') goToPage(currentPage + 1);
                if (e.key === 'ArrowLeft')  goToPage(currentPage - 1);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [clearWorkspace, setPreviewMode, currentPage, pdfPages, fileType]);

    const handleClearWorkspace = () => {
        clearWorkspace();
        useCanvasStore.getState().setImageSrc(null);
        useCanvasStore.getState().setShapes([]);
        useCanvasStore.getState().setOcrResult(null);
        setPdfPages([]);
        setCurrentPage(1);
        setLoaderStage('idle');
    };

    useEffect(() => { sessionMapper.clear(); setHasReviewed(false); }, [rawText, fileType]);

    useEffect(() => {
        const timer = setTimeout(async () => {
            const result = await redactionEngine.tokenize(rawText, rules, customRules);
            if (result.failed) { setRedactionFailed(true); setTokens([]); }
            else { setRedactionFailed(false); setTokens(result.tokens); }
        }, 500);
        return () => clearTimeout(timer);
    }, [rawText, rules, customRules]);

    const activeRulesCount       = Object.values(rules).filter(r => r.isActive).length;
    const activeCustomRulesCount = customRules.filter(r => r.isActive).length;
    const totalMatches           = tokens.filter(t => t.type !== 'text').length;

    useEffect(() => {
        if ((fileType === 'image' || fileType === 'pdf') && ocrResult) {
            if (activeRulesCount > 0 || activeCustomRulesCount > 0) {
                mapOcrToShapes(ocrResult, rules, customRules).then(autoShapes => {
                    useCanvasStore.getState().setShapes(prev => [
                        ...prev.filter(s => !s.id.startsWith('auto_')),
                        ...autoShapes,
                    ]);
                });
            } else {
                useCanvasStore.getState().setShapes(prev => prev.filter(s => !s.id.startsWith('auto_')));
            }
        }
    }, [ocrResult, rules, fileType, activeRulesCount, customRules, activeCustomRulesCount]);

    // FIX: loader stays up through OCR + mapping — boxes never appear after loader disappears
    const processImageForOcr = async (dataUrl: string) => {
        try {
            setLoaderStage('ocr');
            const ocrData = await extractOcrData(dataUrl);
            useDocumentStore.getState().setRawText(ocrData.rawText);
            useCanvasStore.getState().setOcrResult(ocrData);
            setLoaderStage('mapping');
            const autoShapes = await mapOcrToShapes(ocrData, rules, customRules);
            useCanvasStore.getState().setShapes(prev => [
                ...prev.filter(s => !s.id.startsWith('auto_')),
                ...autoShapes,
            ]);
        } catch (e) {
            console.error("OCR failed:", e);
            useUiStore.getState().addToast("OCR pipeline failed.", "error");
        } finally {
            setLoaderStage('idle');
        }
    };

    const goToPage = async (page: number) => {
        if (page < 1 || page > pdfPages.length) return;
        setCurrentPage(page);
        const pageData = pdfPages[page - 1];
        useCanvasStore.getState().setImageSrc(pageData.dataUri);
        useCanvasStore.getState().setShapes([]);
        useCanvasStore.getState().setOcrResult(null);
        await processImageForOcr(pageData.dataUri);
    };

    const handleFileUpload = async (file: File) => {
        if (!file) return;
        const ext = file.name.split('.').pop()?.toLowerCase() || '';

        if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
            useDocumentStore.getState().setFileMetadata(file.name, 'image', file);
            setPdfPages([]);
            const reader = new FileReader();
            reader.onload = async (e) => {
                if (e.target?.result) {
                    const dataUrl = e.target.result as string;
                    useCanvasStore.getState().setImageSrc(dataUrl);
                    await processImageForOcr(dataUrl);
                }
            };
            reader.readAsDataURL(file);
            return;
        }

        if (ext === 'pdf') {
            useDocumentStore.getState().setFileMetadata(file.name, 'pdf', file);
            setLoaderStage('rendering');
            try {
                const pages = await convertPdfToImages(file, 2.0);
                setPdfPages(pages);
                setCurrentPage(1);
                if (pages.length > 0) {
                    useCanvasStore.getState().setImageSrc(pages[0].dataUri);
                    await processImageForOcr(pages[0].dataUri);
                }
            } catch (error) {
                console.error("PDF render error:", error);
                useUiStore.getState().addToast("Failed to render PDF.", "error");
                setLoaderStage('idle');
            }
            return;
        }

        try {
            const { text, type, name } = await extractTextFromFile(file);
            setRawText(text);
            useDocumentStore.getState().setFileMetadata(name, type, file);
        } catch (error) {
            useUiStore.getState().addToast("File format not supported.", "error");
        }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        if (e.dataTransfer.files?.length) handleFileUpload(e.dataTransfer.files[0]);
    };

    const handleFaceRedaction = async () => {
        const currentImageSrc = useCanvasStore.getState().imageSrc;
        if (!currentImageSrc) { useUiStore.getState().addToast("No image loaded.", "warning"); return; }
        setLoaderStage('face');
        try {
            const res      = await fetch(currentImageSrc);
            const blob     = await res.blob();
            const formData = new FormData();
            formData.append('file', blob, 'image.png');
            formData.append('mode', 'blur');
            formData.append('sensitivity', 'medium');
            const response = await fetch('http://127.0.0.1:8000/api/v3/redact-image', { method: 'POST', body: formData });
            if (!response.ok) throw new Error(`${response.status}`);
            const data = await response.json();
            if (data.face_count === 0) {
                useUiStore.getState().addToast("No faces detected.", "info");
                return;
            }
            const faceShapes = data.faces.map((face: any, i: number) => ({
                id: `face_${Date.now()}_${i}`, type: 'blackout' as const,
                x: face.x, y: face.y, width: face.width, height: face.height,
            }));
            useCanvasStore.getState().setShapes(prev => [
                ...prev.filter(s => !s.id.startsWith('face_')),
                ...faceShapes,
            ]);
            useUiStore.getState().addToast(`${data.face_count} face${data.face_count > 1 ? 's' : ''} redacted.`, 'success');
        } catch (error) {
            useUiStore.getState().addToast("Face redaction failed. Check backend.", "error");
        } finally {
            setLoaderStage('idle');
        }
    };

    const exportSecureFile = async (formatOverride?: DocumentState['fileType']) => {
        if (redactionFailed) { useUiStore.getState().addToast('Engine offline. Export blocked.', 'error'); return; }
        const { fileType, fileName } = useDocumentStore.getState();
        const redactedText = tokens.map(token => {
            if (token.type === 'text') return token.value;
            const isBuiltIn  = token.type in rules;
            const customRule = customRules.find(r => `custom_${r.id}` === token.type || r.id === token.type);
            const isActive   = isBuiltIn ? rules[token.type as RuleType]?.isActive : customRule?.isActive;
            if (!isActive) return token.value;
            const action = isBuiltIn ? (rules[token.type as RuleType]?.action || 'replace') : (customRule?.action || 'replace');
            return redactionEngine.getRedactionReplacement(token.type, token.value, action, customRules);
        }).join('');
        const targetFormat = formatOverride || fileType;
        if (fileType === 'image' || fileType === 'pdf') {
            const cs = useCanvasStore.getState();
            if (!cs.stageRef) { useUiStore.getState().addToast("Canvas not initialized.", "warning"); return; }
            cs.setSelectedShapeId(null);
            setTimeout(async () => {
                try {
                    const fmtMap: Record<string, string> = { pdf: 'pdf', image: 'png', png: 'png', jpg: 'jpg', jpeg: 'jpg' };
                    const finalExt = fmtMap[targetFormat] || 'png';
                    const stage = cs.stageRef!; const origScale = stage.scaleX(); const imgDims = cs.imageDimensions;
                    stage.scale({ x: 1, y: 1 }); stage.position({ x: 0, y: 0 });
                    const dataUrl = stage.toDataURL({ x: 0, y: 0, width: imgDims?.width ?? stage.width(), height: imgDims?.height ?? stage.height(), pixelRatio: 1.0 });
                    stage.scale({ x: origScale, y: origScale });
                    const origFile = useDocumentStore.getState().originalFile;
                    const shapes = useCanvasStore.getState().shapes;
                    const finalDims = imgDims || { width: stage.width(), height: stage.height() };
                    await exportVisualCanvas(dataUrl, fileName, finalExt, origFile, shapes, finalDims);
                    addAuditLog({ id: 'RUN-' + Math.floor(Math.random() * 10000), name: fileName, size: origFile ? (origFile.size / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown', date: new Date().toLocaleString(), status: 'Completed', entitiesDiscovered: shapes.length, rulesApplied: ['Visual Extractor'] });
                    incrementMetrics(1, shapes.length);
                    useUiStore.getState().addToast(`Exported ${shapes.length} masked entities`, 'success');
                } catch { useUiStore.getState().addToast("Export failed.", "error"); }
            }, 50);
            return;
        }
        await exportRedactedText(redactedText, fileName, targetFormat as any);
        addAuditLog({ id: 'RUN-' + Math.floor(Math.random() * 10000), name: fileName, size: (new Blob([rawText]).size / 1024).toFixed(1) + ' KB', date: new Date().toLocaleString(), status: 'Completed', entitiesDiscovered: tokens.filter(t => t.type !== 'text').length, rulesApplied: Array.from(new Set(tokens.filter(t => t.type !== 'text').map(t => t.type))) });
        incrementMetrics(1, tokens.filter(t => t.type !== 'text').length);
        useUiStore.getState().addToast(`Protected ${tokens.filter(t => t.type !== 'text').length} entities`, 'success');
    };

    const [builtinOpen,    setBuiltinOpen]    = useState(true);
    const [customOpen,     setCustomOpen]     = useState(true);
    const [addRuleOpen,    setAddRuleOpen]    = useState(false);
    const [newRuleLabel,   setNewRuleLabel]   = useState('');
    const [newRulePattern, setNewRulePattern] = useState('');
    const [newRuleColor,   setNewRuleColor]   = useState<import('@/store/documentStore').PresetColor>('#3B82F6');
    const { addCustomRule, toggleCustomRule, removeCustomRule } = useDocumentStore();
    const handleAddRule = () => {
        if (!newRuleLabel.trim() || !newRulePattern.trim()) return;
        try { new RegExp(newRulePattern); } catch { return; }
        addCustomRule({ label: newRuleLabel, pattern: newRulePattern, action: 'replace', isActive: true, color: newRuleColor });
        setNewRuleLabel(''); setNewRulePattern(''); setAddRuleOpen(false);
    };
    const PRESET_COLORS_LIST: import('@/store/documentStore').PresetColor[] = ['#3B82F6','#10B981','#8B5CF6','#F43F5E','#F59E0B','#06B6D4','#EC4899','#6366F1'];

    const ALL_RULES = [
        { id: 'email',      label: 'Email Addresses', icon: '📧' },
        { id: 'phone',      label: 'Phone Numbers',   icon: '📱' },
        { id: 'creditCard', label: 'Credit Cards',    icon: '💳' },
        { id: 'ssn',        label: 'SSN',             icon: '🔒' },
        { id: 'names',      label: 'Names (NLP)',      icon: '👤' },
        { id: 'dob',        label: 'Date of Birth',   icon: '🎂' },
        { id: 'aadhaar',    label: 'Aadhaar',         icon: '🪪' },
        { id: 'pan',        label: 'PAN',             icon: '🔑' },
        { id: 'gst',        label: 'GST',             icon: '🏢' },
        { id: 'ifsc',       label: 'IFSC',            icon: '🏦' },
        { id: 'voterId',    label: 'Voter ID',        icon: '🗳️' },
        { id: 'passport',   label: 'Passport',        icon: '📘' },
        { id: 'vehicleReg', label: 'Vehicle Reg',     icon: '🚗' },
    ];

    const configPanelContent = (
        <>
            <div className="p-5 md:p-6 border-b border-[#3B3B3B] shrink-0">
                <div className="flex items-center justify-between md:justify-start gap-3">
                    <div className="flex items-center gap-3">
                        <Settings2 className="w-5 h-5 text-[#FFA500]" />
                        <h2 className="text-lg font-medium text-white">Redaction Workspace</h2>
                    </div>
                    <button onClick={() => setIsDrawerOpen(false)} className="md:hidden p-2 text-gray-400 hover:text-white hover:bg-[#3B3B3B] rounded-lg transition-colors cursor-pointer"><X className="w-5 h-5" /></button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-4">
                <div className="rounded-xl border border-[#3B3B3B] bg-[#1A1A1A] overflow-hidden">
                    <button onClick={() => setBuiltinOpen(!builtinOpen)} className="w-full flex items-center justify-between p-4 hover:bg-[#222] transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                            <Shield className="w-4 h-4 text-[#FFA500]" />
                            <span className="text-sm font-medium text-white">Built-in Rules</span>
                            <span className="px-2 py-0.5 rounded-full bg-[#FFA500]/15 text-[#FFA500] text-[10px] font-mono border border-[#FFA500]/20">{activeRulesCount}/{Object.keys(rules).length}</span>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${builtinOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <div className={`transition-all duration-300 ease-in-out overflow-hidden ${builtinOpen ? 'max-h-[1400px] opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="px-3 pb-3 space-y-1.5">
                            {ALL_RULES.map((rule) => {
                                const ruleConfig = rules[rule.id as RuleType];
                                if (!ruleConfig) return null;
                                const isActive = ruleConfig.isActive;
                                const matchCount = tokens.filter(t => t.type === rule.id).length;
                                return (
                                    <div key={rule.id} onClick={() => toggleRule(rule.id as RuleType)}
                                        className={`flex items-center justify-between p-3 rounded-lg transition-all duration-200 cursor-pointer select-none group ${isActive ? 'bg-[#FFA500]/8 hover:bg-[#FFA500]/12' : 'hover:bg-[#2A2A2A]'}`}>
                                        <div className="flex items-center gap-2.5">
                                            <span className="text-sm">{rule.icon}</span>
                                            <span className={`text-sm ${isActive ? 'text-white font-medium' : 'text-gray-400'}`}>{rule.label}</span>
                                            {isActive && matchCount > 0 && (
                                                <span className="px-1.5 py-0.5 rounded bg-[#FFA500]/20 text-[#FFA500] text-[9px] font-mono font-bold">{matchCount}</span>
                                            )}
                                        </div>
                                        <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${isActive ? 'bg-[#FFA500]' : 'bg-[#3B3B3B]'}`}>
                                            <div className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform duration-200 shadow-sm ${isActive ? 'translate-x-4' : ''}`} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-[#3B3B3B] bg-[#1A1A1A] overflow-hidden">
                    <button onClick={() => setCustomOpen(!customOpen)} className="w-full flex items-center justify-between p-4 hover:bg-[#222] transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                            <FileText className="w-4 h-4 text-[#8B5CF6]" />
                            <span className="text-sm font-medium text-white">Custom Regex Rules</span>
                            {customRules.length > 0 && <span className="px-2 py-0.5 rounded-full bg-[#8B5CF6]/15 text-[#8B5CF6] text-[10px] font-mono border border-[#8B5CF6]/20">{customRules.filter(r => r.isActive).length}/{customRules.length}</span>}
                        </div>
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${customOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <div className={`transition-all duration-300 ease-in-out overflow-hidden ${customOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="px-3 pb-3 space-y-1.5">
                            {customRules.length === 0 && !addRuleOpen && <p className="text-xs text-gray-500 text-center py-4 italic">No custom rules yet.</p>}
                            {customRules.map(rule => {
                                const matchCount = tokens.filter(t => t.type === `custom_${rule.id}` || t.type === rule.id).length;
                                return (
                                    <div key={rule.id} className={`flex items-center justify-between p-3 rounded-lg transition-all duration-200 group ${rule.isActive ? 'bg-white/[0.03] hover:bg-white/[0.06]' : 'hover:bg-[#2A2A2A]'}`}>
                                        <div className="flex items-center gap-2.5 min-w-0 flex-1" onClick={() => toggleCustomRule(rule.id)} style={{ cursor: 'pointer' }}>
                                            <div className="w-3 h-3 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-[#1A1A1A]" style={{ backgroundColor: rule.color }} />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`text-sm truncate ${rule.isActive ? 'text-white font-medium' : 'text-gray-400'}`}>{rule.label}</span>
                                                    {rule.isActive && matchCount > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0" style={{ backgroundColor: `${rule.color}33`, color: rule.color }}>{matchCount}</span>}
                                                </div>
                                                <p className="text-[10px] text-gray-600 font-mono truncate">{rule.pattern}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                            <div onClick={() => toggleCustomRule(rule.id)} className={`relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer ${rule.isActive ? '' : 'bg-[#3B3B3B]'}`} style={rule.isActive ? { backgroundColor: rule.color } : {}}>
                                                <div className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform duration-200 shadow-sm ${rule.isActive ? 'translate-x-4' : ''}`} />
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); removeCustomRule(rule.id); }} className="p-1 text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                                        </div>
                                    </div>
                                );
                            })}
                            {addRuleOpen ? (
                                <div className="mt-2 p-3 rounded-lg bg-[#212121] border border-[#3B3B3B] space-y-3">
                                    <input type="text" placeholder="Rule name" value={newRuleLabel} onChange={e => setNewRuleLabel(e.target.value)} className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#3B3B3B] text-sm text-white rounded-lg placeholder:text-gray-600 focus:border-[#FFA500]/50 focus:outline-none transition-colors" />
                                    <input type="text" placeholder="Regex pattern" value={newRulePattern} onChange={e => setNewRulePattern(e.target.value)} className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#3B3B3B] text-sm text-white font-mono rounded-lg placeholder:text-gray-600 focus:border-[#FFA500]/50 focus:outline-none transition-colors" />
                                    <div className="flex items-center gap-1.5">{PRESET_COLORS_LIST.map(c => <button key={c} onClick={() => setNewRuleColor(c)} className={`w-6 h-6 rounded-full transition-all cursor-pointer ${newRuleColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#212121] scale-110' : 'opacity-60 hover:opacity-100'}`} style={{ backgroundColor: c }} />)}</div>
                                    <div className="flex gap-2">
                                        <button onClick={handleAddRule} disabled={!newRuleLabel.trim() || !newRulePattern.trim()} className="flex-1 py-2 bg-[#FFA500] hover:bg-[#ffb733] text-black text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">Add Rule</button>
                                        <button onClick={() => { setAddRuleOpen(false); setNewRuleLabel(''); setNewRulePattern(''); }} className="px-4 py-2 text-gray-400 hover:text-white bg-[#2A2A2A] hover:bg-[#3B3B3B] text-sm rounded-lg transition-colors cursor-pointer">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <button onClick={() => setAddRuleOpen(true)} className="w-full mt-1 py-2.5 flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-white bg-[#212121] hover:bg-[#2A2A2A] border border-dashed border-[#3B3B3B] hover:border-[#FFA500]/40 rounded-lg transition-all cursor-pointer">
                                    <span className="text-[#FFA500] text-lg leading-none">+</span> Add Custom Rule
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 rounded-xl border border-[#3B3B3B] bg-[#212121] flex items-start gap-3">
                    <EyeOff className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <h4 className="text-sm font-medium text-gray-300">{(activeRulesCount + activeCustomRulesCount) > 0 ? "Local Presidio Engine Active" : "Scanning Halted"}</h4>
                        <p className="text-xs text-gray-500 leading-relaxed">{(activeRulesCount + activeCustomRulesCount) > 0 ? "FastAPI Presidio local server is scanning raw inputs and feeding AST arrays to React." : "Enable rules to begin local protocol data discovery and parsing."}</p>
                    </div>
                </div>
            </div>
        </>
    );

    const loaderInfo = LOADER_MESSAGES[loaderStage];
    const isLoading  = loaderStage !== 'idle';

    return (
        <div className="w-full font-sans flex flex-col md:flex-row h-[calc(100vh-64px)] md:h-screen selection:bg-[#FFA500] selection:text-black relative">
            <section className="w-full md:w-[60%] lg:w-[65%] flex flex-col border-r border-[#3B3B3B] h-full">
                <header className="flex items-center justify-between p-3 px-4 md:p-4 md:px-6 bg-[#1E1E1E] border-b border-[#3B3B3B] shrink-0">
                    <div className="flex items-center gap-3 md:gap-4">
                        <button className="p-2 -ml-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-[#2A2A2A] cursor-pointer"><ChevronLeft className="w-5 h-5" /></button>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-[#FFA500]" /><h1 className="text-sm font-medium text-white">{fileName || 'Workspace.txt'}</h1></div>
                            <span className="text-xs font-mono text-gray-500 mt-0.5 hidden md:block">{fileType === 'pdf' || fileType === 'image' ? 'Canvas Redaction Layer' : 'Live Editable Buffer'}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3">
                        <input type="file" accept=".txt,.csv,.json,.md,.docx,.pdf,.png,.jpg,.jpeg,.webp" className="hidden" ref={fileInputRef} onChange={(e) => { if (e.target.files?.length) handleFileUpload(e.target.files[0]); }} />
                        <button onClick={handleClearWorkspace} className="flex items-center gap-2 text-gray-400 hover:text-red-400 bg-transparent hover:bg-red-500/10 px-3 py-2 rounded-md font-medium text-sm transition-all duration-200 cursor-pointer border border-transparent hover:border-red-500/30"><Trash2 className="w-4 h-4" /><span className="hidden lg:inline text-xs">Clear</span></button>
                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 text-gray-300 hover:text-white bg-[#2A2A2A] hover:bg-[#3B3B3B] px-3 py-2 md:px-4 rounded-md font-medium text-sm transition-all duration-200 cursor-pointer"><UploadCloud className="w-4 h-4" /><span className="hidden sm:inline">Load File</span></button>
                        {(fileType === 'image' || fileType === 'pdf') && (
                            <button onClick={handleFaceRedaction} className="flex items-center gap-2 text-gray-300 hover:text-white bg-[#2A2A2A] hover:bg-purple-500/20 hover:border-purple-500/40 border border-transparent px-3 py-2 rounded-md font-medium text-sm transition-all duration-200 cursor-pointer" title="Detect and redact faces"><ScanFace className="w-4 h-4" /><span className="hidden sm:inline">Faces</span></button>
                        )}
                        <div className="h-6 w-px bg-[#3B3B3B] mx-2 hidden md:block" />
                        <button onClick={() => setHasReviewed(!hasReviewed)} className={`hidden md:flex items-center gap-2 px-3 py-2 rounded-md transition-all cursor-pointer ${hasReviewed ? 'text-green-400 bg-green-400/10 border-green-400/50' : 'text-gray-400 bg-[#2A2A2A] hover:text-gray-200'} border border-transparent`}><CheckCircle2 className={`w-4 h-4 ${hasReviewed ? 'fill-green-400/20' : ''}`} /><span className="text-xs font-medium">Reviewed</span></button>
                        <div className="relative group">
                            <button onClick={() => exportSecureFile()} disabled={redactionFailed || !hasReviewed} className={`flex items-center gap-2 px-3 py-2 md:px-4 rounded-md font-medium text-sm transition-all duration-200 ${redactionFailed || !hasReviewed ? 'bg-gray-600/50 text-gray-500 cursor-not-allowed border border-gray-600/30' : 'bg-[#FFA500] hover:bg-[#ffb733] text-black shadow-[0_0_15px_rgba(255,165,0,0.2)] hover:shadow-[0_0_20px_rgba(255,165,0,0.4)] hover:-translate-y-0.5 cursor-pointer'}`}><Download className="w-4 h-4" /><span className="hidden sm:inline">Export Secure</span><ChevronDown className="w-3 h-3 ml-1 opacity-60" /></button>
                            <div className="absolute top-full right-0 mt-2 w-32 bg-[#212121] border border-[#3B3B3B] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 overflow-hidden">
                                {((fileType === 'image' || fileType === 'pdf') ? ['pdf', 'png', 'jpg'] as const : ['docx', 'pdf', 'txt', 'md', 'csv', 'json'] as const).map(fmt => (
                                    <button key={fmt} disabled={redactionFailed || !hasReviewed} onClick={(e) => { e.stopPropagation(); exportSecureFile(fmt as any); }} className="block w-full text-left px-4 py-2 text-xs font-mono text-gray-300 hover:bg-[#3B3B3B] hover:text-white uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed">.{fmt}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                </header>

                <div className="bg-[#1A1A1A] border-b border-[#3B3B3B] px-4 py-2 flex items-center justify-between shadow-inner">
                    <div className="flex items-center gap-4 overflow-x-auto no-scrollbar whitespace-nowrap flex-1">
                        {Object.entries(tokens.reduce((acc, t) => { if (t.type !== 'text') acc[t.type] = (acc[t.type] || 0) + 1; return acc; }, {} as Record<string, number>)).slice(0, 5).map(([type, count]) => {
                            const isCustom = type.startsWith('custom_');
                            const label = isCustom ? (customRules.find(r => `custom_${r.id}` === type)?.label || 'Custom') : (type.charAt(0).toUpperCase() + type.slice(1));
                            const color = isCustom ? (customRules.find(r => `custom_${r.id}` === type)?.color || '#8B5CF6') : (type === 'email' ? '#3B82F6' : type === 'phone' ? '#10B981' : type === 'creditCard' ? '#F59E0B' : type === 'aadhaar' ? '#F97316' : type === 'pan' ? '#EAB308' : type === 'dob' ? '#EF4444' : '#06B6D4');
                            return (
                                <div key={type} className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#2A2A2A] border border-[#3B3B3B]/50 shrink-0">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                                    <span className="text-[11px] font-medium text-gray-300">{count} {label}</span>
                                </div>
                            );
                        })}
                        {totalMatches === 0 && <span className="text-xs text-gray-500 font-mono italic">No sensitive entities detected...</span>}
                    </div>

                    {fileType === 'pdf' && pdfPages.length > 1 && (
                        <div className="flex items-center gap-2 shrink-0 ml-4 pl-4 border-l border-[#3B3B3B]">
                            <Layers className="w-3.5 h-3.5 text-gray-500" />
                            <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors rounded"><ChevronLeft className="w-4 h-4" /></button>
                            <span className="text-xs font-mono text-gray-300 min-w-[60px] text-center">{currentPage} / {pdfPages.length}</span>
                            <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === pdfPages.length} className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors rounded"><ChevronRight className="w-4 h-4" /></button>
                            {pdfPages.length <= 8 && <div className="flex gap-1 ml-1">{pdfPages.map((_, i) => <button key={i} onClick={() => goToPage(i + 1)} className={`w-2 h-2 rounded-full transition-all cursor-pointer ${currentPage === i + 1 ? 'bg-[#FFA500]' : 'bg-[#3B3B3B] hover:bg-gray-400'}`} />)}</div>}
                        </div>
                    )}
                </div>

                <div className={`flex-1 relative bg-[#212121] transition-colors duration-300 ${fileType === 'image' || fileType === 'pdf' ? 'overflow-hidden' : 'overflow-y-auto'} ${isDragging ? 'bg-[#2A2A2A]' : ''}`} onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>
                    {isDragging && <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#FFA500]/10 backdrop-blur-sm border-2 border-[#FFA500] border-dashed"><h2 className="text-xl font-medium text-[#FFA500] flex items-center gap-3"><UploadCloud className="w-8 h-8 animate-bounce" />Drop File to Parse</h2></div>}
                    {redactionFailed && <div className="absolute top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 py-3 bg-red-500/15 border-b border-red-500/30 backdrop-blur-sm"><AlertTriangle className="w-5 h-5 text-red-400 shrink-0" /><div><p className="text-sm font-medium text-red-400">Redaction Engine Offline</p><p className="text-xs text-red-400/70">Backend unreachable. Export blocked. Ensure server runs at localhost:8000.</p></div></div>}

                    {isLoading && (
                        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                            <div className="w-12 h-12 border-4 border-[#FFA500]/20 border-t-[#FFA500] rounded-full animate-spin mb-4" />
                            <h2 className="text-xl font-medium text-white tracking-wide">{loaderInfo.title}</h2>
                            <p className="text-sm text-gray-400 mt-2 font-mono">{loaderInfo.sub}</p>
                        </div>
                    )}

                    {fileType === 'image' || fileType === 'pdf' ? <CanvasEngine /> : (
                        <div className="relative w-full max-w-3xl mx-auto min-h-full">
                            <div className="relative w-full p-4 md:p-10 pb-32 md:pb-24">
                                <div className="font-mono text-[14px] leading-[1.75] break-words whitespace-pre-wrap pointer-events-none w-full min-h-[500px]">
                                    {tokens.map((token) => {
                                        if (token.type === 'text') return <PlainTextToken key={token.id} token={token} isRedacted={previewMode === 'redacted'} />;
                                        const customRule = customRules.find(r => `custom_${r.id}` === token.type || r.id === token.type);
                                        const action = rules[token.type as RuleType]?.action || customRule?.action || 'replace';
                                        return <AnimatedToken key={token.id} token={token} isRedacted={previewMode === 'redacted'} action={action} accentColor={customRule?.color} />;
                                    })}
                                    {'\n\n\n'}
                                </div>
                                {previewMode === 'original' && <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} className="absolute inset-4 md:inset-10 bottom-32 md:bottom-24 z-10 block bg-transparent text-gray-400 font-mono text-[14px] leading-[1.75] resize-none outline-none border-0 p-0 m-0 focus:ring-0 whitespace-pre-wrap break-words overflow-hidden" spellCheck="false" placeholder="Paste raw text here or drop a file..." />}
                            </div>
                        </div>
                    )}
                </div>

                <button onClick={() => setPreviewMode(previewMode === 'original' ? 'redacted' : 'original')} className="absolute bottom-[4.5rem] md:bottom-8 right-4 md:right-8 z-30 flex items-center gap-2 bg-[#212121] hover:bg-[#2A2A2A] text-white px-5 py-3.5 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.6)] border border-[#3B3B3B] transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer group">
                    {previewMode === 'original' ? <><Shield className="w-5 h-5 text-[#FFA500] group-hover:scale-110 transition-transform" /><span className="text-sm font-medium pr-1">Lock Document</span></> : <><Eye className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" /><span className="text-sm font-medium pr-1">Edit Original</span></>}
                </button>
            </section>

            <section className="hidden md:flex md:w-[40%] lg:w-[35%] flex-col h-full bg-[#1E1E1E]">{configPanelContent}</section>
            <button onClick={() => setIsDrawerOpen(!isDrawerOpen)} className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-3 py-3.5 bg-[#1E1E1E]/95 backdrop-blur-md border-t border-[#3B3B3B] cursor-pointer active:bg-[#2A2A2A] transition-colors" style={{ display: isDrawerOpen ? 'none' : undefined }}>
                <ChevronUp className="w-5 h-5 text-[#FFA500] animate-bounce" />
                <span className="text-sm font-medium text-white">Redaction Options</span>
                {totalMatches > 0 && <span className="px-2 py-0.5 rounded-full bg-[#FFA500]/20 text-[#FFA500] text-[10px] font-mono border border-[#FFA500]/30">{totalMatches} found</span>}
            </button>
            {isDrawerOpen && <div className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setIsDrawerOpen(false)} />}
            <div className={`md:hidden fixed left-0 right-0 bottom-0 z-50 bg-[#1E1E1E] border-t border-[#3B3B3B] rounded-t-2xl flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-in-out ${isDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`} style={{ maxHeight: '85vh' }}>
                <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 rounded-full bg-[#3B3B3B]" /></div>
                {configPanelContent}
            </div>
        </div>
    );
}
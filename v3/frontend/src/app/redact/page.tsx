"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Download, FileText, Settings2, Eye, EyeOff, Shield,
    ChevronLeft, UploadCloud, ChevronUp, ChevronDown, X,
    AlertTriangle, Trash2, CheckCircle2, ChevronRight,
    ScanFace, Layers, Mail, Phone, CreditCard, Lock,
    User, Calendar, Globe, Network, Fingerprint,
    BookKey, Building2, Landmark, Vote, Car, MapPin,
    Activity, Hash,
} from 'lucide-react';
import { useDocumentStore, RuleType, DocumentState } from '@/store/documentStore';
import { useCanvasStore } from '@/store/canvasStore';
import { useUiStore } from '@/store/uiStore';
import { redactionEngine, Token, sessionMapper } from '@/lib/redactionEngine';
import { useSessionStore } from '@/store/sessionStore';
import { AnimatedToken, PlainTextToken } from '@/components/redact/AnimatedToken';
import { extractTextFromFile, exportRedactedText, exportVisualCanvas } from '@/lib/fileFormat';
import { convertPdfToImages, PdfPageData } from '@/lib/pdfRenderer';
import { extractOcrData, mapOcrToShapes, removeShapesByRule } from '@/lib/ocrEngine';
import dynamic from 'next/dynamic';

const CanvasEngine = dynamic(
    () => import('@/components/canvas/CanvasEngine').then(m => m.CanvasEngine),
    { ssr: false }
);

// ── Loader stages ────────────────────────────────────────────────────────────
type LoaderStage = 'idle' | 'rendering' | 'ocr' | 'analyzing' | 'mapping' | 'face';
const LOADER_MSG: Record<LoaderStage, { title: string; sub: string }> = {
    idle:      { title: '',                       sub: '' },
    rendering: { title: 'Rendering PDF Pages…',   sub: 'Converting pages to high-res images' },
    ocr:       { title: 'Running OCR Pipeline…',  sub: 'Extracting text with Tesseract WASM' },
    analyzing: { title: 'Analyzing Document…',    sub: 'V3 multi-layer detection pipeline' },
    mapping:   { title: 'Mapping Redactions…',    sub: 'Placing overlays on canvas' },
    face:      { title: 'Detecting Faces…',       sub: 'Running OpenCV face detection' },
};

// ── Rule metadata ─────────────────────────────────────────────────────────────
interface RuleMeta {
    id:     RuleType;
    label:  string;
    icon:   React.ReactNode;
    color:  string;
}

const RULE_GROUPS: { label: string; accent: string; icon: React.ReactNode; rules: RuleMeta[] }[] = [
    {
        label:  'Identity & Contact',
        accent: '#3B82F6',
        icon:   <User className="w-3.5 h-3.5" />,
        rules: [
            { id: 'names',   label: 'Names (NLP)',    icon: <User className="w-3.5 h-3.5" />,     color: '#3B82F6' },
            { id: 'email',   label: 'Email',          icon: <Mail className="w-3.5 h-3.5" />,     color: '#60A5FA' },
            { id: 'phone',   label: 'Phone',          icon: <Phone className="w-3.5 h-3.5" />,    color: '#34D399' },
            { id: 'dob',     label: 'Date of Birth',  icon: <Calendar className="w-3.5 h-3.5" />, color: '#F87171' },
            { id: 'date',    label: 'General Dates',  icon: <Calendar className="w-3.5 h-3.5" />, color: '#94A3B8' },
        ],
    },
    {
        label:  'Financial',
        accent: '#F59E0B',
        icon:   <CreditCard className="w-3.5 h-3.5" />,
        rules: [
            { id: 'creditCard', label: 'Credit Card', icon: <CreditCard className="w-3.5 h-3.5" />, color: '#F59E0B' },
            { id: 'ssn',        label: 'SSN / TIN',   icon: <Lock className="w-3.5 h-3.5" />,       color: '#F472B6' },
        ],
    },
    {
        label:  'Indian PII',
        accent: '#F97316',
        icon:   <Fingerprint className="w-3.5 h-3.5" />,
        rules: [
            { id: 'aadhaar',    label: 'Aadhaar',       icon: <Fingerprint className="w-3.5 h-3.5" />, color: '#F97316' },
            { id: 'pan',        label: 'PAN',           icon: <BookKey className="w-3.5 h-3.5" />,     color: '#EAB308' },
            { id: 'gst',        label: 'GST / GSTIN',   icon: <Building2 className="w-3.5 h-3.5" />,  color: '#2DD4BF' },
            { id: 'ifsc',       label: 'IFSC Code',     icon: <Landmark className="w-3.5 h-3.5" />,   color: '#38BDF8' },
            { id: 'voterId',    label: 'Voter ID',      icon: <Vote className="w-3.5 h-3.5" />,       color: '#EC4899' },
            { id: 'passport',   label: 'Passport',      icon: <MapPin className="w-3.5 h-3.5" />,     color: '#818CF8' },
            { id: 'vehicleReg', label: 'Vehicle Reg',   icon: <Car className="w-3.5 h-3.5" />,        color: '#FB7185' },
        ],
    },
    {
        label:  'Network & System',
        accent: '#06B6D4',
        icon:   <Globe className="w-3.5 h-3.5" />,
        rules: [
            { id: 'url', label: 'URLs',        icon: <Globe className="w-3.5 h-3.5" />,   color: '#06B6D4' },
            { id: 'ip',  label: 'IP Addresses', icon: <Network className="w-3.5 h-3.5" />, color: '#A78BFA' },
        ],
    },
];

// All rule IDs flat
const ALL_RULE_IDS: RuleType[] = RULE_GROUPS.flatMap(g => g.rules.map(r => r.id));

export default function WorkspacePage() {
    const {
        rawText, setRawText, previewMode, rules, setPreviewMode,
        toggleRule, fileType, fileName, customRules, clearWorkspace,
    } = useDocumentStore();

    const [tokens,          setTokens]         = useState<Token[]>([]);
    const [isDragging,      setIsDragging]      = useState(false);
    const [isDrawerOpen,    setIsDrawerOpen]    = useState(false);
    const [loaderStage,     setLoaderStage]     = useState<LoaderStage>('idle');
    const [redactionFailed, setRedactionFailed] = useState(false);
    const [hasReviewed,     setHasReviewed]     = useState(false);
    const [pdfPages,        setPdfPages]        = useState<PdfPageData[]>([]);
    const [currentPage,     setCurrentPage]     = useState(1);

    // Which groups are open in sidebar
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
        Object.fromEntries(RULE_GROUPS.map(g => [g.label, true]))
    );
    const [customOpen,     setCustomOpen]     = useState(false);
    const [addRuleOpen,    setAddRuleOpen]    = useState(false);
    const [newRuleLabel,   setNewRuleLabel]   = useState('');
    const [newRulePattern, setNewRulePattern] = useState('');
    const [newRuleColor,   setNewRuleColor]   = useState<import('@/store/documentStore').PresetColor>('#3B82F6');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const { ocrResult } = useCanvasStore();
    const { addAuditLog, incrementMetrics } = useSessionStore();
    const { addCustomRule, toggleCustomRule, removeCustomRule } = useDocumentStore();

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
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
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [currentPage, pdfPages, fileType]);

    const handleClearWorkspace = () => {
        clearWorkspace();
        useCanvasStore.getState().setImageSrc(null);
        useCanvasStore.getState().setShapes([]);
        useCanvasStore.getState().setOcrResult(null);
        setPdfPages([]); setCurrentPage(1); setLoaderStage('idle');
    };

    useEffect(() => { sessionMapper.clear(); setHasReviewed(false); }, [rawText, fileType]);

    // Debounced tokenization
    useEffect(() => {
        const t = setTimeout(async () => {
            const result = await redactionEngine.tokenize(rawText, rules, customRules,0.50,false,true,fileName);
            if (result.failed) { setRedactionFailed(true); setTokens([]); }
            else { setRedactionFailed(false); setTokens(result.tokens); }
        }, 500);
        return () => clearTimeout(t);
    }, [rawText, rules, customRules]);

    const activeRulesCount       = Object.values(rules).filter(r => r.isActive).length;
    const activeCustomRulesCount = customRules.filter(r => r.isActive).length;
    const totalMatches           = tokens.filter(t => t.type !== 'text').length;

    // ── FIX: Smart toggle — when a rule is turned OFF, immediately remove its shapes
    //         When turned ON, re-map OCR to add its shapes back.
    //         This eliminates the lag where blackboxes stay after deselect.
    const handleToggleRule = useCallback(async (ruleId: RuleType) => {
        const wasActive = rules[ruleId]?.isActive ?? false;
        toggleRule(ruleId);  // flip in store immediately

        if ((fileType === 'image' || fileType === 'pdf') && ocrResult) {
            if (wasActive) {
                // Rule turned OFF → surgically remove only its shapes
                useCanvasStore.getState().setShapes(prev =>
                    removeShapesByRule(prev, ruleId)
                );
            } else {
                // Rule turned ON → re-run mapping with updated rules
                // We read the post-toggle rules from the store
                const updatedRules = {
                    ...rules,
                    [ruleId]: { ...rules[ruleId], isActive: true },
                };
                const newShapes = await mapOcrToShapes(ocrResult, updatedRules, customRules);
                const filtered  = newShapes.filter((s: any) => s.ruleType === ruleId);
                useCanvasStore.getState().setShapes(prev => [
                    ...prev.filter((s: any) => s.ruleType !== ruleId),
                    ...filtered,
                ]);
            }
        }
    }, [rules, fileType, ocrResult, customRules, toggleRule]);

    // Full re-map when rules change for non-canvas files (text mode)
    // Canvas mode is handled by handleToggleRule above
    useEffect(() => {
        if ((fileType === 'image' || fileType === 'pdf') && ocrResult) {
            // This runs on first load and when custom rules change
            // Individual toggle changes are handled by handleToggleRule
        }
    }, [ocrResult, fileType]);

    // ── OCR pipeline ──────────────────────────────────────────────────────────
    const processImageForOcr = async (dataUrl: string) => {
        try {
            setLoaderStage('ocr');
            const ocrData = await extractOcrData(dataUrl);
            useDocumentStore.getState().setRawText(ocrData.rawText);
            useCanvasStore.getState().setOcrResult(ocrData);
            setLoaderStage('mapping');
            const autoShapes = await mapOcrToShapes(ocrData, rules, customRules);
            useCanvasStore.getState().setShapes(prev => [
                ...prev.filter((s: any) => !s.ruleType),  // keep manually drawn
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
        const pd = pdfPages[page - 1];
        useCanvasStore.getState().setImageSrc(pd.dataUri);
        useCanvasStore.getState().setShapes([]);
        useCanvasStore.getState().setOcrResult(null);
        await processImageForOcr(pd.dataUri);
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
            reader.readAsDataURL(file); return;
        }
        if (ext === 'pdf') {
            useDocumentStore.getState().setFileMetadata(file.name, 'pdf', file);
            setLoaderStage('rendering');
            try {
                const pages = await convertPdfToImages(file, 2.0);
                setPdfPages(pages); setCurrentPage(1);
                if (pages.length > 0) {
                    useCanvasStore.getState().setImageSrc(pages[0].dataUri);
                    await processImageForOcr(pages[0].dataUri);
                }
            } catch { useUiStore.getState().addToast("Failed to render PDF.", "error"); setLoaderStage('idle'); }
            return;
        }
        try {
            const { text, type, name } = await extractTextFromFile(file);
            setRawText(text);
            useDocumentStore.getState().setFileMetadata(name, type, file);
        } catch { useUiStore.getState().addToast("File format not supported.", "error"); }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        if (e.dataTransfer.files?.length) handleFileUpload(e.dataTransfer.files[0]);
    };

    // ── Face redaction ────────────────────────────────────────────────────────
    const handleFaceRedaction = async () => {
        const src = useCanvasStore.getState().imageSrc;
        if (!src) { useUiStore.getState().addToast("No image loaded.", "warning"); return; }
        setLoaderStage('face');
        try {
            const blob = await (await fetch(src)).blob();
            const fd   = new FormData();
            fd.append('file', blob, 'image.png');
            fd.append('mode', 'blur');
            fd.append('sensitivity', 'medium');
            const resp = await fetch('http://127.0.0.1:8000/api/v3/redact-image', { method: 'POST', body: fd });
            if (!resp.ok) throw new Error(`${resp.status}`);
            const data = await resp.json();
            if (data.face_count === 0) { useUiStore.getState().addToast("No faces detected.", "info"); return; }
            const faceShapes = data.faces.map((f: any, i: number) => ({
                id: `face_${Date.now()}_${i}`, type: 'blackout' as const,
                x: f.x, y: f.y, width: f.width, height: f.height,
            }));
            useCanvasStore.getState().setShapes(prev => [
                ...prev.filter((s: any) => !s.id.startsWith('face_')),
                ...faceShapes,
            ]);
            useUiStore.getState().addToast(`${data.face_count} face${data.face_count > 1 ? 's' : ''} redacted.`, 'success');
        } catch { useUiStore.getState().addToast("Face redaction failed.", "error"); }
        finally { setLoaderStage('idle'); }
    };

    // ── Export ────────────────────────────────────────────────────────────────
    const exportSecureFile = async (formatOverride?: DocumentState['fileType']) => {
        if (redactionFailed) { useUiStore.getState().addToast('Engine offline. Export blocked.', 'error'); return; }
        const { fileType, fileName } = useDocumentStore.getState();
        const redactedText = tokens.map(t => {
            if (t.type === 'text') return t.value;
            const isBI = t.type in rules;
            const cr   = customRules.find(r => `custom_${r.id}` === t.type || r.id === t.type);
            const active = isBI ? rules[t.type as RuleType]?.isActive : cr?.isActive;
            if (!active) return t.value;
            const action = isBI ? (rules[t.type as RuleType]?.action || 'replace') : (cr?.action || 'replace');
            return redactionEngine.getRedactionReplacement(t.type, t.value, action, customRules);
        }).join('');
        const fmt = formatOverride || fileType;
        if (fileType === 'image' || fileType === 'pdf') {
            const cs = useCanvasStore.getState();
            if (!cs.stageRef) { useUiStore.getState().addToast("Canvas not initialized.", "warning"); return; }
            cs.setSelectedShapeId(null);
            setTimeout(async () => {
                try {
                    const fmtMap: Record<string, string> = { pdf: 'pdf', image: 'png', png: 'png', jpg: 'jpg', jpeg: 'jpg' };
                    const finalExt = fmtMap[fmt] || 'png';
                    const stage = cs.stageRef!; const origScale = stage.scaleX(); const imgDims = cs.imageDimensions;
                    stage.scale({ x: 1, y: 1 }); stage.position({ x: 0, y: 0 });
                    const dataUrl = stage.toDataURL({ x: 0, y: 0, width: imgDims?.width ?? stage.width(), height: imgDims?.height ?? stage.height(), pixelRatio: 1.0 });
                    stage.scale({ x: origScale, y: origScale });
                    const origFile = useDocumentStore.getState().originalFile;
                    const shapes   = useCanvasStore.getState().shapes;
                    const finalDims = imgDims || { width: stage.width(), height: stage.height() };
                    await exportVisualCanvas(dataUrl, fileName, finalExt, origFile, shapes, finalDims);
                    addAuditLog({ id: 'RUN-' + Math.floor(Math.random() * 10000), name: fileName, size: origFile ? (origFile.size / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown', date: new Date().toLocaleString(), status: 'Completed', entitiesDiscovered: shapes.length, rulesApplied: ['Visual Extractor'] });
                    incrementMetrics(1, shapes.length);
                    useUiStore.getState().addToast(`Exported ${shapes.length} masked entities`, 'success');
                } catch { useUiStore.getState().addToast("Export failed.", "error"); }
            }, 50); return;
        }
        await exportRedactedText(redactedText, fileName, fmt as any);
        addAuditLog({ id: 'RUN-' + Math.floor(Math.random() * 10000), name: fileName, size: (new Blob([rawText]).size / 1024).toFixed(1) + ' KB', date: new Date().toLocaleString(), status: 'Completed', entitiesDiscovered: tokens.filter(t => t.type !== 'text').length, rulesApplied: Array.from(new Set(tokens.filter(t => t.type !== 'text').map(t => t.type))) });
        incrementMetrics(1, tokens.filter(t => t.type !== 'text').length);
        useUiStore.getState().addToast(`Protected ${tokens.filter(t => t.type !== 'text').length} entities`, 'success');
    };

    const handleAddRule = () => {
        if (!newRuleLabel.trim() || !newRulePattern.trim()) return;
        try { new RegExp(newRulePattern); } catch { return; }
        addCustomRule({ label: newRuleLabel, pattern: newRulePattern, action: 'replace', isActive: true, color: newRuleColor });
        setNewRuleLabel(''); setNewRulePattern(''); setAddRuleOpen(false);
    };
    const PRESET_COLORS_LIST: import('@/store/documentStore').PresetColor[] = ['#3B82F6','#10B981','#8B5CF6','#F43F5E','#F59E0B','#06B6D4','#EC4899','#6366F1'];

    // ── Entity color map ──────────────────────────────────────────────────────
    const ENTITY_COLORS: Record<string, string> = {
        email: '#60A5FA', phone: '#34D399', creditCard: '#F59E0B', ssn: '#F472B6',
        names: '#3B82F6', dob: '#F87171', date: '#94A3B8', url: '#06B6D4', ip: '#A78BFA',
        aadhaar: '#F97316', pan: '#EAB308', gst: '#2DD4BF', ifsc: '#38BDF8',
        voterId: '#EC4899', passport: '#818CF8', vehicleReg: '#FB7185',
    };

    // ── Sidebar content ───────────────────────────────────────────────────────
    const configPanelContent = (
        <>
            {/* Header */}
            <div className="p-4 md:p-5 border-b border-[#2A2A2A] shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-[#FFA500]/10 border border-[#FFA500]/20">
                        <Shield className="w-4 h-4 text-[#FFA500]" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-white">Redaction Rules</h2>
                        <p className="text-[10px] text-gray-500 font-mono mt-0.5">{activeRulesCount} active · {totalMatches} matches</p>
                    </div>
                </div>
                <button onClick={() => setIsDrawerOpen(false)} className="md:hidden p-1.5 text-gray-500 hover:text-white hover:bg-[#3B3B3B] rounded-lg transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2">

                {/* Rule groups */}
                {RULE_GROUPS.map((group) => {
                    const groupRules = group.rules;
                    const activeInGroup = groupRules.filter(r => rules[r.id]?.isActive).length;
                    const matchInGroup  = groupRules.reduce((sum, r) => sum + tokens.filter(t => t.type === r.id).length, 0);
                    const isOpen        = openGroups[group.label] ?? true;

                    return (
                        <div key={group.label} className="rounded-xl border border-[#2A2A2A] overflow-hidden bg-[#181818]">
                            {/* Group header */}
                            <button
                                onClick={() => setOpenGroups(prev => ({ ...prev, [group.label]: !isOpen }))}
                                className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-[#1E1E1E] transition-colors cursor-pointer group"
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1 rounded-md" style={{ backgroundColor: group.accent + '20', color: group.accent }}>
                                        {group.icon}
                                    </div>
                                    <span className="text-xs font-semibold text-white tracking-wide uppercase" style={{ letterSpacing: '0.06em' }}>{group.label}</span>
                                    <div className="flex items-center gap-1">
                                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold border"
                                            style={{ backgroundColor: group.accent + '15', color: group.accent, borderColor: group.accent + '30' }}>
                                            {activeInGroup}/{groupRules.length}
                                        </span>
                                        {matchInGroup > 0 && (
                                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-white/5 text-gray-400 border border-white/10">
                                                {matchInGroup}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <ChevronDown className={`w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-all duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Rule rows */}
                            <div className={`transition-all duration-200 ease-in-out overflow-hidden ${isOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                <div className="px-2 pb-2 space-y-0.5">
                                    {groupRules.map((rule) => {
                                        const cfg        = rules[rule.id];
                                        if (!cfg) return null;
                                        const isActive   = cfg.isActive;
                                        const matchCount = tokens.filter(t => t.type === rule.id).length;
                                        return (
                                            <div key={rule.id} onClick={() => handleToggleRule(rule.id)}
                                                className={`flex items-center justify-between px-2.5 py-2 rounded-lg transition-all duration-150 cursor-pointer select-none ${isActive ? 'bg-white/[0.04] hover:bg-white/[0.07]' : 'hover:bg-white/[0.03]'}`}>
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="shrink-0 transition-all duration-150"
                                                        style={{ color: isActive ? rule.color : '#4B5563' }}>
                                                        {rule.icon}
                                                    </div>
                                                    <span className={`text-xs transition-colors duration-150 truncate ${isActive ? 'text-gray-200 font-medium' : 'text-gray-500'}`}>
                                                        {rule.label}
                                                    </span>
                                                    {isActive && matchCount > 0 && (
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0"
                                                            style={{ backgroundColor: rule.color + '25', color: rule.color }}>
                                                            {matchCount}
                                                        </span>
                                                    )}
                                                </div>
                                                {/* Toggle pill */}
                                                <div className={`relative w-8 h-4 rounded-full transition-all duration-200 shrink-0 ml-2 ${isActive ? '' : 'bg-[#2A2A2A]'}`}
                                                    style={isActive ? { backgroundColor: rule.color + 'CC' } : {}}>
                                                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-200 ${isActive ? 'left-[18px]' : 'left-0.5'}`} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Custom rules */}
                <div className="rounded-xl border border-[#2A2A2A] overflow-hidden bg-[#181818]">
                    <button onClick={() => setCustomOpen(!customOpen)}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-[#1E1E1E] transition-colors cursor-pointer group">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1 rounded-md bg-[#8B5CF6]/15" style={{ color: '#8B5CF6' }}>
                                <Hash className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-xs font-semibold text-white tracking-wide uppercase" style={{ letterSpacing: '0.06em' }}>Custom Regex</span>
                            {customRules.length > 0 && (
                                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold border bg-[#8B5CF6]/15 text-[#8B5CF6] border-[#8B5CF6]/30">
                                    {customRules.filter(r => r.isActive).length}/{customRules.length}
                                </span>
                            )}
                        </div>
                        <ChevronDown className={`w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-all duration-200 ${customOpen ? 'rotate-180' : ''}`} />
                    </button>

                    <div className={`transition-all duration-200 ease-in-out overflow-hidden ${customOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="px-2 pb-2 space-y-0.5">
                            {customRules.length === 0 && !addRuleOpen && (
                                <p className="text-[11px] text-gray-600 text-center py-3 italic">No custom rules yet.</p>
                            )}
                            {customRules.map(rule => {
                                const mc = tokens.filter(t => t.type === `custom_${rule.id}` || t.type === rule.id).length;
                                return (
                                    <div key={rule.id}
                                        className={`flex items-center justify-between px-2.5 py-2 rounded-lg transition-all duration-150 group ${rule.isActive ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]'}`}>
                                        <div className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer" onClick={() => toggleCustomRule(rule.id)}>
                                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: rule.color }} />
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1">
                                                    <span className={`text-xs truncate ${rule.isActive ? 'text-gray-200 font-medium' : 'text-gray-500'}`}>{rule.label}</span>
                                                    {rule.isActive && mc > 0 && (
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0" style={{ backgroundColor: rule.color + '25', color: rule.color }}>{mc}</span>
                                                    )}
                                                </div>
                                                <p className="text-[9px] text-gray-600 font-mono truncate">{rule.pattern}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 ml-2">
                                            <div onClick={() => toggleCustomRule(rule.id)}
                                                className={`relative w-8 h-4 rounded-full transition-all duration-200 cursor-pointer ${rule.isActive ? '' : 'bg-[#2A2A2A]'}`}
                                                style={rule.isActive ? { backgroundColor: rule.color + 'CC' } : {}}>
                                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-200 ${rule.isActive ? 'left-[18px]' : 'left-0.5'}`} />
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); removeCustomRule(rule.id); }}
                                                className="p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer rounded">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {addRuleOpen ? (
                                <div className="mt-1 p-3 rounded-lg bg-[#1E1E1E] border border-[#3B3B3B] space-y-2.5">
                                    <input type="text" placeholder="Rule name" value={newRuleLabel} onChange={e => setNewRuleLabel(e.target.value)}
                                        className="w-full px-3 py-2 bg-[#141414] border border-[#3B3B3B] text-xs text-white rounded-lg placeholder:text-gray-600 focus:border-[#FFA500]/50 focus:outline-none" />
                                    <input type="text" placeholder="Regex pattern" value={newRulePattern} onChange={e => setNewRulePattern(e.target.value)}
                                        className="w-full px-3 py-2 bg-[#141414] border border-[#3B3B3B] text-xs text-white font-mono rounded-lg placeholder:text-gray-600 focus:border-[#FFA500]/50 focus:outline-none" />
                                    <div className="flex items-center gap-1.5">
                                        {PRESET_COLORS_LIST.map(c => (
                                            <button key={c} onClick={() => setNewRuleColor(c)}
                                                className={`w-5 h-5 rounded-full transition-all cursor-pointer ${newRuleColor === c ? 'ring-2 ring-white ring-offset-1 ring-offset-[#1E1E1E] scale-110' : 'opacity-50 hover:opacity-100'}`}
                                                style={{ backgroundColor: c }} />
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={handleAddRule} disabled={!newRuleLabel.trim() || !newRulePattern.trim()}
                                            className="flex-1 py-1.5 bg-[#FFA500] hover:bg-[#ffb733] text-black text-xs font-medium rounded-lg transition-colors disabled:opacity-40 cursor-pointer">Add Rule</button>
                                        <button onClick={() => { setAddRuleOpen(false); setNewRuleLabel(''); setNewRulePattern(''); }}
                                            className="px-3 py-1.5 text-gray-400 hover:text-white bg-[#2A2A2A] text-xs rounded-lg transition-colors cursor-pointer">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <button onClick={() => { setAddRuleOpen(true); setCustomOpen(true); }}
                                    className="w-full mt-1 py-2 flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-white bg-[#141414] hover:bg-[#1E1E1E] border border-dashed border-[#2A2A2A] hover:border-[#FFA500]/40 rounded-lg transition-all cursor-pointer">
                                    <span className="text-[#FFA500] text-base leading-none">+</span> Add Pattern
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Engine status pill */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#2A2A2A] bg-[#141414]">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${redactionFailed ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
                    <span className={`text-[10px] font-mono ${redactionFailed ? 'text-red-400' : 'text-gray-500'}`}>
                        {redactionFailed ? 'ENGINE OFFLINE' : `ENGINE ACTIVE · V3 pipeline · ${activeRulesCount} rules`}
                    </span>
                </div>
            </div>
        </>
    );

    const loaderInfo = LOADER_MSG[loaderStage];
    const isLoading  = loaderStage !== 'idle';

    return (
        <div className="w-full font-sans flex flex-col md:flex-row h-[calc(100vh-64px)] md:h-screen selection:bg-[#FFA500] selection:text-black relative">

            {/* LEFT PANE */}
            <section className="w-full md:w-[62%] lg:w-[68%] flex flex-col border-r border-[#2A2A2A] h-full">

                {/* Toolbar */}
                <header className="flex items-center justify-between px-4 py-3 bg-[#181818] border-b border-[#2A2A2A] shrink-0">
                    <div className="flex items-center gap-3">
                        <button className="p-1.5 -ml-1 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-[#2A2A2A] cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
                        <div>
                            <div className="flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5 text-[#FFA500]" />
                                <span className="text-sm font-medium text-white truncate max-w-[200px]">{fileName || 'Workspace.txt'}</span>
                            </div>
                            <span className="text-[10px] font-mono text-gray-600 hidden md:block">
                                {fileType === 'pdf' || fileType === 'image' ? 'Canvas Redaction Layer' : 'Live Editable Buffer'}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 md:gap-2">
                        <input type="file" accept=".txt,.csv,.json,.md,.docx,.pdf,.png,.jpg,.jpeg,.webp" className="hidden" ref={fileInputRef} onChange={(e) => { if (e.target.files?.length) handleFileUpload(e.target.files[0]); }} />
                        <button onClick={handleClearWorkspace} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer" title="Clear workspace"><Trash2 className="w-4 h-4" /></button>
                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 text-gray-300 hover:text-white bg-[#252525] hover:bg-[#2A2A2A] px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border border-[#2A2A2A]">
                            <UploadCloud className="w-3.5 h-3.5" /><span className="hidden sm:inline">Load File</span>
                        </button>
                        {(fileType === 'image' || fileType === 'pdf') && (
                            <button onClick={handleFaceRedaction} className="flex items-center gap-1.5 text-gray-300 hover:text-white bg-[#252525] hover:bg-purple-500/15 border border-[#2A2A2A] hover:border-purple-500/30 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer" title="Detect faces">
                                <ScanFace className="w-3.5 h-3.5" /><span className="hidden sm:inline">Faces</span>
                            </button>
                        )}
                        <div className="w-px h-5 bg-[#2A2A2A] mx-1 hidden md:block" />
                        <button onClick={() => setHasReviewed(!hasReviewed)}
                            className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${hasReviewed ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' : 'text-gray-500 bg-[#252525] border-[#2A2A2A] hover:text-gray-300'}`}>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Reviewed
                        </button>
                        <div className="relative group">
                            <button onClick={() => exportSecureFile()} disabled={redactionFailed || !hasReviewed}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${redactionFailed || !hasReviewed ? 'bg-[#252525] text-gray-600 cursor-not-allowed border border-[#2A2A2A]' : 'bg-[#FFA500] hover:bg-[#ffb733] text-black cursor-pointer shadow-[0_0_12px_rgba(255,165,0,0.2)]'}`}>
                                <Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">Export</span><ChevronDown className="w-3 h-3 opacity-60" />
                            </button>
                            <div className="absolute top-full right-0 mt-1.5 w-28 bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 overflow-hidden p-1">
                                {((fileType === 'image' || fileType === 'pdf') ? ['pdf','png','jpg'] as const : ['docx','pdf','txt','md','csv','json'] as const).map(fmt => (
                                    <button key={fmt} disabled={redactionFailed || !hasReviewed} onClick={(e) => { e.stopPropagation(); exportSecureFile(fmt as any); }}
                                        className="block w-full text-left px-3 py-1.5 text-[11px] font-mono text-gray-400 hover:bg-[#2A2A2A] hover:text-white uppercase transition-colors disabled:opacity-40 rounded-lg">.{fmt}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Stats + page nav bar */}
                <div className="bg-[#141414] border-b border-[#2A2A2A] px-4 py-1.5 flex items-center gap-3">
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap flex-1">
                        {Object.entries(tokens.reduce((acc, t) => { if (t.type !== 'text') acc[t.type] = (acc[t.type] || 0) + 1; return acc; }, {} as Record<string, number>)).slice(0, 6).map(([type, count]) => {
                            const isCustom = type.startsWith('custom_');
                            const label = isCustom ? (customRules.find(r => `custom_${r.id}` === type)?.label || 'Custom') : type;
                            const color = isCustom ? (customRules.find(r => `custom_${r.id}` === type)?.color || '#8B5CF6') : (ENTITY_COLORS[type] || '#6B7280');
                            return (
                                <div key={type} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1E1E1E] border border-[#2A2A2A] shrink-0">
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                                    <span className="text-[10px] font-medium text-gray-400">{count} {label}</span>
                                </div>
                            );
                        })}
                        {totalMatches === 0 && <span className="text-[10px] text-gray-600 font-mono italic">No entities detected</span>}
                    </div>
                    {fileType === 'pdf' && pdfPages.length > 1 && (
                        <div className="flex items-center gap-1.5 shrink-0 pl-3 border-l border-[#2A2A2A]">
                            <Layers className="w-3 h-3 text-gray-600" />
                            <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="p-0.5 text-gray-500 hover:text-white disabled:opacity-30 cursor-pointer rounded transition-colors"><ChevronLeft className="w-3.5 h-3.5" /></button>
                            <span className="text-[10px] font-mono text-gray-400 min-w-[40px] text-center">{currentPage}/{pdfPages.length}</span>
                            <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === pdfPages.length} className="p-0.5 text-gray-500 hover:text-white disabled:opacity-30 cursor-pointer rounded transition-colors"><ChevronRight className="w-3.5 h-3.5" /></button>
                            {pdfPages.length <= 8 && <div className="flex gap-0.5 ml-1">{pdfPages.map((_, i) => <button key={i} onClick={() => goToPage(i + 1)} className={`w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${currentPage === i + 1 ? 'bg-[#FFA500]' : 'bg-[#2A2A2A] hover:bg-gray-500'}`} />)}</div>}
                        </div>
                    )}
                </div>

                {/* Document view */}
                <div className={`flex-1 relative bg-[#1A1A1A] ${fileType === 'image' || fileType === 'pdf' ? 'overflow-hidden' : 'overflow-y-auto'} ${isDragging ? 'bg-[#222]' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>

                    {isDragging && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#FFA500]/5 backdrop-blur-sm border-2 border-[#FFA500]/60 border-dashed">
                            <div className="flex flex-col items-center gap-3">
                                <UploadCloud className="w-10 h-10 text-[#FFA500] animate-bounce" />
                                <span className="text-base font-medium text-[#FFA500]">Drop to analyze</span>
                            </div>
                        </div>
                    )}

                    {redactionFailed && (
                        <div className="absolute top-0 left-0 right-0 z-50 flex items-center gap-2.5 px-4 py-2.5 bg-red-900/30 border-b border-red-500/20">
                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                            <div>
                                <p className="text-xs font-semibold text-red-400">Engine Offline</p>
                                <p className="text-[10px] text-red-400/60">Backend unreachable at localhost:8000. Export blocked.</p>
                            </div>
                        </div>
                    )}

                    {isLoading && (
                        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
                            <div className="relative">
                                <div className="w-14 h-14 border-4 border-[#FFA500]/10 border-t-[#FFA500] rounded-full animate-spin" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Activity className="w-5 h-5 text-[#FFA500]/60" />
                                </div>
                            </div>
                            <h2 className="text-base font-semibold text-white mt-5 tracking-wide">{loaderInfo.title}</h2>
                            <p className="text-xs text-gray-500 mt-1.5 font-mono">{loaderInfo.sub}</p>
                        </div>
                    )}

                    {fileType === 'image' || fileType === 'pdf' ? <CanvasEngine /> : (
                        <div className="relative w-full max-w-3xl mx-auto min-h-full">
                            <div className="relative w-full p-6 md:p-10 pb-32">
                                <div className="font-mono text-[13px] leading-[1.8] break-words whitespace-pre-wrap pointer-events-none w-full min-h-[500px]">
                                    {tokens.map(t => {
                                        if (t.type === 'text') return <PlainTextToken key={t.id} token={t} isRedacted={previewMode === 'redacted'} />;
                                        const cr = customRules.find(r => `custom_${r.id}` === t.type || r.id === t.type);
                                        const action = rules[t.type as RuleType]?.action || cr?.action || 'replace';
                                        return <AnimatedToken key={t.id} token={t} isRedacted={previewMode === 'redacted'} action={action} accentColor={cr?.color} />;
                                    })}
                                    {'\n\n\n'}
                                </div>
                                {previewMode === 'original' && (
                                    <textarea value={rawText} onChange={e => setRawText(e.target.value)}
                                        className="absolute inset-6 md:inset-10 bottom-32 z-10 bg-transparent text-gray-400/60 font-mono text-[13px] leading-[1.8] resize-none outline-none border-0 p-0 m-0 focus:ring-0 whitespace-pre-wrap break-words overflow-hidden"
                                        spellCheck={false} placeholder="Paste raw text here or drop a file…" />
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Lock FAB */}
                <button onClick={() => setPreviewMode(previewMode === 'original' ? 'redacted' : 'original')}
                    className="absolute bottom-[4.5rem] md:bottom-6 right-4 md:right-6 z-30 flex items-center gap-2 bg-[#181818] hover:bg-[#222] text-white px-4 py-3 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.7)] border border-[#2A2A2A] transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer group">
                    {previewMode === 'original'
                        ? <><Shield className="w-4 h-4 text-[#FFA500]" /><span className="text-xs font-semibold">Lock Document</span></>
                        : <><Eye className="w-4 h-4 text-gray-400 group-hover:text-white" /><span className="text-xs font-semibold">Edit Original</span></>
                    }
                </button>
            </section>

            {/* DESKTOP SIDEBAR */}
            <aside className="hidden md:flex md:w-[38%] lg:w-[32%] flex-col h-full bg-[#111111] border-l border-[#1E1E1E]">
                {configPanelContent}
            </aside>

            {/* MOBILE HANDLE */}
            <button onClick={() => setIsDrawerOpen(true)} className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-2 py-3 bg-[#111]/95 backdrop-blur-md border-t border-[#1E1E1E] cursor-pointer" style={{ display: isDrawerOpen ? 'none' : undefined }}>
                <ChevronUp className="w-4 h-4 text-[#FFA500] animate-bounce" />
                <span className="text-xs font-medium text-white">Rules</span>
                {totalMatches > 0 && <span className="px-1.5 py-0.5 rounded-full bg-[#FFA500]/20 text-[#FFA500] text-[9px] font-mono border border-[#FFA500]/30">{totalMatches}</span>}
            </button>

            {isDrawerOpen && <div className="md:hidden fixed inset-0 z-40 bg-black/70" onClick={() => setIsDrawerOpen(false)} />}
            <div className={`md:hidden fixed left-0 right-0 bottom-0 z-50 bg-[#111111] border-t border-[#1E1E1E] rounded-t-2xl flex flex-col shadow-2xl transition-transform duration-300 ${isDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`} style={{ maxHeight: '85vh' }}>
                <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-8 h-1 rounded-full bg-[#2A2A2A]" /></div>
                {configPanelContent}
            </div>
        </div>
    );
}
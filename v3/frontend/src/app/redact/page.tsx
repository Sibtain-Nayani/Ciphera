"use client";
import { ConfidenceSlider } from '@/components/redact/ConfidenceSlider';
import { TemplateSelector } from '@/components/redact/TemplateSelector';
import { ExportModal, ExportPageSelection } from '@/components/redact/ExportModal';
import { EntityReviewModal } from '@/components/redact/EntityReviewModal';
import { exportMultiplePages } from '@/lib/multiPageExport';
import { useTemplateStore } from '@/store/templateStore';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Download, FileText, Eye, Shield,
    ChevronLeft, UploadCloud, ChevronUp, ChevronDown, X,
    AlertTriangle, Trash2, CheckCircle2, ChevronRight,
    ScanFace, Layers, Mail, Phone, CreditCard, Lock,
    User, Calendar, Globe, Network, Fingerprint,
    BookKey, Building2, Landmark, Vote, Car, MapPin,
    Activity, Hash, Columns2,
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
import { api } from '@/lib/api';

const CanvasEngine = dynamic(
    () => import('@/components/canvas/CanvasEngine').then(m => m.CanvasEngine),
    { ssr: false }
);

type LoaderStage = 'idle' | 'rendering' | 'ocr' | 'analyzing' | 'mapping' | 'face';
const LOADER_MSG: Record<LoaderStage, { title: string; sub: string }> = {
    idle:      { title: '',                      sub: '' },
    rendering: { title: 'Rendering PDF Pages…',  sub: 'Converting pages to high-res images' },
    ocr:       { title: 'Running OCR Pipeline…', sub: 'Extracting text with Tesseract WASM' },
    analyzing: { title: 'Analyzing Document…',   sub: 'V3 multi-layer detection pipeline' },
    mapping:   { title: 'Mapping Redactions…',   sub: 'Placing overlays on canvas' },
    face:      { title: 'Detecting Faces…',      sub: 'Running OpenCV face detection' },
};

interface RuleMeta { id: RuleType; label: string; icon: React.ReactNode; color: string; }
const RULE_GROUPS: { label: string; accent: string; icon: React.ReactNode; rules: RuleMeta[] }[] = [
    {
        label: 'Identity & Contact', accent: '#3B82F6', icon: <User className="w-3.5 h-3.5" />,
        rules: [
            { id: 'names',   label: 'Names (NLP)',   icon: <User className="w-3.5 h-3.5" />,     color: '#3B82F6' },
            { id: 'email',   label: 'Email',         icon: <Mail className="w-3.5 h-3.5" />,     color: '#60A5FA' },
            { id: 'phone',   label: 'Phone',         icon: <Phone className="w-3.5 h-3.5" />,    color: '#34D399' },
            { id: 'dob',     label: 'Date of Birth', icon: <Calendar className="w-3.5 h-3.5" />, color: '#F87171' },
            { id: 'date',    label: 'General Dates', icon: <Calendar className="w-3.5 h-3.5" />, color: '#94A3B8' },
        ],
    },
    {
        label: 'Financial', accent: '#F59E0B', icon: <CreditCard className="w-3.5 h-3.5" />,
        rules: [
            { id: 'creditCard', label: 'Credit Card', icon: <CreditCard className="w-3.5 h-3.5" />, color: '#F59E0B' },
            { id: 'ssn',        label: 'SSN / TIN',   icon: <Lock className="w-3.5 h-3.5" />,       color: '#F472B6' },
        ],
    },
    {
        label: 'Indian PII', accent: '#F97316', icon: <Fingerprint className="w-3.5 h-3.5" />,
        rules: [
            { id: 'aadhaar',    label: 'Aadhaar',     icon: <Fingerprint className="w-3.5 h-3.5" />, color: '#F97316' },
            { id: 'pan',        label: 'PAN',         icon: <BookKey className="w-3.5 h-3.5" />,     color: '#EAB308' },
            { id: 'gst',        label: 'GST / GSTIN', icon: <Building2 className="w-3.5 h-3.5" />,  color: '#2DD4BF' },
            { id: 'ifsc',       label: 'IFSC Code',   icon: <Landmark className="w-3.5 h-3.5" />,   color: '#38BDF8' },
            { id: 'voterId',    label: 'Voter ID',    icon: <Vote className="w-3.5 h-3.5" />,       color: '#EC4899' },
            { id: 'passport',   label: 'Passport',    icon: <MapPin className="w-3.5 h-3.5" />,     color: '#818CF8' },
            { id: 'vehicleReg', label: 'Vehicle Reg', icon: <Car className="w-3.5 h-3.5" />,        color: '#FB7185' },
        ],
    },
    {
        label: 'Network & System', accent: '#06B6D4', icon: <Globe className="w-3.5 h-3.5" />,
        rules: [
            { id: 'url', label: 'URLs',         icon: <Globe className="w-3.5 h-3.5" />,   color: '#06B6D4' },
            { id: 'ip',  label: 'IP Addresses', icon: <Network className="w-3.5 h-3.5" />, color: '#A78BFA' },
        ],
    },
];

const ENTITY_COLORS: Record<string, string> = {
    email: '#60A5FA', phone: '#34D399', creditCard: '#F59E0B', ssn: '#F472B6',
    names: '#3B82F6', dob: '#F87171', date: '#94A3B8', url: '#06B6D4', ip: '#A78BFA',
    aadhaar: '#F97316', pan: '#EAB308', gst: '#2DD4BF', ifsc: '#38BDF8',
    voterId: '#EC4899', passport: '#818CF8', vehicleReg: '#FB7185',
};

// ── Persist audit log to backend DB (silent fail — localStorage is fallback) ──
function persistAuditLog(entry: {
    id: string; name: string; size: string; date: string;
    status: string; entities_discovered: number; rules_applied: string[];
}) {
    fetch(api('/api/v3/audit/log'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...entry, session_id: 'default' }),
    }).catch(() => {});
}

export default function WorkspacePage() {
    const {
        rawText, setRawText, previewMode, rules, setPreviewMode,
        toggleRule, fileType, fileName, customRules, clearWorkspace,
    } = useDocumentStore();

    const [threshold,       setThreshold]      = useState(0.50);
    const [tokens,          setTokens]         = useState<Token[]>([]);
    const [isDragging,      setIsDragging]      = useState(false);
    const [isDrawerOpen,    setIsDrawerOpen]    = useState(false);
    const [loaderStage,     setLoaderStage]     = useState<LoaderStage>('idle');
    const [redactionFailed, setRedactionFailed] = useState(false);
    const [hasReviewed,     setHasReviewed]     = useState(false);
    const [pdfPages,        setPdfPages]        = useState<PdfPageData[]>([]);
    const [currentPage,     setCurrentPage]     = useState(1);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [isExporting,     setIsExporting]     = useState(false);
    const [exportProgress,  setExportProgress]  = useState<{ current: number; total: number; status: string } | null>(null);
    const [approvedIds,     setApprovedIds]     = useState<Set<string> | null>(null);
    const [splitView,       setSplitView]       = useState(false);
    // Banner shown when auto-classifier detects a document type
    const [classifierBanner, setClassifierBanner] = useState<string | null>(null);
    const [languageBanner, setLanguageBanner] = useState<string | null>(null);
    const [languageMode, setLanguageMode] = useState<'english'|'hindi'|'mixed'>('english');

    const [openGroups,     setOpenGroups]     = useState<Record<string, boolean>>(Object.fromEntries(RULE_GROUPS.map(g => [g.label, true])));
    const [customOpen,     setCustomOpen]     = useState(false);
    const [addRuleOpen,    setAddRuleOpen]    = useState(false);
    const [newRuleLabel,   setNewRuleLabel]   = useState('');
    const [newRulePattern, setNewRulePattern] = useState('');
    const [newRuleColor,   setNewRuleColor]   = useState<import('@/store/documentStore').PresetColor>('#3B82F6');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const { ocrResult } = useCanvasStore();
    const { addAuditLog, incrementMetrics } = useSessionStore();
    const { addCustomRule, toggleCustomRule, removeCustomRule } = useDocumentStore();

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'w') { e.preventDefault(); handleClearWorkspace(); }
            if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); setPreviewMode(useDocumentStore.getState().previewMode === 'original' ? 'redacted' : 'original'); }
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
        setApprovedIds(null); setClassifierBanner(null);
    };

    useEffect(() => { sessionMapper.clear(); setHasReviewed(false); setApprovedIds(null); }, [rawText, fileType]);

    // Debounced tokenization — re-runs when threshold changes
    useEffect(() => {
        const t = setTimeout(async () => {
            const result = await redactionEngine.tokenize(
                rawText, rules, customRules, threshold, false, true, fileName,
                (languageMode === 'hindi' || languageMode === 'mixed')
                ? languageMode
                : 'english',
            );
            if (result.failed) { setRedactionFailed(true); setTokens([]); }
            else { setRedactionFailed(false); setTokens(result.tokens); }
        }, 500);
        return () => clearTimeout(t);
    }, [rawText, rules, customRules, threshold]);

    const activeRulesCount = Object.values(rules).filter(r => r.isActive).length;
    const totalMatches     = tokens.filter(t => t.type !== 'text').length;

    const effectiveTokens = approvedIds
        ? tokens.map(t => t.type === 'text' || approvedIds.has(t.id) ? t : { ...t, type: 'text' as const })
        : tokens;

    // ── Auto document classifier ──────────────────────────────────────────────
    const runClassifier = async (text: string, filename: string) => {
        try {
            const res = await fetch(api('/api/v3/classify'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text.slice(0, 2000), filename }),
            });
            if (!res.ok) return;
            const cls = await res.json();
            if (cls.confidence > 0.3 && cls.auto_template) {
                // Apply matching template
                const allTemplates = useTemplateStore.getState().getAllTemplates();
                const template     = allTemplates.find((t: any) => t.id === cls.auto_template);
                if (template) {
                    const { toggleRule: tr, setRuleAction: sra } = useDocumentStore.getState();
                    const currentRules = useDocumentStore.getState().rules;
                    (Object.keys(template.rules) as RuleType[]).forEach(ruleId => {
                        const tmpl = template.rules[ruleId];
                        const curr = currentRules[ruleId];
                        if (curr && tmpl.isActive !== curr.isActive) tr(ruleId);
                        if (curr && tmpl.action !== curr.action) sra(ruleId, tmpl.action);
                    });
                    setClassifierBanner(
                        `Auto-detected: ${cls.document_type.toUpperCase()} document · "${template.name}" template applied (${Math.round(cls.confidence * 100)}% confidence)`
                    );
                    setTimeout(() => setClassifierBanner(null), 6000);
                }
            }
        } catch { /* classifier offline — no-op */ }
    };
    const detectLanguage = async (text: string) => {
    try {
        const res = await fetch(api('/api/v3/detect-language'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text.slice(0, 3000) }),
        });
        if (!res.ok) return;
        const data = await res.json();
        setLanguageMode(data.mode || 'english');
        // data.mode will be 'hindi', 'mixed', or 'english'
        if (data.mode === 'hindi') {
            setLanguageBanner('LANGUAGE DETECTED: HINDI · Using hindi analysis pipeline');
        } else if (data.mode === 'mixed') {
            setLanguageBanner('LANGUAGE DETECTED: HINDI + ENGLISH · Using bilingual pipeline');
        }
        // english = no banner needed, that's the default
        setTimeout(() => setLanguageBanner(null), 8000);
    } catch { /* language detection offline — no-op */ }
};

    const handleToggleRule = useCallback(async (ruleId: RuleType) => {
        const wasActive = rules[ruleId]?.isActive ?? false;
        toggleRule(ruleId);
        if ((fileType === 'image' || fileType === 'pdf') && ocrResult) {
            if (wasActive) {
                useCanvasStore.getState().setShapes(prev => removeShapesByRule(prev, ruleId));
            } else {
                const updatedRules = { ...rules, [ruleId]: { ...rules[ruleId], isActive: true } };
                const newShapes    = await mapOcrToShapes(ocrResult, updatedRules, customRules);
                const filtered     = newShapes.filter((s: any) => s.ruleType === ruleId);
                useCanvasStore.getState().setShapes(prev => [
                    ...prev.filter((s: any) => s.ruleType !== ruleId),
                    ...filtered,
                ]);
            }
        }
    }, [rules, fileType, ocrResult, customRules, toggleRule]);

    const processImageForOcr = async (dataUrl: string) => {
        try {
            setLoaderStage('ocr');
            const ocrData = await extractOcrData(dataUrl);
            useDocumentStore.getState().setRawText(ocrData.rawText);
            useCanvasStore.getState().setOcrResult(ocrData);
            setLoaderStage('mapping');
            const autoShapes = await mapOcrToShapes(ocrData, rules, customRules);
            useCanvasStore.getState().setShapes(prev => [
                ...prev.filter((s: any) => !s.ruleType),
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
        setClassifierBanner(null);
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
            useDocumentStore.getState().setFileMetadata(file.name, 'image', file);
            setPdfPages([]);
            const reader = new FileReader();
            reader.onload = async (e) => {
                if (e.target?.result) {
                    useCanvasStore.getState().setImageSrc(e.target.result as string);
                    await processImageForOcr(e.target.result as string);
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
            // Run classifier after text is loaded
            await runClassifier(text, file.name);
            await detectLanguage(text);

        } catch { useUiStore.getState().addToast("File format not supported.", "error"); }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        if (e.dataTransfer.files?.length) handleFileUpload(e.dataTransfer.files[0]);
    };

    const handleFaceRedaction = async () => {
        const src = useCanvasStore.getState().imageSrc;
        if (!src) { useUiStore.getState().addToast("No image loaded.", "warning"); return; }
        setLoaderStage('face');
        try {
            const blob = await (await fetch(src)).blob();
            const fd   = new FormData();
            fd.append('file', blob, 'image.png'); fd.append('mode', 'blur'); fd.append('sensitivity', 'medium');
            const resp = await fetch(api('/api/v3/redact-image'), { method: 'POST', body: fd });
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
            useUiStore.getState().addToast(`${data.face_count} face(s) redacted.`, 'success');
        } catch { useUiStore.getState().addToast("Face redaction failed.", "error"); }
        finally { setLoaderStage('idle'); }
    };

    const buildRedactedText = (tokensToUse: Token[]) => tokensToUse.map(t => {
        if (t.type === 'text') return t.value;
        const isBI   = t.type in rules;
        const cr     = customRules.find(r => `custom_${r.id}` === t.type || r.id === t.type);
        const active = isBI ? rules[t.type as RuleType]?.isActive : cr?.isActive;
        if (!active) return t.value;
        const action = actionOverrides[t.id]
            || (isBI ? (rules[t.type as RuleType]?.action || 'replace') : (cr?.action || 'replace'));
        return redactionEngine.getRedactionReplacement(t.type, t.value, action, customRules);
    }).join('');

    const exportSecureFile = async (formatOverride?: DocumentState['fileType'] | string) => {
        if (redactionFailed) { useUiStore.getState().addToast('Engine offline. Export blocked.', 'error'); return; }
        const { fileType, fileName } = useDocumentStore.getState();
        const fmt = formatOverride || fileType;

        if (fileType === 'pdf') {
            const origFile = useDocumentStore.getState().originalFile;
            if (!origFile) { useUiStore.getState().addToast("No PDF file found.", "error"); return; }
            setIsExporting(true);
            try {
                useUiStore.getState().addToast("Redacting PDF on server...", "info");
                const fd = new FormData();
                fd.append('file', origFile);
                const resp = await fetch(api('/api/v3/redact-pdf'), { method: 'POST', body: fd });
                if (!resp.ok) throw new Error('PDF redaction failed');
                const blob = await resp.blob();
                const baseName = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
                const finalName = `${baseName}_Secure.pdf`;
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = finalName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                useUiStore.getState().addToast('PDF redacted and downloaded.', 'success');
            } catch (err) {
                useUiStore.getState().addToast("Export failed. Try again.", "error");
            } finally {
                setIsExporting(false);
            }
            return;
        }

        if (fileType === 'image') {
            const getStage = async () => {
                for (let i = 0; i < 5; i++) {
                    const stage = useCanvasStore.getState().stageRef;
                    if (stage) return stage;
                    await new Promise(r => setTimeout(r, 100));
                }
                return null;
            };
            const stage = await getStage();
            if (!stage) { useUiStore.getState().addToast("Canvas not ready — please try again.", "warning"); return; }
            const cs = useCanvasStore.getState();
            cs.setSelectedShapeId(null);
            await new Promise(r => setTimeout(r, 80));
            try {
                const formatMap: Record<string, string> = { pdf: 'pdf', image: 'png', png: 'png', jpg: 'jpg', jpeg: 'jpg' };
                const finalExt  = formatMap[fmt as string] || 'png';
                const imgDims   = cs.imageDimensions;
                const origScale = stage.scaleX();
                stage.scale({ x: 1, y: 1 }); stage.position({ x: 0, y: 0 });
                const dataUrl = stage.toDataURL({ x: 0, y: 0, width: imgDims?.width ?? stage.width(), height: imgDims?.height ?? stage.height(), pixelRatio: 1.0 });
                stage.scale({ x: origScale, y: origScale });
                const origFile  = useDocumentStore.getState().originalFile;
                const shapes    = useCanvasStore.getState().shapes;
                const finalDims = imgDims || { width: stage.width(), height: stage.height() };
                await exportVisualCanvas(dataUrl, fileName, finalExt, origFile, shapes, finalDims);
                const logEntry = { id: 'RUN-' + Math.floor(Math.random() * 10000), name: fileName, size: origFile ? (origFile.size / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown', date: new Date().toLocaleString(), status: 'Completed', entitiesDiscovered: shapes.length, rulesApplied: ['Visual Extractor'] };
                addAuditLog({ ...logEntry, status: 'Completed' as const });
                persistAuditLog({ ...logEntry, entities_discovered: shapes.length, rules_applied: ['Visual Extractor'] });
                incrementMetrics(1, shapes.length);
                useUiStore.getState().addToast(`Exported ${shapes.length} redacted entities`, 'success');
            } catch { useUiStore.getState().addToast("Export failed. Try again.", "error"); }
            return;
        }

        const redactedText = buildRedactedText(effectiveTokens);
        await exportRedactedText(redactedText, fileName, fmt as any);
        const entityCount  = effectiveTokens.filter(t => t.type !== 'text').length;
        const rulesApplied = Array.from(new Set(effectiveTokens.filter(t => t.type !== 'text').map(t => t.type)));
        const logEntry = { id: 'RUN-' + Math.floor(Math.random() * 10000), name: fileName, size: (new Blob([rawText]).size / 1024).toFixed(1) + ' KB', date: new Date().toLocaleString(), status: 'Completed' as const, entitiesDiscovered: entityCount, rulesApplied };
        addAuditLog(logEntry);
        persistAuditLog({ ...logEntry, entities_discovered: entityCount, rules_applied: rulesApplied });
        incrementMetrics(1, entityCount);
        useUiStore.getState().addToast(`Protected ${entityCount} entities`, 'success');
    };

    const handleExportClick = () => {
        if (fileType === 'pdf' && pdfPages.length > 1) {
            setShowExportModal(true);
        } else if (fileType !== 'image' && fileType !== 'pdf' && totalMatches > 0) {
            setShowReviewModal(true);
        } else {
            exportSecureFile();
        }
    };

    const [actionOverrides, setActionOverrides] = useState<Record<string, import('@/store/documentStore').RedactionAction>>({});
    
    const handleReviewConfirm = async (ids: Set<string>, overrides: Record<string, import('@/store/documentStore').RedactionAction>) => {
        setApprovedIds(ids);
        setActionOverrides(overrides);
        setShowReviewModal(false);
        await exportSecureFile();
    };

    const handleModalConfirm = async (selection: ExportPageSelection, format: string) => {
        setIsExporting(true);
        setExportProgress({ current: 0, total: 1, status: 'Starting…' });
        try {
            if (fileType === 'pdf' && pdfPages.length > 0) {
                let selectedPageNums: number[];
                if (selection.mode === 'all')          selectedPageNums = pdfPages.map((_, i) => i + 1);
                else if (selection.mode === 'current') selectedPageNums = [selection.page];
                else                                   selectedPageNums = selection.pages;
                if (selectedPageNums.length === 1) {
                    if (currentPage !== selectedPageNums[0]) { await goToPage(selectedPageNums[0]); await new Promise(r => setTimeout(r, 600)); }
                    setShowExportModal(false); setIsExporting(false); setExportProgress(null);
                    await exportSecureFile(format); return;
                }
                const savedPage = currentPage;
                await exportMultiplePages({ pages: pdfPages, selectedPages: selectedPageNums, rules, customRules, fileName, format: format as 'pdf' | 'png', onProgress: (current, total, status) => setExportProgress({ current, total, status }) });
                useUiStore.getState().addToast(`Exported ${selectedPageNums.length} pages`, 'success');
                if (savedPage !== currentPage) await goToPage(savedPage);
            } else {
                setShowExportModal(false); setIsExporting(false); setExportProgress(null);
                await exportSecureFile(format); return;
            }
        } catch { useUiStore.getState().addToast('Export failed.', 'error'); }
        finally { setIsExporting(false); setExportProgress(null); setShowExportModal(false); }
    };

    const handleAddRule = () => {
        if (!newRuleLabel.trim() || !newRulePattern.trim()) return;
        try { new RegExp(newRulePattern); } catch { return; }
        addCustomRule({ label: newRuleLabel, pattern: newRulePattern, action: 'replace', isActive: true, color: newRuleColor });
        setNewRuleLabel(''); setNewRulePattern(''); setAddRuleOpen(false);
    };
    const PRESET_COLORS_LIST: import('@/store/documentStore').PresetColor[] = ['#3B82F6','#10B981','#8B5CF6','#F43F5E','#F59E0B','#06B6D4','#EC4899','#6366F1'];

    const isTextDoc  = fileType !== 'image' && fileType !== 'pdf';
    const isCanvas   = fileType === 'image' || fileType === 'pdf';
    const loaderInfo = LOADER_MSG[loaderStage];
    const isLoading  = loaderStage !== 'idle';

    const renderTokenStream = (redacted: boolean, tokensToRender: Token[]) =>
        tokensToRender.map(t => {
            if (t.type === 'text') return <PlainTextToken key={t.id} token={t} isRedacted={redacted} />;
            const cr     = customRules.find(r => `custom_${r.id}` === t.type || r.id === t.type);
            const action = rules[t.type as RuleType]?.action || cr?.action || 'replace';
            return <AnimatedToken key={t.id} token={t} isRedacted={redacted} action={action}
                accentColor={cr?.color} actionOverride={actionOverrides[t.id]} />;
        });

    const configPanelContent = (
        <>
            <div className="p-4 md:p-5 border-b border-[#2A2A2A] shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-[#FFA500]/10 border border-[#FFA500]/20"><Shield className="w-4 h-4 text-[#FFA500]" /></div>
                    <div>
                        <h2 className="text-sm font-semibold text-white">Redaction Rules</h2>
                        <p className="text-[10px] text-gray-500 font-mono mt-0.5">{activeRulesCount} active · {totalMatches} matches</p>
                    </div>
                </div>
                <button onClick={() => setIsDrawerOpen(false)} className="md:hidden p-1.5 text-gray-500 hover:text-white hover:bg-[#3B3B3B] rounded-lg transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2">
                <TemplateSelector />
                <ConfidenceSlider value={threshold} onChange={setThreshold} />
                {RULE_GROUPS.map((group) => {
                    const groupRules    = group.rules;
                    const activeInGroup = groupRules.filter(r => rules[r.id]?.isActive).length;
                    const matchInGroup  = groupRules.reduce((sum, r) => sum + tokens.filter(t => t.type === r.id).length, 0);
                    const isOpen        = openGroups[group.label] ?? true;
                    return (
                        <div key={group.label} className="rounded-xl border border-[#2A2A2A] overflow-hidden bg-[#181818]">
                            <button onClick={() => setOpenGroups(prev => ({ ...prev, [group.label]: !isOpen }))}
                                className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-[#1E1E1E] transition-colors cursor-pointer group">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1 rounded-md" style={{ backgroundColor: group.accent + '20', color: group.accent }}>{group.icon}</div>
                                    <span className="text-xs font-semibold text-white tracking-wide uppercase" style={{ letterSpacing: '0.06em' }}>{group.label}</span>
                                    <div className="flex items-center gap-1">
                                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold border" style={{ backgroundColor: group.accent + '15', color: group.accent, borderColor: group.accent + '30' }}>{activeInGroup}/{groupRules.length}</span>
                                        {matchInGroup > 0 && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-white/5 text-gray-400 border border-white/10">{matchInGroup}</span>}
                                    </div>
                                </div>
                                <ChevronDown className={`w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-all duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                            </button>
                            <div className={`transition-all duration-200 ease-in-out overflow-hidden ${isOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                <div className="px-2 pb-2 space-y-0.5">
                                    {groupRules.map((rule) => {
                                        const cfg = rules[rule.id]; if (!cfg) return null;
                                        const isActive   = cfg.isActive;
                                        const matchCount = tokens.filter(t => t.type === rule.id).length;
                                        return (
                                            <div key={rule.id} onClick={() => handleToggleRule(rule.id)}
                                                className={`flex items-center justify-between px-2.5 py-2 rounded-lg transition-all duration-150 cursor-pointer select-none ${isActive ? 'bg-white/[0.04] hover:bg-white/[0.07]' : 'hover:bg-white/[0.03]'}`}>
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="shrink-0" style={{ color: isActive ? rule.color : '#4B5563' }}>{rule.icon}</div>
                                                    <span className={`text-xs truncate ${isActive ? 'text-gray-200 font-medium' : 'text-gray-500'}`}>{rule.label}</span>
                                                    {isActive && matchCount > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0" style={{ backgroundColor: rule.color + '25', color: rule.color }}>{matchCount}</span>}
                                                </div>
                                                <div className={`relative w-8 h-4 rounded-full transition-all duration-200 shrink-0 ml-2 ${isActive ? '' : 'bg-[#2A2A2A]'}`} style={isActive ? { backgroundColor: rule.color + 'CC' } : {}}>
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
                <div className="rounded-xl border border-[#2A2A2A] overflow-hidden bg-[#181818]">
                    <button onClick={() => setCustomOpen(!customOpen)} className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-[#1E1E1E] transition-colors cursor-pointer group">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1 rounded-md bg-[#8B5CF6]/15" style={{ color: '#8B5CF6' }}><Hash className="w-3.5 h-3.5" /></div>
                            <span className="text-xs font-semibold text-white tracking-wide uppercase" style={{ letterSpacing: '0.06em' }}>Custom Regex</span>
                            {customRules.length > 0 && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold border bg-[#8B5CF6]/15 text-[#8B5CF6] border-[#8B5CF6]/30">{customRules.filter(r => r.isActive).length}/{customRules.length}</span>}
                        </div>
                        <ChevronDown className={`w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-all duration-200 ${customOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <div className={`transition-all duration-200 ease-in-out overflow-hidden ${customOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="px-2 pb-2 space-y-0.5">
                            {customRules.length === 0 && !addRuleOpen && <p className="text-[11px] text-gray-600 text-center py-3 italic">No custom rules yet.</p>}
                            {customRules.map(rule => {
                                const mc = tokens.filter(t => t.type === `custom_${rule.id}` || t.type === rule.id).length;
                                return (
                                    <div key={rule.id} className={`flex items-center justify-between px-2.5 py-2 rounded-lg transition-all duration-150 group ${rule.isActive ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]'}`}>
                                        <div className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer" onClick={() => toggleCustomRule(rule.id)}>
                                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: rule.color }} />
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1">
                                                    <span className={`text-xs truncate ${rule.isActive ? 'text-gray-200 font-medium' : 'text-gray-500'}`}>{rule.label}</span>
                                                    {rule.isActive && mc > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0" style={{ backgroundColor: rule.color + '25', color: rule.color }}>{mc}</span>}
                                                </div>
                                                <p className="text-[9px] text-gray-600 font-mono truncate">{rule.pattern}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 ml-2">
                                            <div onClick={() => toggleCustomRule(rule.id)} className={`relative w-8 h-4 rounded-full transition-all duration-200 cursor-pointer ${rule.isActive ? '' : 'bg-[#2A2A2A]'}`} style={rule.isActive ? { backgroundColor: rule.color + 'CC' } : {}}>
                                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-200 ${rule.isActive ? 'left-[18px]' : 'left-0.5'}`} />
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); removeCustomRule(rule.id); }} className="p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer rounded"><X className="w-3 h-3" /></button>
                                        </div>
                                    </div>
                                );
                            })}
                            {addRuleOpen ? (
                                <div className="mt-1 p-3 rounded-lg bg-[#1E1E1E] border border-[#3B3B3B] space-y-2.5">
                                    <input type="text" placeholder="Rule name" value={newRuleLabel} onChange={e => setNewRuleLabel(e.target.value)} className="w-full px-3 py-2 bg-[#141414] border border-[#3B3B3B] text-xs text-white rounded-lg placeholder:text-gray-600 focus:border-[#FFA500]/50 focus:outline-none" />
                                    <input type="text" placeholder="Regex pattern" value={newRulePattern} onChange={e => setNewRulePattern(e.target.value)} className="w-full px-3 py-2 bg-[#141414] border border-[#3B3B3B] text-xs text-white font-mono rounded-lg placeholder:text-gray-600 focus:border-[#FFA500]/50 focus:outline-none" />
                                    <div className="flex items-center gap-1.5">{PRESET_COLORS_LIST.map(c => <button key={c} onClick={() => setNewRuleColor(c)} className={`w-5 h-5 rounded-full transition-all cursor-pointer ${newRuleColor === c ? 'ring-2 ring-white ring-offset-1 ring-offset-[#1E1E1E] scale-110' : 'opacity-50 hover:opacity-100'}`} style={{ backgroundColor: c }} />)}</div>
                                    <div className="flex gap-2">
                                        <button onClick={handleAddRule} disabled={!newRuleLabel.trim() || !newRulePattern.trim()} className="flex-1 py-1.5 bg-[#FFA500] hover:bg-[#ffb733] text-black text-xs font-medium rounded-lg transition-colors disabled:opacity-40 cursor-pointer">Add Rule</button>
                                        <button onClick={() => { setAddRuleOpen(false); setNewRuleLabel(''); setNewRulePattern(''); }} className="px-3 py-1.5 text-gray-400 hover:text-white bg-[#2A2A2A] text-xs rounded-lg transition-colors cursor-pointer">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <button onClick={() => { setAddRuleOpen(true); setCustomOpen(true); }} className="w-full mt-1 py-2 flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-white bg-[#141414] hover:bg-[#1E1E1E] border border-dashed border-[#2A2A2A] hover:border-[#FFA500]/40 rounded-lg transition-all cursor-pointer">
                                    <span className="text-[#FFA500] text-base leading-none">+</span> Add Pattern
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#2A2A2A] bg-[#141414]">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${redactionFailed ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
                    <span className={`text-[10px] font-mono ${redactionFailed ? 'text-red-400' : 'text-gray-500'}`}>
                        {redactionFailed ? 'ENGINE OFFLINE' : `ENGINE ACTIVE · V3 · ${activeRulesCount} rules`}
                    </span>
                </div>
            </div>
        </>
    );

    return (
        <div className="w-full font-sans flex flex-col md:flex-row h-[calc(100vh-64px)] md:h-screen selection:bg-[#FFA500] selection:text-black relative">
            <section className="w-full md:w-[62%] lg:w-[68%] flex flex-col border-r border-[#2A2A2A] h-full">
                <header className="flex items-center justify-between px-4 py-3 bg-[#181818] border-b border-[#2A2A2A] shrink-0">
                    <div className="flex items-center gap-3">
                        <button className="p-1.5 -ml-1 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-[#2A2A2A] cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
                        <div>
                            <div className="flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5 text-[#FFA500]" />
                                <span className="text-sm font-medium text-white truncate max-w-[200px]">{fileName || 'Workspace.txt'}</span>
                            </div>
                            <span className="text-[10px] font-mono text-gray-600 hidden md:block">{isCanvas ? 'Canvas Redaction Layer' : 'Live Editable Buffer'}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 md:gap-2">
                        <input type="file" accept=".txt,.csv,.json,.md,.docx,.pdf,.png,.jpg,.jpeg,.webp" className="hidden" ref={fileInputRef} onChange={(e) => { if (e.target.files?.length) handleFileUpload(e.target.files[0]); }} />
                        <button onClick={handleClearWorkspace} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 text-gray-300 hover:text-white bg-[#252525] hover:bg-[#2A2A2A] px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border border-[#2A2A2A]">
                            <UploadCloud className="w-3.5 h-3.5" /><span className="hidden sm:inline">Load File</span>
                        </button>
                        {isCanvas && (
                            <button onClick={handleFaceRedaction} className="flex items-center gap-1.5 text-gray-300 hover:text-white bg-[#252525] hover:bg-purple-500/15 border border-[#2A2A2A] hover:border-purple-500/30 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer">
                                <ScanFace className="w-3.5 h-3.5" /><span className="hidden sm:inline">Faces</span>
                            </button>
                        )}
                        <button onClick={() => setSplitView(v => !v)}
                            className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${splitView ? 'text-[#FFA500] bg-[#FFA500]/10 border-[#FFA500]/30' : 'text-gray-500 bg-[#252525] border-[#2A2A2A] hover:text-gray-300'}`}>
                            <Columns2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">{splitView ? 'Split ✓' : 'Split'}</span>
                        </button>
                        <div className="w-px h-5 bg-[#2A2A2A] mx-1 hidden md:block" />
                        <button onClick={() => setHasReviewed(!hasReviewed)}
                            className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${hasReviewed ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' : 'text-gray-500 bg-[#252525] border-[#2A2A2A] hover:text-gray-300'}`}>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Reviewed
                        </button>
                        <div className="relative group">
                            <button onClick={handleExportClick} disabled={redactionFailed || !hasReviewed}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${redactionFailed || !hasReviewed ? 'bg-[#252525] text-gray-600 cursor-not-allowed border border-[#2A2A2A]' : 'bg-[#FFA500] hover:bg-[#ffb733] text-black cursor-pointer shadow-[0_0_12px_rgba(255,165,0,0.2)]'}`}>
                                <Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">Export</span>
                                {pdfPages.length > 1 && <Layers className="w-3 h-3 opacity-70" />}
                                <ChevronDown className="w-3 h-3 opacity-60" />
                            </button>
                            <div className="absolute top-full right-0 mt-1.5 w-28 bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 overflow-hidden p-1">
                                {(isCanvas ? ['pdf','png','jpg'] as const : ['docx','pdf','txt','md','csv','json'] as const).map(fmt => (
                                    <button key={fmt} disabled={redactionFailed || !hasReviewed}
                                        onClick={(e) => { e.stopPropagation(); (fileType === 'pdf' && pdfPages.length > 1) ? setShowExportModal(true) : exportSecureFile(fmt as any); }}
                                        className="block w-full text-left px-3 py-1.5 text-[11px] font-mono text-gray-400 hover:bg-[#2A2A2A] hover:text-white uppercase transition-colors disabled:opacity-40 rounded-lg">.{fmt}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Classifier banner */}
                {classifierBanner && (
                    <div className="flex items-center justify-between px-4 py-2 bg-blue-500/10 border-b border-blue-500/20 shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                            <span className="text-[11px] text-blue-300 font-mono">{classifierBanner}</span>
                        </div>
                        <button onClick={() => setClassifierBanner(null)} className="text-blue-400/60 hover:text-blue-300 cursor-pointer ml-3"><X className="w-3 h-3" /></button>
                    </div>
                )}
                {/* Language detection banner */}
                {languageBanner && (
                    <div className="flex items-center justify-between px-4 py-2 bg-orange-500/10 border-b border-orange-500/20 shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                            <span className="text-[11px] text-orange-300 font-mono">{languageBanner}</span>
                        </div>
                        <button onClick={() => setLanguageBanner(null)} className="text-orange-400/60 hover:text-orange-300 cursor-pointer ml-3">
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                )}
                <div className="bg-[#141414] border-b border-[#2A2A2A] px-4 py-1.5 flex items-center gap-3">
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap flex-1">
                        {Object.entries(tokens.reduce((acc, t) => { if (t.type !== 'text') acc[t.type] = (acc[t.type] || 0) + 1; return acc; }, {} as Record<string, number>)).slice(0, 6).map(([type, count]) => {
                            const isCustom = type.startsWith('custom_');
                            const label    = isCustom ? (customRules.find(r => `custom_${r.id}` === type)?.label || 'Custom') : type;
                            const color    = isCustom ? (customRules.find(r => `custom_${r.id}` === type)?.color || '#8B5CF6') : (ENTITY_COLORS[type] || '#6B7280');
                            return (
                                <div key={type} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1E1E1E] border border-[#2A2A2A] shrink-0">
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                                    <span className="text-[10px] font-medium text-gray-400">{count} {label}</span>
                                </div>
                            );
                        })}
                        {totalMatches === 0 && <span className="text-[10px] text-gray-600 font-mono italic">No entities detected</span>}
                        {approvedIds && <span className="text-[10px] text-emerald-400 font-mono border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 rounded-full">{approvedIds.size} approved</span>}
                    </div>
                    {fileType === 'pdf' && pdfPages.length > 1 && (
                        <div className="flex items-center gap-1.5 shrink-0 pl-3 border-l border-[#2A2A2A]">
                            <Layers className="w-3 h-3 text-gray-600" />
                            <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="p-0.5 text-gray-500 hover:text-white disabled:opacity-30 cursor-pointer rounded"><ChevronLeft className="w-3.5 h-3.5" /></button>
                            <span className="text-[10px] font-mono text-gray-400 min-w-[40px] text-center">{currentPage}/{pdfPages.length}</span>
                            <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === pdfPages.length} className="p-0.5 text-gray-500 hover:text-white disabled:opacity-30 cursor-pointer rounded"><ChevronRight className="w-3.5 h-3.5" /></button>
                            {pdfPages.length <= 8 && <div className="flex gap-0.5 ml-1">{pdfPages.map((_, i) => <button key={i} onClick={() => goToPage(i + 1)} className={`w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${currentPage === i + 1 ? 'bg-[#FFA500]' : 'bg-[#2A2A2A] hover:bg-gray-500'}`} />)}</div>}
                        </div>
                    )}
                </div>

                <div className={`flex-1 relative bg-[#1A1A1A] overflow-hidden ${isDragging ? 'bg-[#222]' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>
                    {isDragging && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#FFA500]/5 backdrop-blur-sm border-2 border-[#FFA500]/60 border-dashed">
                            <div className="flex flex-col items-center gap-3"><UploadCloud className="w-10 h-10 text-[#FFA500] animate-bounce" /><span className="text-base font-medium text-[#FFA500]">Drop to analyze</span></div>
                        </div>
                    )}
                    {redactionFailed && (
                        <div className="absolute top-0 left-0 right-0 z-50 flex items-center gap-2.5 px-4 py-2.5 bg-red-900/30 border-b border-red-500/20">
                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                            <div><p className="text-xs font-semibold text-red-400">Engine Offline</p><p className="text-[10px] text-red-400/60">Backend unreachable at localhost:8000.</p></div>
                        </div>
                    )}
                    {isLoading && (
                        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
                            <div className="relative">
                                <div className="w-14 h-14 border-4 border-[#FFA500]/10 border-t-[#FFA500] rounded-full animate-spin" />
                                <div className="absolute inset-0 flex items-center justify-center"><Activity className="w-5 h-5 text-[#FFA500]/60" /></div>
                            </div>
                            <h2 className="text-base font-semibold text-white mt-5 tracking-wide">{loaderInfo.title}</h2>
                            <p className="text-xs text-gray-500 mt-1.5 font-mono">{loaderInfo.sub}</p>
                        </div>
                    )}

                    {isCanvas && !splitView && <CanvasEngine />}
                    {isCanvas && splitView && (
                        <div className="flex h-full w-full">
                            <div className="flex-1 flex flex-col border-r border-[#2A2A2A] overflow-hidden min-w-0">
                                <div className="px-3 py-1.5 bg-[#111] border-b border-[#2A2A2A] shrink-0 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-500" /><span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Original</span>
                                </div>
                                <div className="flex-1 overflow-hidden relative">
                                    {useCanvasStore.getState().imageSrc ? (
                                        <img src={useCanvasStore.getState().imageSrc!} alt="Original" className="w-full h-full object-contain" />
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-gray-700 text-sm">No document loaded</div>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                                <div className="px-3 py-1.5 bg-[#111] border-b border-[#2A2A2A] shrink-0 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#FFA500] animate-pulse" /><span className="text-[10px] font-mono text-[#FFA500] uppercase tracking-wider">Redacted</span>
                                </div>
                                <div className="flex-1 overflow-hidden"><CanvasEngine /></div>
                            </div>
                        </div>
                    )}

                    {isTextDoc && !splitView && (
                        <div className="w-full h-full overflow-y-auto">
                            <div className="relative w-full max-w-3xl mx-auto min-h-full">
                                <div className="relative w-full p-6 md:p-10 pb-32">
                                    <div className="font-mono text-[13px] leading-[1.8] break-words whitespace-pre-wrap pointer-events-none w-full min-h-[500px]">
                                        {renderTokenStream(previewMode === 'redacted', effectiveTokens)}{'\n\n\n'}
                                    </div>
                                    {previewMode === 'original' && (
                                        <textarea value={rawText} onChange={e => setRawText(e.target.value)}
                                            className="absolute inset-6 md:inset-10 bottom-32 z-10 bg-transparent text-gray-400/60 font-mono text-[13px] leading-[1.8] resize-none outline-none border-0 p-0 m-0 focus:ring-0 whitespace-pre-wrap break-words overflow-hidden"
                                            spellCheck={false} placeholder="Paste raw text here or drop a file…" />
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {isTextDoc && splitView && (
                        <div className="flex h-full w-full">
                            <div className="flex-1 flex flex-col border-r border-[#2A2A2A] overflow-hidden min-w-0">
                                <div className="px-3 py-1.5 bg-[#111] border-b border-[#2A2A2A] shrink-0 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-500" /><span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Original</span>
                                </div>
                                <div className="flex-1 overflow-y-auto relative">
                                    <div className="p-5 pb-20 font-mono text-[13px] leading-[1.8] break-words whitespace-pre-wrap text-gray-300 min-h-full pointer-events-none select-none">
                                        {renderTokenStream(false, tokens)}{'\n\n\n'}
                                    </div>
                                    <textarea value={rawText} onChange={e => setRawText(e.target.value)}
                                        className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-white font-mono text-[13px] leading-[1.8] resize-none outline-none border-0 p-5 pb-20 focus:ring-0 whitespace-pre-wrap break-words"
                                        spellCheck={false} placeholder="" />
                                </div>
                            </div>
                            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                                <div className="px-3 py-1.5 bg-[#111] border-b border-[#2A2A2A] shrink-0 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#FFA500] animate-pulse" />
                                        <span className="text-[10px] font-mono text-[#FFA500] uppercase tracking-wider">Redacted Preview</span>
                                    </div>
                                    {approvedIds && <span className="text-[9px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">{approvedIds.size} approved</span>}
                                </div>
                                <div className="flex-1 overflow-y-auto">
                                    <div className="p-5 pb-20 font-mono text-[13px] leading-[1.8] break-words whitespace-pre-wrap min-h-full">
                                        {renderTokenStream(true, effectiveTokens)}{'\n\n\n'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {!isCanvas && !rawText && !isLoading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
                            <div className="p-4 rounded-2xl bg-[#1E1E1E] border border-[#2A2A2A]"><UploadCloud className="w-8 h-8 text-gray-600" /></div>
                            <div className="text-center">
                                <p className="text-sm text-gray-500 font-medium">Drop a file or click Load File</p>
                                <p className="text-xs text-gray-700 mt-1">Supports PDF, images, TXT, DOCX, CSV and more</p>
                            </div>
                        </div>
                    )}
                </div>

                {!splitView && (
                    <button onClick={() => setPreviewMode(previewMode === 'original' ? 'redacted' : 'original')}
                        className="absolute bottom-[4.5rem] md:bottom-6 right-4 md:right-6 z-30 flex items-center gap-2 bg-[#181818] hover:bg-[#222] text-white px-4 py-3 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.7)] border border-[#2A2A2A] transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer group">
                        {previewMode === 'original'
                            ? <><Shield className="w-4 h-4 text-[#FFA500]" /><span className="text-xs font-semibold">Lock Document</span></>
                            : <><Eye className="w-4 h-4 text-gray-400 group-hover:text-white" /><span className="text-xs font-semibold">Edit Original</span></>
                        }
                    </button>
                )}
            </section>

            <aside className="hidden md:flex md:w-[38%] lg:w-[32%] flex-col h-full bg-[#111111] border-l border-[#1E1E1E]">{configPanelContent}</aside>

            <button onClick={() => setIsDrawerOpen(true)} className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-2 py-3 bg-[#111]/95 backdrop-blur-md border-t border-[#1E1E1E] cursor-pointer" style={{ display: isDrawerOpen ? 'none' : undefined }}>
                <ChevronUp className="w-4 h-4 text-[#FFA500] animate-bounce" /><span className="text-xs font-medium text-white">Rules</span>
                {totalMatches > 0 && <span className="px-1.5 py-0.5 rounded-full bg-[#FFA500]/20 text-[#FFA500] text-[9px] font-mono border border-[#FFA500]/30">{totalMatches}</span>}
            </button>
            {isDrawerOpen && <div className="md:hidden fixed inset-0 z-40 bg-black/70" onClick={() => setIsDrawerOpen(false)} />}
            <div className={`md:hidden fixed left-0 right-0 bottom-0 z-50 bg-[#111111] border-t border-[#1E1E1E] rounded-t-2xl flex flex-col shadow-2xl transition-transform duration-300 ${isDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`} style={{ maxHeight: '85vh' }}>
                <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-8 h-1 rounded-full bg-[#2A2A2A]" /></div>
                {configPanelContent}
            </div>

            <ExportModal isOpen={showExportModal} totalPages={pdfPages.length || 1} currentPage={currentPage} onConfirm={handleModalConfirm} onCancel={() => { if (!isExporting) setShowExportModal(false); }} isExporting={isExporting} />
            <EntityReviewModal isOpen={showReviewModal} tokens={tokens} onConfirm={handleReviewConfirm} onCancel={() => setShowReviewModal(false)} />
            {isExporting && exportProgress && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
                    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl px-8 py-6 flex flex-col items-center gap-4 min-w-[280px]">
                        <div className="w-10 h-10 border-4 border-[#FFA500]/20 border-t-[#FFA500] rounded-full animate-spin" />
                        <div className="text-center">
                            <p className="text-sm font-semibold text-white">{exportProgress.status}</p>
                            <p className="text-[11px] text-gray-500 mt-1 font-mono">{exportProgress.current} / {exportProgress.total} pages</p>
                        </div>
                        <div className="w-full h-1.5 bg-[#2A2A2A] rounded-full overflow-hidden">
                            <div className="h-full bg-[#FFA500] rounded-full transition-all duration-300" style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

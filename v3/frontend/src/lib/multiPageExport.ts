/**
 * Ciphera V3 — Multi-Page Export Engine
 * =======================================
 * Handles exporting multiple PDF pages as a single compiled document.
 *
 * Flow for each selected page:
 *   1. Set canvas image to that page's dataUri
 *   2. Wait for ImageLayer to load + setImageDimensions
 *   3. Run OCR + shape mapping on that page
 *   4. Wait for shapes to be placed
 *   5. Capture the Konva stage as a dataUrl
 *   6. Collect all page dataUrls
 *   7. Combine into multi-page jsPDF and save
 */

import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { PdfPageData } from '@/lib/pdfRenderer';
import { RuleType, RuleConfig, CustomRule } from '@/store/documentStore';
import { useCanvasStore } from '@/store/canvasStore';
import { extractOcrData, mapOcrToShapes } from '@/lib/ocrEngine';

export interface MultiPageExportOptions {
    pages:        PdfPageData[];           // all rendered PDF pages
    selectedPages: number[];              // 1-indexed page numbers to export
    rules:        Record<RuleType, RuleConfig>;
    customRules:  CustomRule[];
    fileName:     string;
    format:       'pdf' | 'png';
    onProgress:   (current: number, total: number, status: string) => void;
}

/**
 * Main export function.
 * Renders each selected page, applies OCR + redaction, captures it,
 * then combines all captures into one file.
 */
export async function exportMultiplePages(opts: MultiPageExportOptions): Promise<void> {
    const {
        pages, selectedPages, rules, customRules,
        fileName, format, onProgress,
    } = opts;

    const capturedPages: { pageNum: number; dataUrl: string; width: number; height: number }[] = [];
    const total = selectedPages.length;

    for (let i = 0; i < selectedPages.length; i++) {
        const pageNum  = selectedPages[i];
        const pageData = pages[pageNum - 1];
        if (!pageData) continue;

        onProgress(i + 1, total, `Processing page ${pageNum} of ${pages.length}…`);

        // ── Step 1: Load this page's image into the canvas ───────────────────
        useCanvasStore.getState().setImageSrc(pageData.dataUri);
        useCanvasStore.getState().setShapes([]);
        useCanvasStore.getState().setOcrResult(null);

        // ── Step 2: Wait for ImageLayer to set imageDimensions ───────────────
        // ImageLayer fires setImageDimensions after useImage() loads.
        // We poll until it's non-null and matches this page's dimensions.
        await waitForImageDimensions(pageData.width, pageData.height);

        // ── Step 3: OCR + shape mapping ──────────────────────────────────────
        try {
            const ocrData = await extractOcrData(pageData.dataUri);
            useCanvasStore.getState().setOcrResult(ocrData);
            const autoShapes = await mapOcrToShapes(ocrData, rules, customRules);
            useCanvasStore.getState().setShapes(autoShapes);
        } catch (e) {
            console.warn(`OCR failed for page ${pageNum}, exporting without text redaction:`, e);
        }

        // ── Step 4: Wait for stage to render shapes ──────────────────────────
        // Give Konva one animation frame to paint the shapes
        await new Promise(r => requestAnimationFrame(r));
        await sleep(150);  // extra buffer for complex pages

        // ── Step 5: Capture the stage ─────────────────────────────────────────
        const dataUrl = await captureStage(pageData.width, pageData.height);
        if (!dataUrl) {
            console.warn(`Could not capture stage for page ${pageNum}`);
            continue;
        }

        capturedPages.push({ pageNum, dataUrl, width: pageData.width, height: pageData.height });
    }

    if (capturedPages.length === 0) {
        throw new Error('No pages were captured for export.');
    }

    onProgress(total, total, 'Compiling document…');

    // ── Step 6: Combine into output file ─────────────────────────────────────
    const baseName = fileName.includes('.')
        ? fileName.slice(0, fileName.lastIndexOf('.'))
        : fileName;

    if (format === 'pdf') {
        await buildMultiPagePDF(capturedPages, `${baseName}_Secure.pdf`);
    } else {
        await buildPngZip(capturedPages, `${baseName}_Secure_Pages.zip`);
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

/**
 * Polls until the canvas store's imageDimensions matches the expected size.
 * This ensures ImageLayer has finished loading before we OCR/capture.
 */
async function waitForImageDimensions(
    expectedW: number,
    expectedH: number,
    timeoutMs = 8000,
): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const dims = useCanvasStore.getState().imageDimensions;
        // Allow ±2px tolerance for rendering scale differences
        if (dims && Math.abs(dims.width - expectedW) < 3 && Math.abs(dims.height - expectedH) < 3) return;
        // Also accept if dims exist and image is loaded (some pages may render at 2× scale)
        if (dims && dims.width > 0 && dims.height > 0) return;
        await sleep(80);
    }
    // Timeout — continue anyway, OCR may still work
    console.warn('waitForImageDimensions timed out');
}

/**
 * Captures the current Konva stage as a PNG dataUrl.
 * Temporarily resets scale/position for pixel-perfect capture.
 */
async function captureStage(imgW: number, imgH: number): Promise<string | null> {
    // Retry a few times — stage may not be ready immediately
    for (let attempt = 0; attempt < 5; attempt++) {
        const stage = useCanvasStore.getState().stageRef;
        if (stage) {
            const origScale = stage.scaleX();
            const origPos   = stage.position();

            stage.scale({ x: 1, y: 1 });
            stage.position({ x: 0, y: 0 });

            const dataUrl = stage.toDataURL({
                x: 0, y: 0,
                width:      imgW || stage.width(),
                height:     imgH || stage.height(),
                pixelRatio: 1.0,
            });

            // Restore
            stage.scale({ x: origScale, y: origScale });
            stage.position(origPos);

            return dataUrl;
        }
        await sleep(100);
    }
    return null;
}

/**
 * Combines captured page images into a single multi-page PDF.
 * Each page gets its own PDF page sized to match the image dimensions.
 */
async function buildMultiPagePDF(
    pages: { pageNum: number; dataUrl: string; width: number; height: number }[],
    fileName: string,
): Promise<void> {
    if (pages.length === 0) return;

    const first = pages[0];
    const pdf   = new jsPDF({
        orientation: first.width > first.height ? 'landscape' : 'portrait',
        unit:        'px',
        format:      [first.width, first.height],
    });

    pdf.setDocumentProperties({
        title:    'Redacted Document',
        subject:  'Sanitized by Ciphera V3',
        author:   '',
        keywords: '',
        creator:  'Ciphera',
    });

    for (let i = 0; i < pages.length; i++) {
        const pg = pages[i];

        if (i > 0) {
            // Add a new page sized for this page's dimensions
            pdf.addPage([pg.width, pg.height], pg.width > pg.height ? 'landscape' : 'portrait');
        }

        // Load image to get actual dimensions
        const img = await loadImage(pg.dataUrl);
        pdf.addImage(pg.dataUrl, 'PNG', 0, 0, img.width, img.height);
    }

    pdf.save(fileName);
}

/**
 * For PNG format: zip all page images into a single archive.
 */
async function buildPngZip(
    pages: { pageNum: number; dataUrl: string; width: number; height: number }[],
    fileName: string,
): Promise<void> {
    const zip = new JSZip();

    for (const pg of pages) {
        // Convert dataUrl to binary
        const base64 = pg.dataUrl.split(',')[1];
        zip.file(`page_${String(pg.pageNum).padStart(3, '0')}.png`, base64, { base64: true });
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    triggerDownload(blob, fileName);
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = reject;
        img.src     = src;
    });
}

function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
import { createWorker } from 'tesseract.js';
import { RuleType } from '@/store/documentStore';
import { redactionEngine } from './redactionEngine';
import { ShapeType, RedactionShape } from '@/store/canvasStore';

export interface OcrWord {
    text: string;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    startIndex: number;
    endIndex: number;
    confidence: number;
    symbols?: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[];
}

export interface OcrResult {
    rawText:  string;
    words:    OcrWord[];
    imageWidth:  number;
    imageHeight: number;
}

/**
 * Tesseract OCR — extracts text + word-level bounding boxes.
 * Also stores image dimensions so mapOcrToShapes can scale boxes correctly.
 */
export async function extractOcrData(imageUrl: string): Promise<OcrResult> {
    // Get actual image dimensions before OCR
    const dims = await getImageDimensions(imageUrl);

    const worker = await createWorker('eng', 1, {
        logger: () => {},  // suppress verbose logs
    });

    // Boost accuracy: use LSTM engine with best mode
    await (worker as any).setParameters({
        tessedit_ocr_engine_mode: '1',        // LSTM only
        preserve_interword_spaces: '1',
    });

    const ret = await worker.recognize(imageUrl, {}, { blocks: true });
    await worker.terminate();

    const wordsData: any[] = [];
    if (ret.data.blocks) {
        for (const block of ret.data.blocks) {
            for (const para of block.paragraphs || []) {
                for (const line of para.lines || []) {
                    for (const word of line.words || []) {
                        wordsData.push(word);
                    }
                }
            }
        }
    }

    const words: OcrWord[] = [];
    let currentString = "";

    for (let i = 0; i < wordsData.length; i++) {
        const w          = wordsData[i];
        const startIndex = currentString.length;
        const spacer     = i === wordsData.length - 1 ? "" : " ";

        words.push({
            text:       w.text,
            bbox:       w.bbox,
            startIndex,
            endIndex:   startIndex + w.text.length,
            confidence: w.confidence ?? 0,
            symbols:    w.symbols ? w.symbols.map((s: any) => ({ text: s.text, bbox: s.bbox })) : undefined,
        });

        currentString += w.text + spacer;
    }

    return {
        rawText:     currentString,
        words,
        imageWidth:  dims.width,
        imageHeight: dims.height,
    };
}

function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = url;
    });
}

/**
 * Maps V3 entity tokens → canvas RedactionShape bounding boxes with high precision.
 * Features:
 * - Sub-word character slicing: redacts only the sensitive characters (e.g. ignores "Label:").
 * - Multi-segment row grouping: doesn't blackout unrelated gaps between distant words on the same line.
 * - Disciplined padding: avoids bleeding into lines above and below.
 */
export async function mapOcrToShapes(
    ocrResult:    OcrResult,
    activeRules:  Record<RuleType, any>,
    customRules:  import('@/store/documentStore').CustomRule[] = [],
    threshold:    number = 0.50,
    languageMode: 'english' | 'hindi' | 'mixed' = 'english',
): Promise<RedactionShape[]> {
    if (!ocrResult.rawText.trim()) return [];

    const result = await redactionEngine.tokenize(
        ocrResult.rawText, activeRules, customRules, threshold, false, false, undefined, languageMode
    );
    const tokens = result.tokens;

    const shapes: RedactionShape[] = [];
    let cursor = 0;

    for (const token of tokens) {
        if (token.type !== 'text') {
            const tokenStart = cursor;
            const tokenEnd   = cursor + token.value.length;

            const intersecting = ocrResult.words.filter(
                w => w.startIndex < tokenEnd && w.endIndex > tokenStart
            );

            if (intersecting.length > 0) {
                // Compute exact sub-bounding boxes for each intersecting word
                const wordBBoxes = intersecting.map(w => {
                    const charStart = Math.max(0, tokenStart - w.startIndex);
                    const charEnd   = Math.min(w.text.length, tokenEnd - w.startIndex);

                    // If full word is covered, use word bbox
                    if (charStart <= 0 && charEnd >= w.text.length) {
                        return { ...w.bbox };
                    }

                    // Use character symbols if available
                    if (w.symbols && w.symbols.length === w.text.length && charEnd > charStart) {
                        const symSlice = w.symbols.slice(charStart, charEnd);
                        if (symSlice.length > 0) {
                            return {
                                x0: Math.min(...symSlice.map(s => s.bbox.x0)),
                                y0: Math.min(...symSlice.map(s => s.bbox.y0)),
                                x1: Math.max(...symSlice.map(s => s.bbox.x1)),
                                y1: Math.max(...symSlice.map(s => s.bbox.y1)),
                            };
                        }
                    }

                    // Fallback to linear horizontal interpolation
                    const frac0 = charStart / Math.max(1, w.text.length);
                    const frac1 = charEnd   / Math.max(1, w.text.length);
                    const width = w.bbox.x1 - w.bbox.x0;
                    return {
                        x0: Math.round(w.bbox.x0 + width * frac0),
                        y0: w.bbox.y0,
                        x1: Math.round(w.bbox.x0 + width * frac1),
                        y1: w.bbox.y1,
                    };
                });

                // Group boxes into visual lines by vertical overlap
                const rows: { x0: number; y0: number; x1: number; y1: number }[][] = [];
                for (const bbox of wordBBoxes) {
                    let placed = false;
                    for (const row of rows) {
                        const ref        = row[0];
                        const overlapTop = Math.max(bbox.y0, ref.y0);
                        const overlapBot = Math.min(bbox.y1, ref.y1);
                        const overlap    = Math.max(0, overlapBot - overlapTop);
                        const minH       = Math.min(bbox.y1 - bbox.y0, ref.y1 - ref.y0);
                        if (minH > 0 && overlap > minH * 0.45) {
                            row.push(bbox);
                            placed = true;
                            break;
                        }
                    }
                    if (!placed) rows.push([bbox]);
                }

                for (const row of rows) {
                    // Sort items horizontally
                    row.sort((a, b) => a.x0 - b.x0);

                    // Segment row if there are large gaps between words
                    const segments: { x0: number; y0: number; x1: number; y1: number }[][] = [];
                    let currentSegment = [row[0]];

                    for (let i = 1; i < row.length; i++) {
                        const prev = row[i - 1];
                        const curr = row[i];
                        const rowH = Math.max(prev.y1 - prev.y0, curr.y1 - curr.y0);
                        // If gap between words exceeds 2x line height, break into separate boxes
                        if (curr.x0 - prev.x1 > Math.max(rowH * 2.0, 35)) {
                            segments.push(currentSegment);
                            currentSegment = [curr];
                        } else {
                            currentSegment.push(curr);
                        }
                    }
                    segments.push(currentSegment);

                    for (const seg of segments) {
                        const rMinX = Math.min(...seg.map(b => b.x0));
                        const rMinY = Math.min(...seg.map(b => b.y0));
                        const rMaxX = Math.max(...seg.map(b => b.x1));
                        const rMaxY = Math.max(...seg.map(b => b.y1));

                        const rowH = rMaxY - rMinY;

                        // Disciplined padding: tight vertical padding prevents bleeding into adjacent lines
                        const padX = Math.min(4, Math.max(1, Math.round(rowH * 0.08)));
                        const padY = Math.min(3, Math.max(1, Math.round(rowH * 0.05)));

                        shapes.push({
                            id:       `auto_${token.type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                            type:     'blackout',
                            x:        rMinX - padX,
                            y:        rMinY - padY,
                            width:    (rMaxX - rMinX) + padX * 2,
                            height:   rowH + padY * 2,
                            ruleType: token.type,
                        });
                    }
                }
            }
        }
        cursor += token.value.length;
    }

    return shapes;
}

/**
 * Removes only the auto shapes belonging to a specific rule type.
 * Called when user toggles a rule OFF — avoids re-running full OCR.
 */
export function removeShapesByRule(
    shapes:   RedactionShape[],
    ruleType: string,
): RedactionShape[] {
    return shapes.filter(s => {
        // Keep if: manually drawn (no ruleType tag), or belongs to a DIFFERENT rule
        return !s.ruleType || s.ruleType !== ruleType;
    });
}

/**
 * Returns only the auto shapes belonging to a specific rule type.
 */
export function getShapesByRule(
    shapes:   RedactionShape[],
    ruleType: string,
): RedactionShape[] {
    return shapes.filter(s => s.ruleType === ruleType);
}
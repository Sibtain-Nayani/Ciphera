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
 * Maps V3 entity tokens → canvas RedactionShape bounding boxes.
 *
 * FIX for toggle lag: shapes are tagged with their ruleType so the
 * caller can remove only the shapes belonging to a toggled-off rule
 * without re-running the full OCR pipeline.
 *
 * Improvement for small entities: padding is now proportional to
 * the entity height rather than a fixed 4px, so small printed text
 * (e.g. Aadhaar numbers in a 6pt font) still gets covered fully.
 */
export async function mapOcrToShapes(
    ocrResult:   OcrResult,
    activeRules: Record<RuleType, any>,
    customRules: import('@/store/documentStore').CustomRule[] = [],
): Promise<RedactionShape[]> {
    if (!ocrResult.rawText.trim()) return [];

    const result = await redactionEngine.tokenize(ocrResult.rawText, activeRules, customRules);
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
                // Group words into visual rows by vertical overlap
                const rows: OcrWord[][] = [];
                for (const word of intersecting) {
                    let placed = false;
                    for (const row of rows) {
                        const ref         = row[0];
                        const overlapTop  = Math.max(word.bbox.y0, ref.bbox.y0);
                        const overlapBot  = Math.min(word.bbox.y1, ref.bbox.y1);
                        const overlap     = Math.max(0, overlapBot - overlapTop);
                        const minH        = Math.min(
                            word.bbox.y1 - word.bbox.y0,
                            ref.bbox.y1  - ref.bbox.y0,
                        );
                        if (minH > 0 && overlap > minH * 0.4) {  // 40% overlap threshold (was 50%)
                            row.push(word); placed = true; break;
                        }
                    }
                    if (!placed) rows.push([word]);
                }

                for (const row of rows) {
                    const rMinX = Math.min(...row.map(w => w.bbox.x0));
                    const rMinY = Math.min(...row.map(w => w.bbox.y0));
                    const rMaxX = Math.max(...row.map(w => w.bbox.x1));
                    const rMaxY = Math.max(...row.map(w => w.bbox.y1));

                    const rowH = rMaxY - rMinY;

                    // Proportional padding: 15% of row height, min 3px, max 12px
                    // This ensures tiny text gets covered fully
                    const pad = Math.min(12, Math.max(3, Math.round(rowH * 0.15)));

                    shapes.push({
                        id:     `auto_${token.type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                        type:   'blackout',
                        x:      rMinX - pad,
                        y:      rMinY - pad,
                        width:  (rMaxX - rMinX) + pad * 2,
                        height: rowH + pad * 2,
                        // Store the rule type so toggle-off can surgically remove only these shapes
                        ruleType: token.type,
                    } as any);
                }
            }
        }
        cursor += token.value.length;

        // Account for the space separator between OCR words
        // (OCR text joins words with single spaces)
        if (token.type === 'text' && token.value.endsWith(' ')) {
            // already included in token.value length
        }
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
        const s_ = s as any;
        // Keep if: manually drawn (no ruleType tag), or belongs to a DIFFERENT rule
        return !s_.ruleType || s_.ruleType !== ruleType;
    });
}

/**
 * Returns only the auto shapes belonging to a specific rule type.
 */
export function getShapesByRule(
    shapes:   RedactionShape[],
    ruleType: string,
): RedactionShape[] {
    return shapes.filter(s => (s as any).ruleType === ruleType);
}
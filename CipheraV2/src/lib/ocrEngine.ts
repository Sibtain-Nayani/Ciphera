import { createWorker } from 'tesseract.js';
import { RuleType } from '@/store/documentStore';
import { redactionEngine } from './redactionEngine';
import { ShapeType, RedactionShape } from '@/store/canvasStore';

export interface OcrWord {
    text: string;
    bbox: {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
    };
    startIndex: number;
    endIndex: number;
}

export interface OcrResult {
    rawText: string;
    words: OcrWord[];
}

/**
 * Initializes tesseract.js worker, extracts text and word-level bounding boxes from an image.
 */
export async function extractOcrData(imageUrl: string): Promise<OcrResult> {
    const worker = await createWorker('eng');
    const ret = await worker.recognize(imageUrl, {}, { blocks: true });
    await worker.terminate();

    // Flatten words from the deeply nested structure in v5
    const wordsData: any[] = [];
    if (ret.data.blocks) {
        ret.data.blocks.forEach(block => {
            if (block.paragraphs) {
                block.paragraphs.forEach(paragraph => {
                    if (paragraph.lines) {
                        paragraph.lines.forEach(line => {
                            if (line.words) {
                                wordsData.push(...line.words);
                            }
                        });
                    }
                });
            }
        });
    }

    const words: OcrWord[] = [];
    let currentString = "";

    // Reconstruct the text exactly as we build the index map
    for (let i = 0; i < wordsData.length; i++) {
        const w = wordsData[i];
        const startIndex = currentString.length;
        const textToAppend = w.text + (i === wordsData.length - 1 ? "" : " ");

        words.push({
            text: w.text,
            bbox: w.bbox,
            startIndex: startIndex,
            endIndex: startIndex + w.text.length
        });

        currentString += textToAppend;
    }

    return {
        rawText: currentString,
        words
    };
}

/**
 * Feeds OCR text to Presidio, then maps the returned sensitive tokens
 * back to the spatial bounding boxes to generate Canvas shapes.
 */
export async function mapOcrToShapes(
    ocrResult: OcrResult,
    activeRules: Record<RuleType, any>
): Promise<RedactionShape[]> {
    if (!ocrResult.rawText.trim()) {
        return [];
    }

    // 2. Ping FastAPI Presidio
    // We reuse our existing tokenization pipeline
    // Custom rules are not passed here—OCR only uses built-in rules for spatial mapping.
    const result = await redactionEngine.tokenize(ocrResult.rawText, activeRules, []);
    const tokens = result.tokens;

    // 3. Map Sensitive Tokens back to Bounding Boxes
    const shapes: RedactionShape[] = [];
    let currentTextOffset = 0;

    for (const token of tokens) {
        if (token.type !== 'text') { // This is a sensitive token (e.g. 'email', 'ssn')
            const tokenStart = currentTextOffset;
            const tokenEnd = currentTextOffset + token.value.length;

            // Find all OCR words that intersect with this token's character indices
            const intersectingWords = ocrResult.words.filter(w =>
                (w.startIndex < tokenEnd && w.endIndex > tokenStart)
            );

            if (intersectingWords.length > 0) {
                // ── Row-grouping via vertical overlap detection ──
                // Words on the same visual line share significant Y overlap.
                // Grouping prevents a single giant box when an entity wraps across lines.
                const rows: OcrWord[][] = [];

                for (const word of intersectingWords) {
                    let placed = false;
                    for (const row of rows) {
                        const ref = row[0];
                        const overlapTop = Math.max(word.bbox.y0, ref.bbox.y0);
                        const overlapBottom = Math.min(word.bbox.y1, ref.bbox.y1);
                        const overlap = Math.max(0, overlapBottom - overlapTop);
                        const minHeight = Math.min(
                            word.bbox.y1 - word.bbox.y0,
                            ref.bbox.y1 - ref.bbox.y0
                        );
                        // >50% vertical overlap means same visual row
                        if (minHeight > 0 && overlap > minHeight * 0.5) {
                            row.push(word);
                            placed = true;
                            break;
                        }
                    }
                    if (!placed) rows.push([word]);
                }

                // Emit one tight bounding box per row
                const padding = 4;
                for (const row of rows) {
                    const rMinX = Math.min(...row.map(w => w.bbox.x0));
                    const rMinY = Math.min(...row.map(w => w.bbox.y0));
                    const rMaxX = Math.max(...row.map(w => w.bbox.x1));
                    const rMaxY = Math.max(...row.map(w => w.bbox.y1));

                    shapes.push({
                        id: `auto_${Date.now()}_${Math.random().toString(36).substring(7)}_${rows.indexOf(row)}`,
                        type: 'blackout',
                        x: rMinX - padding,
                        y: rMinY - padding,
                        width: (rMaxX - rMinX) + (padding * 2),
                        height: (rMaxY - rMinY) + (padding * 2),
                    });
                }
            }
        }
        currentTextOffset += token.value.length;
    }

    return shapes;
}

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
    const ret = await worker.recognize(imageUrl);
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
    const tokens = await redactionEngine.tokenize(ocrResult.rawText, activeRules);

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
                // Combine bounding boxes of all intersecting words to form one large box
                const minX = Math.min(...intersectingWords.map(w => w.bbox.x0));
                const minY = Math.min(...intersectingWords.map(w => w.bbox.y0));
                const maxX = Math.max(...intersectingWords.map(w => w.bbox.x1));
                const maxY = Math.max(...intersectingWords.map(w => w.bbox.y1));

                // Add padding
                const padding = 4;

                shapes.push({
                    id: `auto_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                    type: 'blackout',
                    x: minX - padding,
                    y: minY - padding,
                    width: (maxX - minX) + (padding * 2),
                    height: (maxY - minY) + (padding * 2)
                });
            }
        }
        currentTextOffset += token.value.length;
    }

    return shapes;
}

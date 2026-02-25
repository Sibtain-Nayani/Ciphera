import { createWorker } from 'tesseract.js';
import fs from 'fs';

async function test() {
    const worker = await createWorker('eng');
    console.log("Analyzing...");
    const ret = await worker.recognize('test_document_1772048790398.png');

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

    let currentString = "";
    const words: any[] = [];

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

    console.log("Extracted words:", words.length);
    console.log("Raw text snippet:", currentString.slice(0, 100));
    console.log("Sample BBox:", words[0]?.bbox);

    await worker.terminate();
}

test().catch(console.error);

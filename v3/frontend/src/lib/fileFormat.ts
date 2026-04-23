import * as mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import jsPDF from 'jspdf';
import { DocumentState } from '@/store/documentStore';
import { RedactionShape } from '@/store/canvasStore';

export type FileExtractionResult = {
    text: string;
    type: DocumentState['fileType'];
    name: string;
};

/**
 * Exports the Konva canvas as a downloadable file.
 *
 * For PDF/PNG/JPG: uses visual flattening — the canvas snapshot (already containing
 * all redaction boxes) is embedded into the output file. Text under boxes cannot
 * be selected or recovered.
 *
 * The stageRef from the store can be null if the component just re-rendered.
 * This function accepts the stage directly from the caller to avoid that race.
 */
export async function exportVisualCanvas(
    dataUrl:          string,
    originalFileName: string,
    targetFormat:     'pdf' | 'png' | 'jpg' | string,
    originalFile?:    File | null,
    shapes?:          RedactionShape[],
    canvasDims?:      { width: number; height: number },
) {
    const baseName  = originalFileName.includes('.')
        ? originalFileName.slice(0, originalFileName.lastIndexOf('.'))
        : originalFileName;
    const finalName = `${baseName}_Secure.${targetFormat}`;

    if (targetFormat === 'pdf') {
        const img = new Image();
        img.src   = dataUrl;

        await new Promise<void>((resolve, reject) => {
            img.onload  = () => resolve();
            img.onerror = () => reject(new Error('Canvas image load failed'));
        });

        const pdf = new jsPDF({
            orientation: img.width > img.height ? 'landscape' : 'portrait',
            unit:        'px',
            format:      [img.width, img.height],
        });

        pdf.setDocumentProperties({
            title: 'Redacted Document', subject: 'Sanitized by Ciphera V3',
            author: '', keywords: '', creator: 'Ciphera',
        });

        pdf.addImage(dataUrl, 'PNG', 0, 0, img.width, img.height);
        pdf.save(finalName);
        return;
    }

    // PNG / JPG — direct download of the data URL
    const a    = document.createElement('a');
    a.href     = dataUrl;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

export async function extractTextFromFile(file: File): Promise<FileExtractionResult> {
    const fileName = file.name;
    const ext      = fileName.split('.').pop()?.toLowerCase();

    let fileType: DocumentState['fileType'] = 'txt';
    if (ext === 'csv')  fileType = 'csv';
    if (ext === 'json') fileType = 'json';
    if (ext === 'md')   fileType = 'md';
    if (ext === 'docx') fileType = 'docx';
    if (ext === 'pdf')  fileType = 'pdf';
    if (['png','jpg','jpeg','webp'].includes(ext || '')) fileType = 'image';

    if (fileType === 'pdf' || fileType === 'image') {
        throw new Error('Visual formats must be handled by the Canvas Engine.');
    }

    if (fileType === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result      = await mammoth.extractRawText({ arrayBuffer });
        return { text: result.value, type: fileType, name: fileName };
    }

    const text = await file.text();
    return { text, type: fileType, name: fileName };
}

export async function exportRedactedText(
    redactedText:     string,
    originalFileName: string,
    targetFormat:     'txt' | 'csv' | 'json' | 'md' | 'docx' | 'pdf',
) {
    const baseName  = originalFileName.includes('.')
        ? originalFileName.slice(0, originalFileName.lastIndexOf('.'))
        : originalFileName;
    const finalName = `${baseName}_Secure.${targetFormat}`;

    if (targetFormat === 'docx') {
        const doc = new Document({
            sections: [{
                properties: {},
                children: redactedText.split('\n').map(line =>
                    new Paragraph({ children: [new TextRun(line)] })
                ),
            }],
        });
        const blob = await Packer.toBlob(doc);
        triggerDownload(blob, finalName);
        return;
    }

    if (targetFormat === 'pdf') {
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
        pdf.setDocumentProperties({
            title: 'Redacted Document', subject: 'Sanitized by Ciphera V3',
            author: '', keywords: '', creator: 'Ciphera',
        });
        const lines = pdf.splitTextToSize(redactedText, 532);
        pdf.text(lines, 40, 40);
        pdf.save(finalName);
        return;
    }

    const blob = new Blob([redactedText], { type: 'text/plain' });
    triggerDownload(blob, finalName);
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
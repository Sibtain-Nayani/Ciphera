import * as mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import jsPDF from 'jspdf';
import { DocumentState } from '@/store/documentStore';

export type FileExtractionResult = {
    text: string;
    type: DocumentState['fileType'];
    name: string;
};

/**
 * Packages a base64 Data URL (from the Konva Canvas Engine) into a downloadable file.
 */
export async function exportVisualCanvas(
    dataUrl: string,
    originalFileName: string,
    targetFormat: 'pdf' | 'png' | 'jpg' | string
) {
    const baseName = originalFileName.includes('.')
        ? originalFileName.slice(0, originalFileName.lastIndexOf('.'))
        : originalFileName;

    const finalName = `${baseName}_Secure.${targetFormat}`;

    if (targetFormat === 'pdf') {
        const img = new Image();
        img.src = dataUrl;

        await new Promise((resolve) => {
            img.onload = resolve;
        });

        // Create PDF that matches the image dimensions exactly
        const pdf = new jsPDF({
            orientation: img.width > img.height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [img.width, img.height]
        });

        pdf.addImage(dataUrl, 'PNG', 0, 0, img.width, img.height);
        pdf.save(finalName);
        return;
    }

    // Default: Download as Image
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

/**
 * Universal file reading utility that extracts raw text from various document formats.
 */
export async function extractTextFromFile(file: File): Promise<FileExtractionResult> {
    const fileName = file.name;
    const ext = fileName.split('.').pop()?.toLowerCase();

    // Determine strict internal type
    let fileType: DocumentState['fileType'] = 'txt';
    if (ext === 'csv') fileType = 'csv';
    if (ext === 'json') fileType = 'json';
    if (ext === 'md') fileType = 'md';
    if (ext === 'docx') fileType = 'docx';
    if (['pdf'].includes(ext || '')) fileType = 'pdf';
    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext || '')) fileType = 'image';

    // If it's a visual document, we don't extract text here; the canvas engine handles it.
    if (fileType === 'pdf' || fileType === 'image') {
        throw new Error('Visual formats (PDF/Image) must be handled by the Canvas Engine.');
    }

    // DOCX requires Mammoth to extract raw text from XML
    if (fileType === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return {
            text: result.value,
            type: fileType,
            name: fileName
        };
    }

    // Default to plain text parsing for TXT, CSV, JSON, MD
    const text = await file.text();
    return {
        text,
        type: fileType,
        name: fileName
    };
}

/**
 * Universal file exporting utility to package redacted text back into various formats.
 */
export async function exportRedactedText(
    redactedText: string,
    originalFileName: string,
    targetFormat: 'txt' | 'csv' | 'json' | 'md' | 'docx' | 'pdf'
) {
    const baseName = originalFileName.includes('.')
        ? originalFileName.slice(0, originalFileName.lastIndexOf('.'))
        : originalFileName;

    const finalName = `${baseName}_Secure.${targetFormat}`;

    if (targetFormat === 'docx') {
        // Generate a new DOCX file containing the redacted text
        const doc = new Document({
            sections: [{
                properties: {},
                children: redactedText.split('\n').map(line =>
                    new Paragraph({
                        children: [new TextRun(line)],
                    })
                ),
            }],
        });

        const blob = await Packer.toBlob(doc);
        triggerDownload(blob, finalName);
        return;
    }

    if (targetFormat === 'pdf') {
        // Generate a basic PDF document
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'pt',
            format: 'letter'
        });

        // Add text with wrapping. Standard letter width is 612pt. Margin 40pt each side = 532pt
        const lines = pdf.splitTextToSize(redactedText, 532);
        pdf.text(lines, 40, 40);
        pdf.save(finalName);
        return;
    }

    // Default Raw Blob (txt, csv, json, md)
    const blob = new Blob([redactedText], { type: 'text/plain' });
    triggerDownload(blob, finalName);
}

function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

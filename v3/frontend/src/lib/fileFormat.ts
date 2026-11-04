import * as mammoth from 'mammoth';
import { DocumentState } from '@/store/documentStore';

export type FileExtractionResult = {
    text: string;
    type: DocumentState['fileType'];
    name: string;
};

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
